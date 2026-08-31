import { afterEach, test, expect } from 'vitest';
import { createSyncCache } from '../syncCache.js';
import { __resetDbForTests } from '../db.js';

afterEach(async () => {
  __resetDbForTests();
  await indexedDB.deleteDatabase('absolute-scenes-mobile');
});

test('get returns null for a path that was never set', async () => {
  const cache = createSyncCache('owner/repo');
  expect(await cache.get('book.json')).toBeNull();
});

test('set then get round-trips the exact entry', async () => {
  const cache = createSyncCache('owner/repo');
  await cache.set('scenes/sc1.md', { sha: 'abc', content: 'hello', encoding: 'utf-8' });
  expect(await cache.get('scenes/sc1.md')).toEqual({ sha: 'abc', content: 'hello', encoding: 'utf-8' });
});

test('two repos do not share cache entries for the same path', async () => {
  const cacheA = createSyncCache('owner/repo-a');
  const cacheB = createSyncCache('owner/repo-b');
  await cacheA.set('book.json', { sha: 'a-sha', content: '{}', encoding: 'utf-8' });
  expect(await cacheB.get('book.json')).toBeNull();
});
