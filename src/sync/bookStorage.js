import { getDb } from './db.js';

export async function loadPersistedBook(repoFullName) {
  const db = await getDb();
  const book = await db.get('books', repoFullName);
  return book ?? null;
}

export async function savePersistedBook(repoFullName, book) {
  const db = await getDb();
  await db.put('books', book, repoFullName);
}
