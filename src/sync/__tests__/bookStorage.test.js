import { afterEach, test, expect } from 'vitest';
import { loadPersistedBook, savePersistedBook } from '../bookStorage.js';
import { __resetDbForTests } from '../db.js';

afterEach(async () => {
  __resetDbForTests();
  await indexedDB.deleteDatabase('absolute-scenes-mobile');
});

test('returns null when nothing has been saved for this repo', async () => {
  expect(await loadPersistedBook('owner/repo')).toBeNull();
});

test('save then load round-trips the exact book', async () => {
  const book = { title: 'T', chapters: [] };
  await savePersistedBook('owner/repo', book);
  expect(await loadPersistedBook('owner/repo')).toEqual(book);
});

test('two repos do not share persisted books', async () => {
  await savePersistedBook('owner/repo-a', { title: 'A' });
  expect(await loadPersistedBook('owner/repo-b')).toBeNull();
});
