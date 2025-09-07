// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Safety
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',

      // NestJS / OOP
      'no-console': 'error',
      '@typescript-eslint/member-ordering': 'off',

      // Clean code
      'eqeqeq': ['error', 'always'],
      'complexity': ['off', 10],
      'max-lines-per-function': ['warn', 500],
      'max-params': ['warn', 20],
      'no-magic-numbers': ['warn', { ignore: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 200, 201, 400, 401, 500] }],


      // Style
      'semi': ['error', 'always'],
      'quotes': [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      'object-curly-spacing': ['error', 'always'],

      // Security
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      // Disable all rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'complexity': 'off',
      'no-magic-numbers': 'off',
    },
  },
);
