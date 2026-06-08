import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

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

  // Stylistic formatting rules (replacing Biome formatter) + project overrides
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@stylistic': stylistic },
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

      // ── Stylistic formatting (Biome equivalent) ──
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/max-len': ['warn', { code: 100 }],
      '@stylistic/linebreak-style': ['error', 'unix'],
    },
  },
);
