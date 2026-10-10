# -*- coding: utf-8 -*-
"""영양제 알림 — 컴퓨터를 쓰는 동안 영양제 복용 시간을 놓치지 않게 해주는 데스크톱 앱.

- 정해진 시간이 되면 화면 맨 위에 알림창이 뜨고, [먹었어요]를 누를 때까지 사라지지 않습니다.
- 컴퓨터가 꺼져 있어 놓친 알림은 켜는 즉시 다시 알려줍니다.
- 외부 패키지 없이 파이썬 기본 라이브러리(tkinter)만 사용합니다.
"""
import base64
import ctypes
import datetime as dt
import json
import os
import socket
import subprocess
import sys
import threading
import time
import traceback
import uuid
import tkinter as tk
from tkinter import messagebox, ttk

try:
    import winsound
except ImportError:
    winsound = None

APP_NAME = "영양제 알림"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.environ.get("SUPPLEMENT_DATA") or os.path.join(BASE_DIR, "data.json")
ERROR_LOG = os.path.join(BASE_DIR, "error.log")
IPC_PORT = 47651
FONT = "맑은 고딕"
DAY_FMT = "%Y-%m-%d"
WEEKDAYS = "월화수목금토일"
LOG_KEEP_DAYS = 120
STARTUP_LNK = os.path.join(
    os.environ.get("APPDATA", ""),
    r"Microsoft\Windows\Start Menu\Programs\Startup",
    "SupplementReminder.lnk",
)

C = {
    "bg": "#f4f5fa",
    "card": "#ffffff",
    "border": "#e3e5ee",
    "text": "#1f2430",
    "sub": "#6b7280",
    "accent": "#4f46e5",
    "green": "#16a34a",
    "green_bg": "#ecfdf3",
    "red": "#dc2626",
    "gray": "#9ca3af",
    "blue": "#2563eb",
    "warn_bg": "#fff7ed",
    "warn_border": "#fdba74",
}


# ---------------------------------------------------------------- 유틸

def today_str():
    return dt.date.today().strftime(DAY_FMT)


def slot_key(sup, t):
    return f"{sup['id']}@{t}"


def slot_datetime(day, t):
    return dt.datetime.strptime(f"{day} {t}", f"{DAY_FMT} %H:%M")


def fmt_dur(minutes):
    h, m = divmod(max(0, int(minutes)), 60)
    if h and m:
        return f"{h}시간 {m}분"
    if h:
        return f"{h}시간"
    return f"{m}분"


def parse_times(text):
    out = []
    for part in text.replace("，", ",").replace(" ", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(dt.datetime.strptime(part, "%H:%M").strftime("%H:%M"))
        except ValueError:
            raise ValueError(f"'{part}' 은(는) 올바른 시간이 아니에요.\n예: 08:30, 21:00")
    if not out:
        raise ValueError("복용 시간을 하나 이상 입력하세요.\n예: 08:30, 21:00")
    return sorted(set(out))


def play_chime():
    if not winsound:
        return

    def run():
        try:
            for freq, ms in ((880, 140), (1175, 140), (1568, 260)):
                winsound.Beep(freq, ms)
        except RuntimeError:
            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)

    threading.Thread(target=run, daemon=True).start()


def make_icon(root):
    """알약 모양 아이콘을 코드로 그린다 (이미지 파일 불필요)."""
    img = tk.PhotoImage(master=root, width=32, height=32)
    ax, ay, bx, by, r = 8.5, 23.5, 23.5, 8.5, 7.5
    dx, dy = bx - ax, by - ay
    seg = dx * dx + dy * dy
    for y in range(32):
        for x in range(32):
            p = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / seg))
            cx, cy = ax + p * dx, ay + p * dy
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                img.put("#ef4444" if p < 0.5 else "#fbbf24", (x, y))
    return img


def set_startup(enable):
    if not enable:
        if os.path.exists(STARTUP_LNK):
            os.remove(STARTUP_LNK)
        return
    pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    if not os.path.exists(pyw):
        pyw = sys.executable
    script = os.path.abspath(__file__)

    def q(s):
        return s.replace("'", "''")

    ps = (
        f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(STARTUP_LNK)}');"
        f"$s.TargetPath='{q(pyw)}';"
        f"$s.Arguments='\"{q(script)}\" --minimized';"
        f"$s.WorkingDirectory='{q(BASE_DIR)}';"
        f"$s.Save()"
    )
    encoded = base64.b64encode(ps.encode("utf-16-le")).decode("ascii")
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        check=True, capture_output=True, creationflags=0x08000000,  # CREATE_NO_WINDOW
    )


# ---------------------------------------------------------------- 데이터

def default_data():
    return {
        "supplements": [
            {"id": "multi", "name": "멀티비타민", "times": ["08:30"], "note": "아침 식사 직후", "enabled": True},
            {"id": "omega3", "name": "오메가3", "times": ["12:30"], "note": "점심 식사와 함께", "enabled": True},
            {"id": "arginine", "name": "아르기닌", "times": ["22:00"], "note": "공복 · 취침 전", "enabled": True},
        ],
        "settings": {
            "snooze_min": 10,
            "sound": True,
            "sound_repeat_sec": 60,
            "close_hint_shown": False,
            "since": today_str(),
        },
        "log": {},
    }


class Store:
    def __init__(self, path):
        self.path = path
        self.data = default_data()
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    loaded = json.load(f)
                self.data["supplements"] = loaded.get("supplements", self.data["supplements"])
                self.data["settings"].update(loaded.get("settings", {}))
                self.data["log"] = loaded.get("log", {})
            except (OSError, ValueError):
                # 손상된 파일은 지우지 않고 옆에 백업해 둔다
                os.replace(path, path + f".broken-{int(time.time())}")
        self._prune()
        self.save()

    @property
    def supplements(self):
        return self.data["supplements"]

    @property
    def settings(self):
        return self.data["settings"]

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    def _prune(self):
        cutoff = (dt.date.today() - dt.timedelta(days=LOG_KEEP_DAYS)).strftime(DAY_FMT)
        for day in [d for d in self.data["log"] if d < cutoff]:
            del self.data["log"][day]

    def slots(self):
        """오늘 복용해야 할 (시간, 영양제) 목록 — 시간순."""
        out = [(t, s) for s in self.supplements if s.get("enabled", True) for t in s["times"]]
        return sorted(out, key=lambda x: (x[0], x[1]["name"]))

    def status(self, day, key):
        return self.data["log"].get(day, {}).get(key)

    def set_status(self, day, key, status):
        self.data["log"].setdefault(day, {})[key] = {
            "status": status, "at": dt.datetime.now().strftime("%H:%M"),
        }
        self.save()

    def clear_status(self, day, key):
        self.data["log"].get(day, {}).pop(key, None)
        self.save()


# ---------------------------------------------------------------- 알림창

class ReminderPopup:
    """확인할 때까지 화면 맨 위에 계속 떠 있는 알림창."""

    def __init__(self, app):
        self.app = app
        self.win = None
        self.items = []
        self.vars = {}
        self.is_test = False
        self.last_sound = None

    def is_open(self):
        return self.win is not None and self.win.winfo_exists()

    def show(self, items, test=False):
        keys = [i["key"] for i in items]
        if self.is_open():
            if keys != [i["key"] for i in self.items]:
                self.items, self.is_test = items, test
                self._build_body()
            return
        self.items, self.is_test = items, test
        self.vars = {}
        s = self.app.scale
        w = self.win = tk.Toplevel(self.app.root)
        w.title("💊 영양제 먹을 시간!")
        w.configure(bg=C["warn_bg"])
        w.resizable(False, False)
        w.attributes("-topmost", True)
        w.protocol("WM_DELETE_WINDOW", self.snooze)  # 닫기 = 다시 알림
        self.body = tk.Frame(w, bg=C["warn_bg"], padx=int(24 * s), pady=int(20 * s))
        self.body.pack(fill="both", expand=True)
        self._build_body()
        w.update_idletasks()
        x = (w.winfo_screenwidth() - w.winfo_reqwidth()) // 2
        y = (w.winfo_screenheight() - w.winfo_reqheight()) // 3
        w.geometry(f"+{x}+{y}")
        self.last_sound = None
        self._nag()

    def _build_body(self):
        s = self.app.scale
        old = {k: v.get() for k, v in self.vars.items()}
        for c in self.body.winfo_children():
            c.destroy()
        self.vars = {}
        bg = C["warn_bg"]

        tk.Label(self.body, text="💊 영양제 먹을 시간이에요!", font=(FONT, 20, "bold"),
                 bg=bg, fg=C["text"]).pack(anchor="w")
        tk.Label(self.body, text="먹은 항목을 체크하고 [먹었어요]를 눌러주세요.\n"
                                 "확인할 때까지 이 창은 다른 창들 위에 계속 떠 있어요.",
                 font=(FONT, 10), bg=bg, fg=C["sub"], justify="left").pack(anchor="w", pady=(4, 14))

        now = dt.datetime.now()
        for item in self.items:
            sup, t, key = item["sup"], item["time"], item["key"]
            var = tk.BooleanVar(value=old.get(key, True))
            self.vars[key] = var
            late = (now - slot_datetime(item["day"], t)).total_seconds() // 60
            late_txt = "지금" if late < 1 else f"{fmt_dur(late)} 지남"
            sub = f"{t} · {late_txt}" + (f" · {sup['note']}" if sup.get("note") else "")

            row = tk.Frame(self.body, bg=C["card"], highlightthickness=1,
                           highlightbackground=C["warn_border"], cursor="hand2")
            row.pack(fill="x", pady=4)
            cb = tk.Checkbutton(row, variable=var, bg=C["card"], activebackground=C["card"])
            cb.pack(side="left", padx=(int(10 * s), int(4 * s)), pady=int(10 * s))
            txt = tk.Frame(row, bg=C["card"], cursor="hand2")
            txt.pack(side="left", fill="x", expand=True, pady=int(8 * s), padx=(0, int(16 * s)))
            l1 = tk.Label(txt, text=sup["name"], font=(FONT, 14, "bold"), bg=C["card"],
                          fg=C["text"], cursor="hand2")
            l1.pack(anchor="w")
            l2 = tk.Label(txt, text=sub, font=(FONT, 10), bg=C["card"],
                          fg=C["red"] if late >= 30 else C["sub"], cursor="hand2")
            l2.pack(anchor="w")
            for wdg in (row, txt, l1, l2):
                wdg.bind("<Button-1>", lambda e, v=var: v.set(not v.get()))

        btns = tk.Frame(self.body, bg=bg)
        btns.pack(fill="x", pady=(16, 0))
        snooze_min = self.app.store.settings["snooze_min"]
        tk.Button(btns, text="✔  먹었어요", font=(FONT, 13, "bold"), bg=C["green"], fg="white",
                  activebackground="#15803d", activeforeground="white", relief="flat",
                  padx=int(22 * s), pady=int(8 * s), cursor="hand2",
                  command=self.taken).pack(side="left")
        tk.Button(btns, text=f"⏰ {snooze_min}분 뒤 다시", font=(FONT, 11), bg=C["card"], fg=C["text"],
                  relief="flat", padx=int(14 * s), pady=int(8 * s), cursor="hand2",
                  command=self.snooze).pack(side="left", padx=(int(8 * s), 0))
        tk.Button(btns, text="오늘은 건너뛰기", font=(FONT, 10), bg=bg, fg=C["sub"],
                  activebackground=bg, relief="flat", cursor="hand2",
                  command=self.skip).pack(side="right")

    def _nag(self):
        """주기적으로 맨 위로 끌어올리고, 설정된 간격마다 소리를 낸다.
        (키보드 포커스는 뺏지 않아서 타이핑 중 실수로 눌리는 일은 없다.)"""
        if not self.is_open():
            return
        w = self.win
        if w.state() == "iconic":
            w.deiconify()
        w.attributes("-topmost", True)
        w.lift()
        st = self.app.store.settings
        now = time.monotonic()
        if st.get("sound", True) and (self.last_sound is None
                                      or now - self.last_sound >= st.get("sound_repeat_sec", 60)):
            play_chime()
            self.last_sound = now
        w.after(10000, self._nag)

    def _finish(self, status):
        checked = [i for i in self.items if self.vars[i["key"]].get()]
        unchecked = [i for i in self.items if not self.vars[i["key"]].get()]
        if not self.is_test:
            for i in checked:
                self.app.store.set_status(i["day"], i["key"], status)
            self.app.snooze_items(unchecked)
        self.close()
        self.app.refresh_all()

    def taken(self):
        self._finish("taken")

    def skip(self):
        self._finish("skipped")

    def snooze(self):
        if not self.is_test:
            self.app.snooze_items(self.items)
        self.close()
        self.app.refresh_all()

    def close(self):
        if self.is_open():
            self.win.destroy()
        self.win = None
        self.is_test = False


# ---------------------------------------------------------------- 영양제 편집 대화상자

class SupplementDialog(tk.Toplevel):
    def __init__(self, app, sup=None):
        super().__init__(app.root)
        self.result = None
        s = app.scale
        self.title("영양제 수정" if sup else "영양제 추가")
        self.configure(bg=C["bg"], padx=int(20 * s), pady=int(16 * s))
        self.resizable(False, False)
        self.transient(app.root)

        self.v_name = tk.StringVar(value=sup["name"] if sup else "")
        self.v_times = tk.StringVar(value=", ".join(sup["times"]) if sup else "")
        self.v_note = tk.StringVar(value=sup.get("note", "") if sup else "")

        def field(label, var, hint):
            tk.Label(self, text=label, font=(FONT, 10, "bold"), bg=C["bg"], fg=C["text"]).pack(anchor="w")
            e = ttk.Entry(self, textvariable=var, width=36, font=(FONT, 11))
            e.pack(anchor="w", fill="x", pady=(2, 0))
            tk.Label(self, text=hint, font=(FONT, 9), bg=C["bg"], fg=C["sub"]).pack(anchor="w", pady=(0, 10))
            return e

        first = field("이름", self.v_name, "예: 멀티비타민, 오메가3, 아르기닌")
        field("복용 시간", self.v_times, "24시간 형식, 여러 번이면 쉼표로 구분 (예: 08:30, 21:00)")
        field("메모 (선택)", self.v_note, "예: 식후 30분, 공복, 물 한 컵과 함께")

        btns = tk.Frame(self, bg=C["bg"])
        btns.pack(fill="x", pady=(6, 0))
        ttk.Button(btns, text="저장", command=self._save).pack(side="right")
        ttk.Button(btns, text="취소", command=self.destroy).pack(side="right", padx=6)
        self.bind("<Return>", lambda e: self._save())
        self.bind("<Escape>", lambda e: self.destroy())

        self.update_idletasks()
        x = app.root.winfo_rootx() + (app.root.winfo_width() - self.winfo_reqwidth()) // 2
        y = app.root.winfo_rooty() + (app.root.winfo_height() - self.winfo_reqheight()) // 3
        self.geometry(f"+{max(0, x)}+{max(0, y)}")
        self.grab_set()
        first.focus_set()

    def _save(self):
        name = self.v_name.get().strip()
        if not name:
            messagebox.showwarning(APP_NAME, "이름을 입력하세요.", parent=self)
            return
        try:
            times = parse_times(self.v_times.get())
        except ValueError as e:
            messagebox.showwarning(APP_NAME, str(e), parent=self)
            return
        self.result = {"name": name, "times": times, "note": self.v_note.get().strip()}
        self.destroy()


# ---------------------------------------------------------------- 메인 앱

class App:
    def __init__(self, root, ipc_server, start_minimized=False):
        self.root = root
        self.store = Store(DATA_FILE)
        self.snoozed = {}  # (day, key) -> datetime
        self.popup = ReminderPopup(self)
        self.show_requested = threading.Event()
        self.day = today_str()
        self.last_minute = None
        self.scale = max(1.0, root.winfo_fpixels("1i") / 96.0)

        s = self.scale
        root.title(APP_NAME)
        root.geometry(f"{int(780 * s)}x{int(600 * s)}")
        root.minsize(int(640 * s), int(480 * s))
        root.configure(bg=C["bg"])
        self.icon = make_icon(root)
        root.iconphoto(True, self.icon)
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.report_callback_exception = self._report_error

        self._style()
        self._build()

        threading.Thread(target=self._ipc_loop, args=(ipc_server,), daemon=True).start()
        if start_minimized:
            root.iconify()
        self.refresh_all()
        root.after(300, self._poll_ipc)
        root.after(1500, self.tick)

    # ---------- 공통
    def _report_error(self, exc, val, tb):
        with open(ERROR_LOG, "a", encoding="utf-8") as f:
            f.write(f"\n[{dt.datetime.now():%Y-%m-%d %H:%M:%S}]\n")
            f.write("".join(traceback.format_exception(exc, val, tb)))

    def _style(self):
        st = ttk.Style(self.root)
        st.configure(".", font=(FONT, 10))
        st.configure("TNotebook", background=C["bg"], borderwidth=0)
        st.configure("TNotebook.Tab", font=(FONT, 11), padding=(14, 6))
        st.configure("Treeview", rowheight=int(30 * self.scale), font=(FONT, 10))
        st.configure("Treeview.Heading", font=(FONT, 10, "bold"))
        st.configure("TButton", font=(FONT, 10), padding=(10, 4))

    def _build(self):
        nb = ttk.Notebook(self.root)
        nb.pack(fill="both", expand=True, padx=10, pady=10)
        self.nb = nb
        self.tab_today = tk.Frame(nb, bg=C["bg"])
        self.tab_manage = tk.Frame(nb, bg=C["bg"])
        self.tab_history = tk.Frame(nb, bg=C["bg"])
        self.tab_settings = tk.Frame(nb, bg=C["bg"])
        nb.add(self.tab_today, text="  오늘  ")
        nb.add(self.tab_manage, text="  영양제 관리  ")
        nb.add(self.tab_history, text="  기록  ")
        nb.add(self.tab_settings, text="  설정  ")
        nb.bind("<<NotebookTabChanged>>", lambda e: self.refresh_all())
        self._build_today()
        self._build_manage()
        self._build_history()
        self._build_settings()

    def refresh_all(self):
        self.refresh_today()
        self.refresh_manage()
        self.refresh_history()

    # ---------- 스케줄러
    def tick(self):
        try:
            self.check_due()
            minute = dt.datetime.now().strftime("%H:%M")
            if minute != self.last_minute:
                self.last_minute = minute
                self.refresh_today()
        finally:
            self.root.after(5000, self.tick)

    def check_due(self):
        now = dt.datetime.now()
        day = now.strftime(DAY_FMT)
        if day != self.day:
            self.day = day
            self.snoozed.clear()
            self.refresh_all()
        hm = now.strftime("%H:%M")
        due = []
        for t, sup in self.store.slots():
            if t > hm:
                continue
            key = slot_key(sup, t)
            if self.store.status(day, key):
                continue
            until = self.snoozed.get((day, key))
            if until and until > now:
                continue
            due.append({"day": day, "time": t, "sup": sup, "key": key})
        if due:
            self.popup.show(due)
        elif self.popup.is_open() and not self.popup.is_test:
            self.popup.close()

    def snooze_items(self, items):
        until = dt.datetime.now() + dt.timedelta(minutes=self.store.settings["snooze_min"])
        for i in items:
            self.snoozed[(i["day"], i["key"])] = until

    # ---------- 단일 실행 (두 번 실행하면 기존 창을 띄움)
    def _ipc_loop(self, srv):
        while True:
            try:
                conn, _ = srv.accept()
            except OSError:
                return
            with conn:
                try:
                    if conn.recv(16).startswith(b"SHOW"):
                        self.show_requested.set()
                except OSError:
                    pass

    def _poll_ipc(self):
        if self.show_requested.is_set():
            self.show_requested.clear()
            self.show_window()
        self.root.after(300, self._poll_ipc)

    def show_window(self):
        self.root.deiconify()
        self.root.state("normal")
        self.root.lift()
        self.root.focus_force()

    def on_close(self):
        st = self.store.settings
        if not st.get("close_hint_shown"):
            messagebox.showinfo(
                APP_NAME,
                "창을 닫아도 프로그램은 작업표시줄에서 계속 실행되며 알림을 보내요.\n\n"
                "완전히 끄려면 [설정] 탭의 '프로그램 종료'를 누르세요.",
                parent=self.root,
            )
            st["close_hint_shown"] = True
            self.store.save()
        self.root.iconify()

    def quit_app(self):
        if messagebox.askyesno(APP_NAME, "종료하면 영양제 알림이 오지 않아요.\n정말 종료할까요?",
                               parent=self.root):
            self.root.destroy()

    # ---------- 오늘 탭
    def _build_today(self):
        f = self.tab_today
        s = self.scale
        head = tk.Frame(f, bg=C["bg"])
        head.pack(fill="x", padx=int(16 * s), pady=(int(14 * s), 4))
        self.lbl_date = tk.Label(head, font=(FONT, 18, "bold"), bg=C["bg"], fg=C["text"])
        self.lbl_date.pack(side="left")
        self.lbl_progress = tk.Label(head, font=(FONT, 12, "bold"), bg=C["bg"], fg=C["accent"])
        self.lbl_progress.pack(side="right")
        self.pbar = ttk.Progressbar(f, maximum=100)
        self.pbar.pack(fill="x", padx=int(16 * s))
        self.lbl_next = tk.Label(f, font=(FONT, 10), bg=C["bg"], fg=C["sub"], anchor="w")
        self.lbl_next.pack(fill="x", padx=int(16 * s), pady=(6, 8))

        wrap = tk.Frame(f, bg=C["bg"])
        wrap.pack(fill="both", expand=True, padx=int(10 * s), pady=(0, 10))
        self.today_canvas = tk.Canvas(wrap, bg=C["bg"], highlightthickness=0)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.today_canvas.yview)
        self.today_list = tk.Frame(self.today_canvas, bg=C["bg"])
        win = self.today_canvas.create_window((0, 0), window=self.today_list, anchor="nw")
        self.today_list.bind("<Configure>", lambda e: self.today_canvas.configure(
            scrollregion=self.today_canvas.bbox("all")))
        self.today_canvas.bind("<Configure>", lambda e: self.today_canvas.itemconfigure(win, width=e.width))
        self.today_canvas.configure(yscrollcommand=sb.set)
        self.today_canvas.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.root.bind_all("<MouseWheel>", self._on_wheel)

    def _on_wheel(self, e):
        if self.nb.index("current") == 0 and str(e.widget).startswith(str(self.root)):
            if e.widget.winfo_toplevel() is self.root:
                self.today_canvas.yview_scroll(int(-e.delta / 120), "units")

    def refresh_today(self):
        s = self.scale
        now = dt.datetime.now()
        day, hm = self.day, now.strftime("%H:%M")
        slots = self.store.slots()
        taken = sum(1 for t, sup in slots
                    if (self.store.status(day, slot_key(sup, t)) or {}).get("status") == "taken")

        self.lbl_date.config(text=f"{now:%m월 %d일} ({WEEKDAYS[now.weekday()]}) 오늘의 영양제")
        self.lbl_progress.config(text=f"{taken} / {len(slots)} 복용")
        self.pbar["value"] = (taken / len(slots) * 100) if slots else 0

        upcoming = [(t, sup) for t, sup in slots
                    if t > hm and not self.store.status(day, slot_key(sup, t))]
        if upcoming:
            t, sup = upcoming[0]
            mins = (slot_datetime(day, t) - now).total_seconds() / 60
            self.lbl_next.config(text=f"⏰ 다음 알림: {t} {sup['name']}  ({fmt_dur(mins + 1)} 후)")
        elif slots and taken == len(slots):
            self.lbl_next.config(text="🎉 오늘 영양제를 모두 챙겨 먹었어요!")
        else:
            self.lbl_next.config(text="오늘 남은 알림이 없어요.")

        for c in self.today_list.winfo_children():
            c.destroy()
        if not slots:
            tk.Label(self.today_list, text="등록된 영양제가 없어요. [영양제 관리] 탭에서 추가하세요.",
                     font=(FONT, 11), bg=C["bg"], fg=C["sub"]).pack(pady=40)
            return

        for t, sup in slots:
            key = slot_key(sup, t)
            st = self.store.status(day, key)
            if st and st["status"] == "taken":
                status_txt, color, bg = f"✅ 복용함 ({st['at']})", C["green"], C["green_bg"]
            elif st:
                status_txt, color, bg = "➖ 건너뜀", C["gray"], C["card"]
            elif t <= hm:
                status_txt, color, bg = "⚠ 아직 안 먹음", C["red"], C["warn_bg"]
            else:
                status_txt, color, bg = "⏰ 예정", C["blue"], C["card"]

            row = tk.Frame(self.today_list, bg=bg, highlightthickness=1, highlightbackground=C["border"])
            row.pack(fill="x", padx=6, pady=4)
            tk.Label(row, text=t, font=(FONT, 15, "bold"), bg=bg, fg=C["text"], width=6).pack(
                side="left", padx=(int(8 * s), 0), pady=int(10 * s))
            mid = tk.Frame(row, bg=bg)
            mid.pack(side="left", fill="x", expand=True)
            tk.Label(mid, text=sup["name"], font=(FONT, 12, "bold"), bg=bg, fg=C["text"]).pack(anchor="w")
            if sup.get("note"):
                tk.Label(mid, text=sup["note"], font=(FONT, 9), bg=bg, fg=C["sub"]).pack(anchor="w")
            if st:
                ttk.Button(row, text="되돌리기", width=9,
                           command=lambda k=key: self._undo(k)).pack(side="right", padx=int(10 * s))
            else:
                ttk.Button(row, text="먹었어요", width=9,
                           command=lambda k=key: self._mark(k)).pack(side="right", padx=int(10 * s))
            tk.Label(row, text=status_txt, font=(FONT, 10, "bold"), bg=bg, fg=color).pack(
                side="right", padx=int(6 * s))

    def _mark(self, key):
        self.store.set_status(self.day, key, "taken")
        self.check_due()
        self.refresh_all()

    def _undo(self, key):
        self.store.clear_status(self.day, key)
        # 되돌린 직후 알림창이 바로 튀어나오지 않도록 잠시 미뤄둔다
        self.snoozed[(self.day, key)] = dt.datetime.now() + dt.timedelta(
            minutes=self.store.settings["snooze_min"])
        self.refresh_all()

    # ---------- 영양제 관리 탭
    def _build_manage(self):
        f = self.tab_manage
        s = self.scale
        tk.Label(f, text="복용 중인 영양제와 시간을 관리하세요. 더블클릭하면 수정할 수 있어요.",
                 font=(FONT, 10), bg=C["bg"], fg=C["sub"]).pack(anchor="w", padx=int(16 * s), pady=(int(14 * s), 6))
        cols = ("on", "name", "times", "note")
        tv = ttk.Treeview(f, columns=cols, show="headings", selectmode="browse")
        for col, label, w, anchor in (("on", "사용", 60, "center"), ("name", "이름", 160, "w"),
                                      ("times", "복용 시간", 170, "w"), ("note", "메모", 260, "w")):
            tv.heading(col, text=label)
            tv.column(col, width=int(w * s), anchor=anchor, stretch=(col == "note"))
        tv.pack(fill="both", expand=True, padx=int(16 * s))
        tv.bind("<Double-1>", lambda e: self._edit())
        self.tv_manage = tv

        btns = tk.Frame(f, bg=C["bg"])
        btns.pack(fill="x", padx=int(16 * s), pady=int(12 * s))
        ttk.Button(btns, text="+ 추가", command=self._add).pack(side="left")
        ttk.Button(btns, text="수정", command=self._edit).pack(side="left", padx=6)
        ttk.Button(btns, text="사용 / 중지", command=self._toggle).pack(side="left")
        ttk.Button(btns, text="삭제", command=self._delete).pack(side="right")

    def refresh_manage(self):
        tv = self.tv_manage
        sel = tv.selection()
        tv.delete(*tv.get_children())
        for sup in self.store.supplements:
            tv.insert("", "end", iid=sup["id"], values=(
                "✅" if sup.get("enabled", True) else "⏸", sup["name"],
                ", ".join(sup["times"]), sup.get("note", "")))
        if sel and tv.exists(sel[0]):
            tv.selection_set(sel[0])

    def _selected_sup(self):
        sel = self.tv_manage.selection()
        if not sel:
            messagebox.showinfo(APP_NAME, "목록에서 영양제를 먼저 선택하세요.", parent=self.root)
            return None
        return next((s for s in self.store.supplements if s["id"] == sel[0]), None)

    def _add(self):
        dlg = SupplementDialog(self)
        self.root.wait_window(dlg)
        if dlg.result:
            self.store.supplements.append({"id": uuid.uuid4().hex[:8], "enabled": True, **dlg.result})
            self.store.save()
            self.refresh_all()

    def _edit(self):
        sup = self._selected_sup()
        if not sup:
            return
        dlg = SupplementDialog(self, sup)
        self.root.wait_window(dlg)
        if dlg.result:
            sup.update(dlg.result)
            self.store.save()
            self.refresh_all()

    def _toggle(self):
        sup = self._selected_sup()
        if sup:
            sup["enabled"] = not sup.get("enabled", True)
            self.store.save()
            self.refresh_all()

    def _delete(self):
        sup = self._selected_sup()
        if sup and messagebox.askyesno(APP_NAME, f"'{sup['name']}'을(를) 삭제할까요?", parent=self.root):
            self.store.supplements.remove(sup)
            self.store.save()
            self.refresh_all()

    # ---------- 기록 탭
    def _build_history(self):
        f = self.tab_history
        s = self.scale
        self.lbl_streak = tk.Label(f, font=(FONT, 13, "bold"), bg=C["bg"], fg=C["accent"])
        self.lbl_streak.pack(anchor="w", padx=int(16 * s), pady=(int(14 * s), 2))
        tk.Label(f, text="최근 14일 복용 기록 (✅ 복용 · ➖ 건너뜀 · ❌ 놓침)", font=(FONT, 9),
                 bg=C["bg"], fg=C["sub"]).pack(anchor="w", padx=int(16 * s), pady=(0, 6))
        cols = ("date", "rate", "detail")
        tv = ttk.Treeview(f, columns=cols, show="headings", selectmode="none")
        for col, label, w, stretch in (("date", "날짜", 120, False), ("rate", "복용률", 80, False),
                                       ("detail", "상세", 480, True)):
            tv.heading(col, text=label)
            tv.column(col, width=int(w * s), anchor="center" if col != "detail" else "w", stretch=stretch)
        tv.pack(fill="both", expand=True, padx=int(16 * s), pady=(0, int(14 * s)))
        self.tv_history = tv

    def _day_summary(self, day, until_hm=None):
        log = self.store.data["log"].get(day, {})
        parts, taken, total = [], 0, 0
        for t, sup in self.store.slots():
            if until_hm is not None and t > until_hm:
                parts.append(f"{sup['name']} ⏰")
                continue
            st = log.get(slot_key(sup, t))
            total += 1
            if st and st["status"] == "taken":
                taken += 1
                parts.append(f"{sup['name']} ✅")
            elif st:
                parts.append(f"{sup['name']} ➖")
            else:
                parts.append(f"{sup['name']} ❌")
        return taken, total, "  ·  ".join(parts)

    def refresh_history(self):
        tv = self.tv_history
        tv.delete(*tv.get_children())
        since = self.store.settings.get("since", self.day)
        today = dt.date.today()
        hm = dt.datetime.now().strftime("%H:%M")
        for i in range(14):
            d = today - dt.timedelta(days=i)
            day = d.strftime(DAY_FMT)
            if day < since:
                break
            taken, total, detail = self._day_summary(day, hm if i == 0 else None)
            rate = f"{taken * 100 // total}%" if total else "-"
            label = f"{d:%m/%d} ({WEEKDAYS[d.weekday()]})" + (" 오늘" if i == 0 else "")
            tv.insert("", "end", values=(label, rate, detail))

        streak = 0
        for i in range(1, LOG_KEEP_DAYS):
            day = (today - dt.timedelta(days=i)).strftime(DAY_FMT)
            if day < since:
                break
            taken, total, _ = self._day_summary(day)
            if total and taken == total:
                streak += 1
            else:
                break
        t_taken, t_total, _ = self._day_summary(self.day)
        if t_total and t_taken == t_total:
            streak += 1
        self.lbl_streak.config(text=f"🔥 연속 완벽 복용 {streak}일" if streak else "오늘부터 연속 기록을 쌓아봐요 💪")

    # ---------- 설정 탭
    def _build_settings(self):
        f = self.tab_settings
        s = self.scale
        st = self.store.settings
        box = tk.Frame(f, bg=C["bg"])
        box.pack(fill="x", padx=int(20 * s), pady=int(16 * s))

        def row(label, widget_factory, hint=""):
            r = tk.Frame(box, bg=C["bg"])
            r.pack(fill="x", pady=6)
            tk.Label(r, text=label, font=(FONT, 11), bg=C["bg"], fg=C["text"], width=22, anchor="w").pack(side="left")
            widget_factory(r).pack(side="left")
            if hint:
                tk.Label(r, text=hint, font=(FONT, 9), bg=C["bg"], fg=C["sub"]).pack(side="left", padx=8)

        self.v_snooze = tk.IntVar(value=st["snooze_min"])
        self.v_repeat = tk.IntVar(value=st["sound_repeat_sec"])
        self.v_sound = tk.BooleanVar(value=st["sound"])
        self.v_startup = tk.BooleanVar(value=os.path.exists(STARTUP_LNK))

        row("다시 알림 간격 (분)", lambda p: tk.Spinbox(p, from_=1, to=120, width=6, font=(FONT, 11),
                                                    textvariable=self.v_snooze, command=self._save_settings),
            "'N분 뒤 다시'를 눌렀을 때")
        row("소리 알림", lambda p: ttk.Checkbutton(p, variable=self.v_sound, command=self._save_settings))
        row("소리 반복 간격 (초)", lambda p: tk.Spinbox(p, from_=15, to=600, increment=15, width=6,
                                                    font=(FONT, 11), textvariable=self.v_repeat,
                                                    command=self._save_settings),
            "확인할 때까지 이 간격마다 소리")
        row("Windows 시작 시 자동 실행", lambda p: ttk.Checkbutton(p, variable=self.v_startup,
                                                            command=self._toggle_startup),
            "추천! 컴퓨터를 켜면 자동으로 작업표시줄에 실행돼요")
        for w in (self.v_snooze, self.v_repeat):
            w.trace_add("write", lambda *a: self._save_settings())

        btns = tk.Frame(f, bg=C["bg"])
        btns.pack(fill="x", padx=int(20 * s), pady=(int(10 * s), 0))
        ttk.Button(btns, text="🔔 알림창 미리보기", command=self._test_popup).pack(side="left")
        ttk.Button(btns, text="📁 데이터 폴더 열기",
                   command=lambda: os.startfile(os.path.dirname(DATA_FILE))).pack(side="left", padx=6)
        ttk.Button(btns, text="프로그램 종료", command=self.quit_app).pack(side="right")

        tk.Label(f, text=f"데이터 파일: {DATA_FILE}", font=(FONT, 9), bg=C["bg"], fg=C["sub"]).pack(
            side="bottom", anchor="w", padx=int(20 * s), pady=int(12 * s))

    def _save_settings(self):
        st = self.store.settings
        try:
            st["snooze_min"] = max(1, min(120, int(self.v_snooze.get())))
            st["sound_repeat_sec"] = max(15, min(600, int(self.v_repeat.get())))
        except (tk.TclError, ValueError):
            return  # 입력 중인 빈 값 등은 무시
        st["sound"] = bool(self.v_sound.get())
        self.store.save()

    def _toggle_startup(self):
        want = self.v_startup.get()
        try:
            set_startup(want)
        except (OSError, subprocess.CalledProcessError) as e:
            messagebox.showerror(APP_NAME, f"자동 실행 설정에 실패했어요.\n{e}", parent=self.root)
        self.v_startup.set(os.path.exists(STARTUP_LNK))

    def _test_popup(self):
        now = dt.datetime.now()
        self.popup.show([{
            "day": self.day, "time": now.strftime("%H:%M"),
            "sup": {"name": "테스트 알림", "note": "미리보기예요. 버튼을 눌러도 기록되지 않아요."},
            "key": "__test__",
        }], test=True)


# ---------------------------------------------------------------- 진입점

def acquire_single_instance():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    try:
        srv.bind(("127.0.0.1", IPC_PORT))
    except OSError:
        srv.close()
        return None
    srv.listen(4)
    return srv


def main():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("VibeCoding.SupplementReminder")
    except (AttributeError, OSError):
        pass

    srv = acquire_single_instance()
    if srv is None:
        # 이미 실행 중이면 기존 창을 앞으로 띄우고 종료
        try:
            with socket.create_connection(("127.0.0.1", IPC_PORT), timeout=2) as c:
                c.sendall(b"SHOW")
        except OSError:
            pass
        return

    root = tk.Tk()
    App(root, srv, start_minimized="--minimized" in sys.argv)
    root.mainloop()


if __name__ == "__main__":
    main()
