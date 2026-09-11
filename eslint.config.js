/* /eslint.config.js */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Bouwuitvoer hoort nergens gelint te worden. Alleen 'dist' dekte de root, niet
  // api/dist; daardoor kwamen er honderden meldingen uit gecompileerde bestanden zodra het
  // lintbereik verder ging dan src.
  globalIgnores(['**/dist/**', '**/node_modules/**', 'api/playwright-browsers/**']),
  {
    // Ook .mjs; de validators en het dev-script staan daar en die vielen buiten elke
    // controle. TypeScript staat in het blok hieronder.
    files: ['**/*.{js,jsx,mjs}'],
    plugins: { react },
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Zonder deze twee regels weet no-unused-vars niet dat gebruik in JSX ook gebruik
      // is. Dat leverde tientallen valse meldingen op; onder meer elke icoonmodule die
      // motion importeert en als <motion.svg> rendert, en elk component dat als prop
      // binnenkomt en in JSX wordt geplaatst.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // no-undef ziet een JSX-component niet; een vergeten import viel daardoor pas op
      // wanneer een gebruiker het scherm opende. Deze regel vangt dat wel.
      'react/jsx-no-undef': 'error',
      // Alleen een naam die met een underscore begint mag ongebruikt blijven; dat is de
      // afspraak voor waarden die je bewust wegdestructureert. Het eerdere patroon negeerde
      // elke hoofdletternaam, waardoor een dode componentimport nooit opviel.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // De API is TypeScript en viel tot nu toe buiten elke lintcontrole; alleen tsc keek
    // ernaar, en tsc ziet geen ongebruikte import of een lege catch. Bewust zonder
    // type-aware regels: die vragen een tsconfig-project per bestand en maken de run
    // tientallen keren langzamer, terwijl tsc de types al bewaakt via api/npm run typecheck.
    files: ['api/**/*.ts', 'api/**/*.tsx'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // De queries en services praten met SQL-rijen; die zijn per definitie any tot ze
      // gecontroleerd zijn. Dat afdwingen is een apart traject en geen lintvraag.
      '@typescript-eslint/no-explicit-any': 'off',
      // Zelfde afspraak als aan de frontendkant; een underscore betekent bewust ongebruikt.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // De validators, het dev-script en de node-tests draaien in Node en niet in een
    // browser. Zonder deze globals meldde elke process- en Buffer-verwijzing zich als
    // no-undef, en dat is precies het soort ruis waardoor niemand de validators lint.
    files: [
      'scripts/**/*.{js,mjs}',
      'api/scripts/**/*.{js,mjs}',
      'tests/**/*.{js,mjs,jsx}',
      '*.{js,mjs}',
      // De offline app heeft zijn eigen buildconfiguratie en startscript; ook Node.
      'offline/vite.config.js',
      'offline/scripts/**/*.{js,mjs}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Een validator exporteert niets en rendert niets; de react-refresh-regel heeft daar
      // geen betekenis.
      'react-refresh/only-export-components': 'off',
    },
  },
])
