import { getDb } from './db.js';

export function createSyncCache(repoFullName) {
  return {
    async get(path) {
      const db = await getDb();
      const entry = await db.get('syncCache', `${repoFullName}::${path}`);
      return entry ?? null;
    },
    async set(path, entry) {
      const db = await getDb();
      await db.put('syncCache', entry, `${repoFullName}::${path}`);
    },
  };
}
