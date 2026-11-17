import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'android', 'node_modules', 'coverage', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Paired with noUncheckedIndexedAccess: typed-array reads in hot loops use `!`
      // rather than a `?? 0` branch on every access.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The simulation must stay pure and deterministic (MASTER_PROMPT 4.3).
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The sim must not touch the DOM.' },
        { name: 'document', message: 'The sim must not touch the DOM.' },
        { name: 'performance', message: 'The sim must not read the clock.' },
        { name: 'setTimeout', message: 'The sim must not use timers.' },
        { name: 'setInterval', message: 'The sim must not use timers.' },
        { name: 'requestAnimationFrame', message: 'The sim must not use timers.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in src/sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'The sim must not read the clock.' },
        ...['sin', 'cos', 'tan', 'atan2', 'asin', 'acos', 'atan'].map((property) => ({
          object: 'Math',
          property,
          message: 'Trig results can differ between engines; use vector maths or rotateSmall (MASTER_PROMPT 4.3 rule 4).',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The sim must not read the clock.' },
        { selector: "NewExpression[callee.name='Set']", message: 'Set iteration order is a determinism hazard in the sim; use arrays.' },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@capacitor/*'], message: 'Only src/platform may import Capacitor.' }] },
      ],
    },
  },
);
