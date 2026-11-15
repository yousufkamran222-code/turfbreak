import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'android', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // The simulation must stay pure and deterministic (MASTER_PROMPT 4.3).
    files: ['src/sim/**/*.ts'],
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
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The sim must not read the clock.' },
        { selector: "NewExpression[callee.name='Set']", message: 'Set iteration order is a determinism hazard in the sim; use arrays.' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@capacitor/*'], message: 'Only src/platform may import Capacitor.' }] },
      ],
    },
  },
);
