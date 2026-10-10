import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'dist-web/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.config.*', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'src/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser }
  },
  {
    // 데스크톱(Node)과 웹(브라우저)이 함께 쓰는 코드
    files: ['src/core/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  }
)
