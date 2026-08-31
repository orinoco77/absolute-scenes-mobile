import { test, expect } from 'vitest';

test('IndexedDB is polyfilled for tests', () => {
  expect(typeof indexedDB).toBe('object');
});

test('jest-dom matchers are available', () => {
  document.body.innerHTML = '<div id="x">hi</div>';
  expect(document.getElementById('x')).toBeInTheDocument();
});
