import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['node_modules/', 'main.js', 'styles.css', 'build.ts', 'manifest.json'],
  },

  // Base recommended rules (all files)
  eslint.configs.recommended,

  // TypeScript non-type-aware rules (all files)
  ...tseslint.configs.recommended,

  // Type-aware linting for TS/TSX files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { react },
    rules: {
      // ── Project-specific overrides ──
      // foliate-js has poor TypeScript types; many APIs are `any`
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Allow unused vars prefixed with underscore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Prettier must be last — disables all rules that conflict with Prettier
  prettier,
);
