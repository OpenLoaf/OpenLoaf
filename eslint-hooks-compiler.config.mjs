import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

const reactHookCompilerRules = Object.fromEntries(
  Object.keys(reactHooksPlugin.configs['recommended-latest'].rules).map((ruleName) => [ruleName, 'warn']),
);

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
      ...reactHookCompilerRules,

      // Compiler 深度治理模式下，真正会破坏 Hook 语义的问题仍然提升为 error。
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/globals': 'error',

      'react/react-in-jsx-scope': 'off',
    },
  },
];
