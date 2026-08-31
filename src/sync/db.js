import { openDB } from 'idb';

const DB_NAME = 'absolute-scenes-mobile';
const DB_VERSION = 1;

let dbPromise = null;
let db = null;

// A repo *is* the identity of a book on mobile (there's no local file path)
// -- both object stores are keyed by repo full_name (syncCache further
// composes the path onto that key; see syncCache.js).
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('syncCache');
        db.createObjectStore('books');
      },
    }).then(openedDb => {
      db = openedDb;
      return openedDb;
    });
  }
  return dbPromise;
}

export function __resetDbForTests() {
  if (db) {
    db.close();
  }
  db = null;
  dbPromise = null;
}
