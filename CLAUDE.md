# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 필메이트 (PillMate) — 영양제·약 복용 관리 데스크톱 앱

> 앱 이름은 임시. 이 파일은 Claude Code가 매 세션 시작 시 읽는 프로젝트 안내서다.
> 기능을 추가하거나 결정이 바뀌면 이 파일도 함께 갱신한다.

## 0. 현재 저장소 상태 (2026-10-10 기준)

- 로드맵 **1단계 완료**: Electron 세팅, 트레이 상주, 테스트 알람(토스트 + 항상 위 팝업 + 소리).
- 로드맵 **2단계 완료**: 영양제 수동 입력(추가·수정·사용 중지·삭제) + SQLite 저장.
- 로드맵 3단계는 둘로 나눴다. **3-1 완료**: 생활 시간 설정 → 슬롯 시간 계산, 영양제별 복용 시점, '오늘 복용' 탭에서 직접 체크·되돌리기. **3-2 완료**: 자동 알람 스케줄러, 스누즈·재알림, 절전 복귀 시 놓친 알람.
- 로드맵 **4단계 완료**: 처방약 탭 (식전·식후 N분, 처방 기간, 복용 종료, 시점 변경 확인 창, 처방약+영양제 함께 복용 시 약사 확인 안내).
- 로드맵 **5단계 완료**: 규칙 파일 기반 복용 시점 추천 보드(영양제 탭 → '복용 시점 추천 받기'), 끌어다 놓기·'옮기기' 선택, 충돌 경고(막지 않음), 일괄 적용. 추천은 영양제에만 적용하고 처방약은 건드리지 않는다. 규칙에 없는 성분은 '규칙 없음' 배지로 사용자가 직접 정한다.
- 로드맵 **6단계 완료**: 식품안전나라 건강기능식품 검색으로 영양제 입력 채우기.
- 로드맵 7단계는 둘로 나눴다. **7-1 완료**: '기록' 탭 (최근 7일/30일 복용률, 날짜별 쌓은 막대, 연속 완료일, 제품별 복용률). **7-2 완료**: 설치 파일(`npm run build:win` → `dist\PillMate-Setup-1.0.0.exe`), 앱 아이콘, 자동 실행 켜기/끄기, 설정 탭의 검색 키 상태·키 폴더 열기. **로드맵 1~7단계 모두 완료 (v1.0.0).**
- v1.1.0: 영양제 검색에 **일반의약품**(약국 비타민제 등, 공공데이터포털 허가정보) 추가. e약은요는 쓰지 않음, 전문의약품·허가 취하 제품은 제외, 성분량은 원료 분량 그대로 + 안내 (사용자 결정).
- **외부 API 방침 (사용자 결정, 2026-10-10): 공개 API(공공데이터)만 쓰고, 공개 API가 없는 기능은 만들지 않는다.** 그래서 Claude API(사진 인식·웹 검색 보완·AI 추정)는 쓰지 않는다. 일반 식품(음료·젤리, 식품안전나라 C002)은 이름·원재료밖에 없어 넣지 않았다.
- 영양제 삭제는 하드 삭제이며 복용 기록도 CASCADE로 함께 지워진다 (사용자 결정). 확인 창에서 기록을 남기려면 '사용 중지'를 쓰라고 안내한다.
- **Vite는 7에 고정**: electron-vite 5가 Vite 8을 지원하지 않는다. 같은 이유로 `@vitejs/plugin-react`는 5.x를 쓴다. 함부로 올리지 말 것.
- Electron 44는 `npm install` 때가 아니라 처음 실행할 때 실행 파일을 내려받는다 (`node_modules/electron/dist`).
- 이와 별도로 저장소에는 **Python/tkinter 프로토타입**이 있다:
  - `supplement_reminder.pyw` — 표준 라이브러리만 쓰는 단일 파일 앱 (실행: 더블클릭 또는 `pythonw supplement_reminder.pyw [--minimized]`)
  - `data.json` — 프로토타입의 실제 사용자 데이터 (영양제 목록·설정·복용 기록). **삭제·덮어쓰기 금지.**
  - `README.md` — 프로토타입 사용 설명
- 프로토타입은 Electron 버전의 **동작 참고용**이다. 새 앱에서 그대로 살려야 할 동작:
  - 알람 판정: 5초마다 "오늘 슬롯 시간이 지났고 아직 기록(status)이 없고 스누즈 중이 아님"이면 팝업에 모아서 표시 → 꺼져 있던 동안 놓친 알람도 같은 로직으로 잡힌다 ("N시간 지남" 표시).
  - 팝업은 `먹었어요`를 누를 때까지 최상단 유지, 일정 간격(`sound_repeat_sec`)으로 소리 반복.
  - 단일 인스턴스: 두 번째 실행 시 기존 창을 앞으로 (프로토타입은 TCP 포트 47651 사용 → Electron에서는 `app.requestSingleInstanceLock()`).
  - X 버튼은 종료가 아니라 숨김, `--minimized` 인자로 자동 실행 시 숨긴 상태로 시작.
  - 날짜가 바뀌면 스누즈 상태 초기화, 기록은 120일 보관.
- `data.json` 구조: `supplements[]`(id, name, times["HH:MM"], note, enabled), `settings`(snooze_min, sound, sound_repeat_sec, since), `log["YYYY-MM-DD"]["<id>@<HH:MM>"] = {status, at}`. Electron 버전에서 이 데이터를 SQLite로 가져오는 임포트 기능을 고려한다.

## 1. 프로젝트 개요

- 1인용 Windows 데스크톱 앱. 로그인 없음, 데이터는 모두 로컬에 저장.
- 목적: 영양제·처방약을 기록하고, 올바른 복용 순서와 시간을 정해, **컴퓨터 앞에서 확실히 알람을 받는 것.**
- 배경: 휴대폰 알람은 폰이 멀리 있거나 충전 중일 때 놓친다. 사용자는 하루 대부분을 PC 앞에서 보낸다.
  → 알람은 "놓칠 수 없게" 만드는 것이 최우선 요구사항이다.

## 2. 반드시 지킬 원칙

1. **의료 판단을 대신하지 않는다.** 복용 순서 추천은 일반 정보이며, 화면에 "참고용 정보이며 의사·약사의 지시가 우선합니다" 문구를 표시한다.
2. **처방약은 처방전 지시가 최우선.** 처방약의 복용 시점을 앱이 자동으로 바꾸지 않는다. 사용자가 수정하면 경고를 띄운다.
3. **추천 근거를 구분한다.** 추천마다 근거(라벨 / 규칙 파일 / 규칙 없음)를 배지로, 규칙의 근거 수준이 약하면 "근거 약함"을 UI에 표시한다.
4. **API 키는 `.env`에만** 저장하고 `.env`는 `.gitignore`에 포함. `.env.example`에는 키 이름만 둔다.
5. 알람 기능을 깨뜨리는 변경은 하지 않는다. 알람 관련 코드를 수정하면 테스트를 반드시 실행한다.

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 앱 프레임워크 | Electron + electron-vite | JS/TS만으로 개발 가능, 트레이 상주·OS 알림·자동 실행 지원 |
| UI | React + TypeScript + Tailwind CSS | 바이브 코딩에 예제가 가장 많음 |
| 로컬 DB | SQLite (Node 내장 `node:sqlite`) | 1인용, 서버 불필요. 네이티브 모듈 재빌드가 필요 없다 |
| 스케줄러 | 메인 프로세스에서 30초 간격 체크 | 절전 복귀 후에도 누락 없이 처리하기 쉬움 |
| 제품 정보 검색 | 식품안전나라 오픈API `I0030` (건강기능식품) + 공공데이터포털 `DrugPrdtPrmsnInfoService08` (의약품 제품 허가정보, 일반의약품) | 국내 제품의 공식 정보. 공개 API만 쓴다 |
| 테스트 | Vitest | 복용 순서 규칙·스케줄 계산 단위 테스트 |
| 패키징 | electron-builder | Windows 설치 파일(.exe) 생성. NSIS, 내 계정에만 설치(관리자 권한 불필요), 코드 서명 없음(SmartScreen 경고) |

- 설치 파일에 들어가는 런타임 패키지는 `dependencies`(date-fns, @date-fns/tz)뿐이다. React 등 화면 라이브러리는 Vite가 묶으므로 `devDependencies`에 둔다 — 메인 프로세스에서 새 패키지를 import하면 `dependencies`에 넣어야 설치 앱에서 동작한다.
- `npm audit`의 moderate 경고(sprintf-js 등)는 **electron-builder 빌드 도구 안에만** 있고 설치 앱에는 없다(`npm audit --omit=dev` = 0건). `npm audit fix --force`는 빌드 도구를 크게 바꿔 깨질 수 있어 쓰지 않기로 함 (7-2단계 결정).
- 환경변수는 `.env`(git 제외)에만: `FOODSAFETY_API_KEY`(식품안전나라), `DATA_GO_KR_API_KEY`(공공데이터포털 '일반 인증키' — 계정당 하나로 활용신청한 모든 API에 쓰임) (`.env.example` 참고). 형식은 `이름=값` 한 줄씩 — 사용자가 키만 따로 붙여 넣은 적이 있으니 키가 안 읽히면 형식부터 확인 (값은 출력하지 말 것). 개발은 프로젝트 폴더의 `.env`, 설치한 앱은 `%APPDATA%\PillMate\.env`를 `process.loadEnvFile`로 읽는다 (`src/main/env.ts`). 키가 없으면 검색 없이 직접 입력만 된다. 견본 키 `sample`은 결과 최대 5건으로 개발 확인용.
- DB는 better-sqlite3 대신 `node:sqlite`(`DatabaseSync`)를 쓴다 (2단계에서 결정). Electron 44 내장 Node 24에 들어 있어 설치·재빌드가 없고, Vitest(일반 Node 24)에서도 같은 코드가 그대로 돈다. `db.transaction()`이 없으므로 `src/main/db/transaction.ts`의 `withTransaction`을 쓴다. 조회 결과는 `as unknown as Row` 로 타입을 붙인다.

## 4. 명령어

```bash
npm install          # 의존성 설치
npm run dev          # 개발 모드 실행 (핫 리로드)
npm run typecheck    # TypeScript 검사 (메인·preload용 tsconfig.node.json, 화면용 tsconfig.web.json)
npm run lint         # ESLint 검사
npm run build        # typecheck + out/ 에 빌드
npm run build:win    # Windows 설치 파일 빌드 → dist/PillMate-Setup-<버전>.exe (dist/win-unpacked 에 설치 없이 실행 가능한 폴더도 생김)
npm run icon         # build/icon.png 다시 만들기 (scripts/make-icon.mjs, 트레이 아이콘과 같은 그림)
```

```bash
npm test                                       # Vitest 전체 (tests/**/*.test.ts)
npx vitest run tests/supplementInput.test.ts   # 파일 하나만
npx vitest run -t "테스트 이름"                 # 이름으로 특정 테스트만
```

- DB 테스트는 `openDatabase(':memory:')`로 메모리 DB를 만든다. DB 함수는 모두 `db`를 첫 인자로 받으므로 Electron 없이 테스트할 수 있다.
- 실제 DB 파일: `%APPDATA%\PillMate\pillmate.db` (`app.getPath('userData')`).

- 개발 중 앱이 이미 트레이에 떠 있으면 `npm run dev`로 새로 띄운 앱은 단일 인스턴스 잠금 때문에 바로 종료된다. 트레이 메뉴 "종료"로 먼저 끈다.
- **사용자가 설치한 PillMate를 쓰는 중이면 끄지 말고**(알람이 멈춤) 임시 데이터 폴더로 따로 띄운다: `npx electron-vite dev -- --user-data-dir=<임시 폴더>`. 실제 DB(`%APPDATA%\PillMate`)와 잠금이 분리된다. 이때 `.env`는 프로젝트 폴더 것을 읽는다.
- 알람을 실제 앱에서 빨리 확인하려면 설정에서 스누즈·재알림 간격을 1분으로 줄이고, 영양제 시간을 1분 뒤로 직접 지정한다. 확인 후 테스트 데이터·설정을 지울 것 (실제 DB는 사용자 데이터).
- 설치용 빌드 점검: `dist\win-unpacked\PillMate.exe --remote-debugging-port=9333 --inspect=9229` 로 같은 방식으로 점검할 수 있다. **설치 앱(isPackaged)은 켜자마자 시작프로그램(HKCU Run의 `com.pillmate.app`)에 자기 경로를 등록하므로, 시험 실행 후 `app.setLoginItemSettings({openAtLogin:false, args:['--minimized']})`로 해제할 것.** 설치 앱은 `%APPDATA%\PillMate\.env`를 읽는다.
- 화면 모양 확인: 같은 9333 포트로 `Page.captureScreenshot`을 보내 PNG로 저장해 본다 (Browser pane은 Electron 창을 못 띄움).
- 실행 중인 앱을 자동으로 점검할 때: `npx electron-vite dev --inspect 9229 --remoteDebuggingPort 9333` → 메인 프로세스는 9229, 화면은 9333(`/json/list`)에 CDP로 접속해 `Runtime.evaluate`.

## 5. 폴더 구조 (목표)

```
src/
  main/              # Electron 메인 프로세스 (Node.js 환경)
    index.ts         # 앱 시작, 트레이, 자동 실행, 단일 인스턴스
    scheduler.ts     # 알람 시간 체크, 놓친 알람 처리
    notifier.ts      # OS 알림 + 알람 팝업 창 + 소리
    db/              # SQLite 연결, 스키마, 마이그레이션, 쿼리
    services/        # 공공데이터 API 호출 (foodSafety.ts)
  preload/           # 메인 ↔ 화면 사이의 안전한 통로 (contextBridge)
  shared/types.ts    # 메인·preload·화면 공용 타입. window.api 형태(PillMateApi)도 여기서 정의
  renderer/          # React 화면 (Vite root)
    index.html       # 메인 창
    alarm.html       # 알람 팝업 창 (별도 페이지, electron.vite.config.ts의 input에 등록)
    src/
      pages/         # 오늘 복용, 영양제 목록, 처방약, 설정
      components/
rules/
  timing-rules.json  # 성분별 복용 시점·함께 먹으면 안 되는 조합
tests/
.env.example         # 필요한 환경변수 목록 (값은 비움)
```

- 외부 API 호출과 DB 접근은 **메인 프로세스에서만** 한다. renderer에서 직접 하지 않는다.
- renderer는 preload에 노출된 함수(`window.api.xxx`)로만 메인과 통신한다. 새 기능을 노출할 때는 `PillMateApi` 타입 → `src/preload/index.ts` → `ipcMain` 핸들러 순으로 세 곳을 함께 고친다. IPC 채널 이름은 `영역:동작` 형식(예: `alarm:respond`).
- 창은 `sandbox: true`, `contextIsolation: true`. preload는 CommonJS로 빌드되므로 `package.json`에 `"type": "module"`을 넣지 않는다.
- 알람 팝업은 메인 창과 별개의 `BrowserWindow`(`alwaysOnTop`)로 띄운다. 메인 창이 숨겨져 있어도 동작해야 한다.

## 6. 기능 명세

### 6-1. 영양제 등록
- **검색:** 영양제 입력 창의 '제품 검색'에 제품명(필수)·제조사(선택) → 식품안전나라 `I0030` 조회 → 결과를 고르면 입력 창을 채운다. 결과가 없으면(해외 직구 제품 등) 직접 입력한다. 사진 인식·웹 검색 보완은 하지 않는다 (공개 API 방침).
- 자동으로 가져온 정보는 저장 전 반드시 사용자 확인 화면을 거친다. 출처(`manual` / `public_data`)를 `products.source`에 저장하고 목록에 '공공데이터' 표시.
- 수동 입력도 항상 가능해야 한다 (검색 실패 대비).

#### 6-1-2. 일반의약품 검색 (v1.1.0)
- 같은 검색 버튼으로 건강기능식품과 일반의약품을 동시에 찾고(`src/main/searchHandlers.ts` → `mergeSearchResults`), 결과에 종류 배지. 한쪽만 실패하면 다른 쪽 결과 + 안내(`notices`).
- 호출: `src/main/services/drugInfo.ts` → `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08?serviceKey=…&type=json&item_name=…` (상세정보 하나로 충분: 제품명 `ITEM_NAME`, 회사 `ENTP_NAME`(판매사라 제조사 칸 문제 없음), `ETC_OTC_CODE`, `CANCEL_NAME`, 원료 `MATERIAL_NAME`, 용법용량 `UD_DOC_DATA`(XML)). 키 오류는 HTTP 401. 제조사 필터는 쓰지 않는다.
- 변환: `src/shared/drugData.ts` — `ETC_OTC_CODE==='일반의약품'` && 허가 '정상'만, 용법용량 XML의 CDATA → 글(`docToText`), `MATERIAL_NAME`의 `성분명/분량/단위`(반복 제거, 밀리그램→mg 등). **분량은 원료 기준**('콜레칼시페롤농축분말 10mg' ≠ 비타민D 10mg) — 입력 창에 안내. 실제 응답은 `tests/fixtures/drug-detail-sample.json`.
- 의약품식 성분명(피리독살·히드록소코발라민·메코발라민·폴산·유비데카레논·피토나디온 등)은 `rules/timing-rules.json` 별칭으로 인식. 의약품 이름은 한글 표기('비타민디')가 많다.

#### 6-1-1. 검색 구현 (6단계)
- 호출: `src/main/services/foodSafety.ts` → `https://openapi.foodsafetykorea.go.kr/api/{키}/I0030/json/1/20/PRDLST_NM=…&BSSH_NM=…`. 응답 `RESULT.CODE`: `INFO-000` 정상, `INFO-200` 결과 없음, `INFO-100` 키 오류. 실패해도 예외 대신 안내 문구를 돌려준다(10초 제한).
- 변환: `src/shared/publicData.ts` — 제품명 `PRDLST_NM`, 제조사 `BSSH_NM`(판매 브랜드가 아니라 **위탁 제조 공장**일 수 있음 — 화면에 안내), 섭취방법 `NTK_MTHD` → 라벨 섭취 방법(5단계 라벨 해석·추천에 그대로 쓰임), 성분·함량은 기준규격 `STDR_STND`의 '표시량' 줄에서 추출(형식이 제품마다 제각각 — `tests/fixtures/i0030-sample.json`의 실제 응답 15건으로 테스트), 표시량이 없으면 원재료 `RAWMTRL_NM` 이름만. 주의사항 `IFTKN_ATNT_MATR_CN`은 저장하지 않고 참고로만 보여준다.

### 6-2. 복용 순서 추천
- 하루를 기본 슬롯으로 나눈다: `기상 직후 공복` · `아침 식후` · `점심 식후` · `저녁 식후` · `취침 전`.
- 등록된 제품의 성분을 `rules/timing-rules.json`과 대조해 슬롯을 배정하고, 추천 이유를 한 줄로 보여준다.
- 규칙 파일 예시 (초기값, 개발 시 출처 확인 후 보완):
  - 지용성 비타민(A·D·E·K), 오메가3, 코엔자임Q10 → 지방이 있는 식사 후
  - 비타민 B군 → 아침 식후 (늦게 먹으면 수면에 방해될 수 있음)
  - 철분 → 공복 권장(위장 불편 시 식후), 칼슘·마그네슘·아연과 2시간 이상 간격
  - 마그네슘 → 저녁 또는 취침 전
  - 유산균 → 제품 표기 방법을 우선
- 우선순위: **제품 라벨의 섭취 방법 > 규칙 파일.** 규칙에 없는 성분은 "규칙 없음" 배지를 붙이고 사용자가 직접 정한다 (AI 추정은 하지 않음 — 공개 API 방침).

#### 6-2-1. 추천 구현 (5단계)
- `rules/timing-rules.json`: 성분별 `aliases`·`slots`(추천 순서)·`reason`·`evidence`(`supported`=공식 건강정보 근거 / `limited`=근거 약함·관행)·`sources`, `ignore`(스테아르산마그네슘 같은 첨가물), `conflicts`(철분↔칼슘·마그네슘·아연 120분). **규칙을 추가·수정하면 `npm test`가 형식을 검사한다** (별칭 중복, 없는 id 참조, supported인데 출처 없음 등). 출처는 MedlinePlus·NCCIH 등 실제로 열리는 공개 자료만 넣고, 확인 못 한 근거는 `limited`로 둔다 (NIH ODS 사이트는 자동 조회가 차단됨).
- 이름 인식(`src/shared/rules.ts`의 `matchIngredients`): 소문자·한글/영문/숫자만 남겨 별칭을 찾되, **긴 별칭이 짧은 별칭을 덮는다** ('판토텐산칼슘'은 B군, '스테아르산마그네슘'은 무시). 성분 목록에서 못 찾으면 제품 이름으로 찾는다.
- 추천(`src/shared/recommend.ts`, 순수 함수): 라벨 해석(`parseLabelInstruction`: 공복/아침/점심/저녁/취침 전/1일 N회/식후) → 규칙(여러 성분이면 순위 합) → 규칙 없음(현재 일정 유지). 고정된 것(라벨·규칙 없음) 먼저 놓고, 충돌 규칙에 걸리는 성분(철분)부터 후보 시점 중 충돌 없는 곳을 고른다. 피할 수 없으면 경고만.
- 충돌 간격은 실제 알람 시각(직접 지정 시간 포함)으로, 복용일 경계 기준 분으로 계산한다 (자정 넘김 대응).
- 적용(`applyScheduleChanges`/`rescheduleItems`): 그대로인 슬롯은 복용량·직접 지정 시간·등록 시각 유지, 옮긴 슬롯은 복용량만 가져오고 직접 지정 시간은 비운다. 영양제만 바뀐다.

### 6-3. 순서·시간 사용자 조정
- 추천 결과를 드래그 앤 드롭으로 다른 슬롯으로 옮길 수 있다.
- 설정에서 식사 시간(아침·점심·저녁)과 기상·취침 시간을 입력 → 각 슬롯의 알람 시간이 자동 계산된다.
- 슬롯별·제품별로 알람 시간을 직접 덮어쓸 수 있다.
- 충돌 조합(예: 철분과 칼슘을 같은 슬롯에 둠)으로 옮기면 경고만 표시하고 막지는 않는다.

### 6-4. 알람 (최우선 기능)
- 앱은 **트레이에 상주**하고 Windows 시작 시 자동 실행된다 (설정 `autoLaunch`, 기본 켬, 설치 앱에서만 `src/main/autoLaunch.ts`가 적용). 창을 닫아도 종료되지 않고 트레이로 숨는다.
- 알람 시간이 되면 세 가지를 동시에 실행:
  1. Windows 토스트 알림
  2. **화면 위에 항상 떠 있는 알람 팝업 창** (방해 금지/집중 지원 모드에서 토스트가 숨겨져도 보이도록)
  3. 알람 소리 (설정에서 끄기 가능)
- 팝업 버튼: `먹었어요` / `10분 뒤 다시` / `건너뛰기`. 응답이 없으면 5분마다 다시 알린다 (최대 횟수는 설정).
- PC가 꺼져 있었거나 절전 상태였다면, 복귀 시(`powerMonitor`의 `resume`) 놓친 알람을 모아서 보여준다.
- 모든 응답은 복용 기록으로 저장한다.
- Windows 토스트 표시를 위해 `app.setAppUserModelId`를 앱 시작 시 설정한다.

### 6-4-1. 알람 구현 구조 (3-2단계)
- `src/main/scheduler.ts`: 30초 `setInterval` + `powerMonitor`의 `resume`(3초 뒤)·`unlock-screen`, 앱 시작 직후 한 번. 매번 `getTodayView`로 지금 복용일의 목록을 새로 계산한다 (상태를 따로 들고 있지 않음 → 날짜 변경·재시작에 강함). 기록·설정·영양제가 바뀌면 IPC 핸들러가 `scheduler.refresh()`를 부른다.
- 판단은 `src/shared/alarm.ts` 순수 함수: `dueEntries`(대기 + 시각 지남 + 스누즈 끝남), `decideRing`(새 항목이면 즉시 울리고 횟수 초기화, 같은 항목이면 `repeatIntervalMinutes`마다 최대 `repeatMaxCount`번 더, 그 뒤엔 소리 없이 팝업 유지), `overdueLabel`.
- 스누즈는 `intake_logs`에 `snoozed`로 기록되고 `buildDayPlan`이 `snoozedUntil`을 계산한다 → 앱을 다시 켜도 이어진다. 재알림 횟수(`RingState`)만 메모리에 있다.
- 팝업 버튼은 팝업의 **모든 항목에 한 번에** 적용된다 (사용자 결정). 알람은 **지금 복용일 항목만** 띄우고, 지난 복용일의 미응답은 `missed`로 기록하지 않는다 — 7단계 통계에서 '기록 없음 = 놓침'으로 계산 (사용자 결정).
- `src/main/notifier.ts`는 표시만 한다: `presentAlarm(state, ring)` — `ring`이 false면 내용만 갱신, 객체면 토스트 + 맨 앞으로 + (소리 설정 시) 알림음. 팝업 화면은 `alarm.onState`/`onRing`을 먼저 구독한 뒤 `alarm.ready()`를 불러야 창이 뜨기 전에 울린 소리를 받는다.
- 테스트 알람은 `key: 'test'`인 가짜 항목으로 같은 경로를 탄다.
- **등록 전에 이미 지난 시각은 울리지 않는다**: `schedule_items.created_at`(DayPlanEntry `addedAt`)보다 이른 예정 시각은 `dueEntries`에서 빠진다 (오늘 탭에는 '대기'로 남아 직접 체크 가능). 영양제·처방약 수정 시 `replaceSchedule`이 원래 있던 슬롯의 `created_at`을 유지한다.

### 6-5. 병원 처방약
- 영양제와 분리된 "처방약" 탭에서 관리.
- 입력 항목: 약 이름(예: 감기약), 복용 시점(식전/식후 N분/취침 전 등), 하루 횟수, 시작일, 처방 일수, 메모.
- `식후 30분`처럼 식사 기준 시간은 설정의 식사 시간으로부터 계산한다.
- 처방 일수가 끝나면 자동으로 알람을 끄고 "복용 완료" 목록으로 이동.
- 약봉투·처방전 사진 인식은 하지 않는다 (공개 API 방침).
- 처방약과 영양제를 함께 복용 중이면 "약사에게 함께 먹어도 되는지 확인하세요" 안내를 표시한다. 상호작용을 앱이 단정하지 않는다.

## 7. 데이터 모델

> 아래는 실제로 만든 형태다 (마이그레이션 1~3).

- `products` — id, type(`supplement`|`prescription`), name, manufacturer, label_instruction, source, image_path, active, created_at
- `ingredients` — id, product_id, name, amount, unit
- `schedule_items` — id, product_id, slot, custom_time(nullable), dose, sort_order, created_at. `UNIQUE(product_id, slot)`. 영양제·처방약이 함께 쓴다 (`src/main/db/scheduleItems.ts`).
- `prescriptions` — product_id(PK), meal_timing(`before`|`after`), meal_offset_minutes, start_date, days(NULL=계속 복용), memo. 초안의 `timing_rule`·`times_per_day` 대신 칸을 나눴고, **하루 횟수는 schedule_items 개수**로 계산한다(중복 저장 안 함). 약 자체는 `products.type='prescription'`.
- `intake_logs` — id, **product_id, slot, plan_date**, scheduled_at, action(`taken`|`snoozed`|`skipped`|`missed`), acted_at. 초안의 `schedule_item_id` 대신 제품·슬롯·복용일을 직접 저장해, 복용 시점을 바꿔도 과거 기록이 남는다. 기록은 추가만 하고, 한 항목의 상태는 그날 마지막 `taken`/`skipped`로 정한다(되돌리기 = 그 둘을 삭제, `snoozed`는 남김).
- `settings` — key/value(JSON) 행. 항목을 추가해도 마이그레이션이 필요 없고, 없는 키는 `DEFAULT_SETTINGS`로 채운다. 알람 관련: `alarmSound`, `snoozeMinutes`(10), `repeatIntervalMinutes`(5), `repeatMaxCount`(6).

DB 스키마를 바꿀 때는 `src/main/db/migrations.ts`의 `MIGRATIONS` 배열 **끝에** 새 SQL을 추가한다 (`PRAGMA user_version`으로 적용 여부를 판단). 이미 있는 항목은 고치지 않고, 기존 데이터를 지우지 않는다. 현재 버전 3: 1=`products`, `ingredients` / 2=`settings`, `schedule_items`, `intake_logs` / 3=`prescriptions`, `schedule_items.created_at`.

### 시간 계산 규칙 (`src/shared/schedule.ts`, 순수 함수)
- 슬롯 시간: 기상 직후 = 기상 시간, 식후 = 식사 시간 + `afterMealMinutes`(기본 15), 취침 전 = 취침 − `beforeBedMinutes`(기본 30). `slotOverrides`가 있으면 그 시간, 영양제별 `custom_time`이 있으면 그 시간이 우선.
- **복용일(plan_date)**: 날짜는 자정이 아니라 취침과 기상의 한가운데(`dayBoundary`)에 바뀐다. 경계보다 이른 시각의 항목은 다음 날 일시가 된다 (예: 취침 01:00 → '취침 전 00:30'은 전날 복용일). 복용일 관련 계산은 반드시 `planDateFor`/`scheduledAtFor`를 쓴다.
- 처방약 시간(`prescriptionSlotTime`): 아침·점심·저녁 = 식사 시간 ± N분 (슬롯 직접 지정 `slotOverrides`는 **무시** — 처방 지시 우선), 기상 직후·취침 전 = 슬롯 시간, 먹는 때별 직접 지정이 있으면 그 시간. 처방 기간(`startDate`~`prescriptionEndDate`) 밖이거나 '복용 종료'(`active=0`)면 하루 계획에서 빠진다 → 기간이 끝나면 별도 처리 없이 알람이 멈춘다.
- 일시는 `@date-fns/tz`의 `TZDate`로 Asia/Seoul 기준 계산하고 `+09:00` ISO 문자열로 저장한다 (PC 시간대 설정과 무관).

입력값 검사는 `src/shared/supplementInput.ts` 같은 공용 순수 함수로 두고, 화면(즉시 오류 표시)과 메인 IPC 핸들러(저장 직전 재검사) 양쪽에서 쓴다. 화면 → 메인으로는 입력 창 값 그대로(`*Draft`, 함량도 문자열)를 보내고 메인에서 파싱한다.

### 6-6. 복용 기록 통계 (7-1단계)
- `src/shared/stats.ts`(순수 함수) + `src/main/today.ts`의 `getStatsView`. 복용일마다 **현재 일정으로** `getDayPlan`을 다시 만들고: 먹음/건너뜀은 기록대로, 예정 시각이 지난 대기는 '놓침'(기록 없음 = 놓침), 등록 전 시각·아직 안 된 시각은 세지 않음. 현재 일정에 없는 시점이라도 그날 먹음/건너뜀 기록이 있으면 센다(`listFinalOutcomes`).
- **한계(사용자 동의)**: 일정에서 뺀 시점·사용 중지한 영양제의 '기록 없는 과거'는 놓침으로 잡히지 않는다. 화면에 '현재 일정 기준 참고 통계'로 표시. 정확히 하려면 매일 계획을 저장하는 테이블이 필요.
- 연속 완료일: 최근 90복용일까지 거슬러 센다. 먹을 것이 없던 날은 건너뛰고, 놓침·건너뜀이 있으면 끊김, 오늘은 남은 항목이 있으면 세지 않음.

## 8. 개발 순서 (로드맵)

1. 프로젝트 세팅 + 트레이 상주 + 테스트 알람 1개 띄우기 ← **알람이 확실히 되는지 가장 먼저 검증**
2. 영양제 수동 입력 + DB 저장
3. 슬롯·시간 설정, 알람 스케줄러, 복용 기록
4. 처방약 탭
5. 복용 순서 추천 (규칙 파일 기반)
6. 검색(공공데이터 API) — 사진 인식은 제외
7. 통계 화면(복용률) → 설치 파일 빌드

한 번에 한 단계씩 진행하고, 각 단계가 실행되는 것을 확인한 뒤 다음 단계로 넘어간다.

## 9. 코딩 규칙

- TypeScript strict 모드. `any` 사용 지양.
- 시간 계산은 한국 시간(Asia/Seoul) 기준. 날짜 처리는 date-fns + `@date-fns/tz` 사용. 현재 시각은 인자(`now`)로 받아 테스트에서 고정한다.
- 복용 순서 규칙과 알람 시간 계산 로직은 Electron API에 의존하지 않는 순수 함수로 분리하고 Vitest 테스트를 작성한다 (현재 시각은 인자로 받는다).
- 주석과 UI 문구는 한국어.
- 새 패키지를 추가할 때는 이유를 먼저 설명한다.

## 10. Claude에게 요청하는 작업 방식

- 설명은 한국어로.
- **한 번에 하나의 기능만** 다룬다. 요청 범위 밖의 기능을 미리 만들지 않는다.
- **코드를 쓰기 전에 계획을 먼저 말하고, 사용자가 검토·승인한 뒤에 진행한다.** 계획에는 어떤 파일을 왜 바꾸는지, 새 패키지가 있다면 그 이유를 포함한다. 승인 전에는 파일을 수정하지 않는다.
- **기능 단위로 커밋한다.** 기능 하나가 완성되고 실행·테스트로 확인되면 그 기능의 변경만 묶어 커밋한다. 커밋 메시지는 한국어로, 무엇을 추가·수정했는지 한 줄 요약으로 쓴다.
- 새로 만들거나 수정한 파일은 파일별로 역할을 단계적으로 설명한다.
- VS Code에서 무엇을 어떤 순서로 실행해서 확인하면 되는지 마지막에 안내한다.
- 오류가 나면 오류 위치와 원인, 수정 내용을 함께 설명한다.
- 사용자는 JS/TS·Electron이 익숙하지 않을 수 있으므로 Electron 개념(메인/렌더러/preload)은 처음 등장할 때 쉽게 풀어서 설명한다.
