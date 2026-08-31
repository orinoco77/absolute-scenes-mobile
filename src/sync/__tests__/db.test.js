import { afterEach, test, expect } from 'vitest';
import { getDb, __resetDbForTests } from '../db.js';

afterEach(async () => {
  __resetDbForTests();
  await indexedDB.deleteDatabase('absolute-scenes-mobile');
});

test('opens a database with syncCache and books object stores', async () => {
  const db = await getDb();
  expect(db.objectStoreNames.contains('syncCache')).toBe(true);
  expect(db.objectStoreNames.contains('books')).toBe(true);
});

test('memoizes the open connection across calls', async () => {
  const db1 = await getDb();
  const db2 = await getDb();
  expect(db1).toBe(db2);
});
