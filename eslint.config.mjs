// Sizzle ESLint — correctness rules only, by design.
//
// This codebase predates lint; the goal is catching real bugs (hooks misuse, unhandled
// promises, unsafe patterns), NOT restyling 400 files. Stylistic rules stay off.
// Add rules deliberately; never blanket-disable a failing correctness rule to get
// green — fix the code or narrowly suppress with a justifying comment.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.vercel/**',
      '**/node_modules/**',
      'apps/web/ios/**',
      'apps/web/android/**',
      'apps/web/public/**',
      '_handoff/**',
      'InventorySystem/**',
      'docs/**',
      'emails/**',
    ],
  },
  // TypeScript sources — web + api + shared.
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/api/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // React correctness — the highest-value rules in the set.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Promise / async correctness.
      'no-async-promise-executor': 'error',
      'no-promise-executor-return': 'error',
      // TS pragmatism: the codebase uses intentional non-null and empty catch.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Correctness misc.
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-constant-binary-expression': 'error',
      'eqeqeq': ['error', 'smart'],
    },
  },
  // Scripts and tests — node context, plain JS allowed.
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'apps/web/scripts/**/*.mjs', 'apps/api/scripts/**/*.mjs', '**/*.test.mjs'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
);
