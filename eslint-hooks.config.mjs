import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/out/**',
      '**/.webpack/**',
      'packages/api/generated/**',
      'packages/db/prisma/generated/**',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'packages/ui/src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // 默认入口只保留当前仓库最值得先治理的 Hook 问题，避免被 Compiler 级噪音淹没。
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/globals': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/void-use-memo': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',

      'react/react-in-jsx-scope': 'off',
    },
  },
];
