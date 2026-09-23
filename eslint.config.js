// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint rules that encode CLAUDE.md. `scripts/check-layers.mjs` is the authority and
 * runs in CI; these give the same feedback in the editor, where it is cheapest to act on.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // CLAUDE.md §11: no silencing the compiler.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // CLAUDE.md §3: all randomness is seeded, so it is reproducible from a bug report.
    files: ['src/**/*.ts'],
    ignores: ['src/core/rng.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded PRNG in core/rng.ts — scares must be reproducible (CLAUDE.md §3).',
        },
      ],
    },
  },

  {
    // CLAUDE.md §2: Three.js lives only in render/.
    files: ['src/**/*.ts'],
    ignores: ['src/render/**/*.ts'],
    rules: {
      // Applies to app/ too: the composition root talks to render/'s interface,
      // it does not reach past it to the GPU (ADR-0002).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message: 'Only src/render/ may import three. Use core/math.ts (CLAUDE.md §2).',
            },
          ],
        },
      ],
    },
  },

  {
    // CLAUDE.md §2: core/ and game/ stay headless and testable without a browser.
    files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch'].map(
          (name) => ({
            name,
            message: `${name} is a browser API — inject it through platform/ (CLAUDE.md §2).`,
          }),
        ),
        {
          name: 'setTimeout',
          message: 'Gameplay timing uses the sim clock so it pauses, seeks and tests (CLAUDE.md §11).',
        },
        {
          name: 'setInterval',
          message: 'Gameplay timing uses the sim clock so it pauses, seeks and tests (CLAUDE.md §11).',
        },
        {
          name: 'performance',
          message: 'core/ takes time as an argument; platform/ reads the clock (CLAUDE.md §2).',
        },
      ],
    },
  },

  {
    /*
     * The smoke script is a Node program whose `page.evaluate` callbacks are serialized
     * and executed inside the browser, so browser globals here are correct — they are
     * just not in this file's own runtime.
     */
    files: ['scripts/smoke.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        window: 'readonly',
        document: 'readonly',
        Image: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  {
    // Build tooling runs in Node, not the browser.
    files: ['scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
);
