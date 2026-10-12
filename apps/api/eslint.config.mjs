import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const tenantSafety = [
  {
    selector: "MemberExpression[property.name='prisma']",
    message: 'Modules must use the tenant-scoped client: `const { db } = tenantOf(request)`. The raw client is for auth, devices, health and jobs only.',
  },
  {
    selector: "MemberExpression[property.name=/^.(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]",
    message: 'Raw SQL bypasses tenant isolation. Use the typed Prisma client.',
  },
];

export default defineConfig(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/require-await': 'off',
      'no-console': 'error',
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    ignores: ['src/modules/auth/**', 'src/modules/devices/**', 'src/modules/health/**'],
    rules: { 'no-restricted-syntax': ['error', ...tenantSafety] },
  },
  {
    files: ['prisma/seed/index.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // light-my-request's response.json() is untyped; tests assert on the shape instead of casting it.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
