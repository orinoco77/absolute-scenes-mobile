# Mobile Git-Native Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mobile's hand-rolled GitHub sync stack with `@absolute-scenes/git-sync`, wired through a new IndexedDB-backed persistence layer and a browser-tab-shaped trigger model, reaching a real, live-testable round trip (sign in, connect a repo, edit a scene, sync, verify the commit) as the first delivered unit.

**Architecture:** Three new layers under `src/sync/`: (1) an IndexedDB adapter (`db.js`) backing both the git-sync package's blob-sha `cache` interface (`syncCache.js`) and the local book state itself (`bookStorage.js`, replacing desktop's local `.book` file); (2) a thin orchestration layer (`syncOrchestrator.js`) mirroring desktop's `gitSyncService.js` but calling the package's promoted `syncRepo`/`reconcilePostSyncState`; (3) a browser-lifecycle trigger hook (`useSyncTriggers.js`) covering visibility changes, the `online` event, and a foreground-only periodic tick, replacing desktop's Electron-process-shaped triggers. `App.jsx` is rewired to load from IndexedDB on mount (offline-first, no network wait), persist every edit locally and immediately, and fire background syncs off the trigger hook plus scene-switch. The old `browserEnhancedGitHubService.js`/`browserCollaborationService.js` stack and the `ConflictResolution.jsx` overlay are deleted; conflicts surface instead as a badge on the affected scene (desktop's own `cd9e884` pattern — conflict markers land inline in scene content, resolved by editing and saving again).

**Tech Stack:** React 18, Vite 5. New dependencies: `@absolute-scenes/git-sync` (the same shared package desktop uses), `idb` (IndexedDB wrapper). New dev dependencies: Vitest (not Jest — see Task 1's rationale), `jsdom`, `fake-indexeddb`, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-08-31-mobile-git-native-sync-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-31-promote-orchestration-into-git-sync.md` must be fully landed and tagged (`@absolute-scenes/git-sync@0.2.0`) before Task 1 of this plan begins — every task here calls `syncRepo`/`reconcilePostSyncState`, which don't exist before that.

## Global Constraints

- **Platform constraint, stated directly by the user:** "It has to work on phones, but it cannot actually be a phone app" — no install-only or Chrome-only browser capabilities (e.g. the Background Sync API). iOS Safari is the binding constraint.
- No local `.book` file exists on mobile — IndexedDB (via `idb`) is the durable local record everywhere this plan would otherwise say "write to disk."
- Output generation, book-overview/navigation UX overhaul, and weeks-long fully-offline durability guarantees are explicitly out of scope for this pass (see spec's Non-Goals).
- The auth model (GitHub PAT in `localStorage`, no backend) is unchanged — no task in this plan touches how the token is stored.
- Every new function this plan introduces gets a real test in the same task that introduces it.

---

### Task 1: Test infrastructure and dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/setupTests.js`
- Test: `src/setupTests.test.js`

**Interfaces:**
- Produces: `npm test` (single run) and `npm run test:watch`, an `environment: 'jsdom'` Vitest config with `fake-indexeddb` and `@testing-library/jest-dom` matchers globally available to every subsequent task's tests.

Mobile's `package.json` has no test runner at all today (confirmed: no `jest`/`vitest` devDependency, no config file). This plan uses Vitest rather than Jest: mobile's `package.json` already declares `"type": "module"` and uses Vite for the dev/build pipeline, so Vitest needs zero extra transform configuration (no `babel-jest` + preset gymnastics for JSX/ESM) and shares the same `@vitejs/plugin-react` already in `devDependencies`. `fake-indexeddb` supplies the `indexedDB` global that `jsdom` itself does not implement, which every IndexedDB-backed task below (2, 3, 4) needs.

- [ ] **Step 1: Add dependencies**

```json
{
  "dependencies": {
    "@absolute-scenes/git-sync": "github:orinoco77/absolute-scenes-git-sync#v0.2.1",
    "html5-qrcode": "^2.3.8",
    "idb": "^8.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@vitejs/plugin-react": "^4.2.1",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "vite": "^5.0.8",
    "vitest": "^2.1.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing smoke test**

```js
// src/setupTests.test.js
import { test, expect } from 'vitest';

test('IndexedDB is polyfilled for tests', () => {
  expect(typeof indexedDB).toBe('object');
});

test('jest-dom matchers are available', () => {
  document.body.innerHTML = '<div id="x">hi</div>';
  expect(document.getElementById('x')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `vitest.config.js` yet, `indexedDB` and `toBeInTheDocument` undefined.

- [ ] **Step 4: Write the config and setup file**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
  },
});
```

```js
// src/setupTests.js
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/setupTests.js src/setupTests.test.js
git commit -m "test: add Vitest infrastructure with jsdom and fake-indexeddb"
```

---

### Task 2: IndexedDB database module

**Files:**
- Create: `src/sync/db.js`
- Test: `src/sync/__tests__/db.test.js`

**Interfaces:**
- Produces: `getDb() -> Promise<IDBPDatabase>` (memoized single connection, object stores `syncCache` and `books`), `__resetDbForTests()`. Consumed by Task 3 (`syncCache.js`) and Task 4 (`bookStorage.js`).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/db.test.js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- db.test.js`
Expected: FAIL — `Cannot find module '../db.js'`.

- [ ] **Step 3: Write `db.js`**

```js
// src/sync/db.js
import { openDB } from 'idb';

const DB_NAME = 'absolute-scenes-mobile';
const DB_VERSION = 1;

let dbPromise = null;

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
    });
  }
  return dbPromise;
}

export function __resetDbForTests() {
  dbPromise = null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- db.test.js`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/db.js src/sync/__tests__/db.test.js
git commit -m "feat: add IndexedDB database module for mobile sync persistence"
```

---

### Task 3: Sync cache adapter

**Files:**
- Create: `src/sync/syncCache.js`
- Test: `src/sync/__tests__/syncCache.test.js`

**Interfaces:**
- Consumes: `getDb` (Task 2).
- Produces: `createSyncCache(repoFullName) -> {get(path) -> Promise<{sha,content,encoding}|null>, set(path, entry) -> Promise<void>}` — the exact `cache` interface `@absolute-scenes/git-sync`'s `syncRepo`/`pushSync`/`pullSync` require (mirrors desktop's `createSyncCache(bookFilePath)`, IndexedDB-backed instead of an IPC sidecar file). Consumed by Task 7 (`syncOrchestrator.js`).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/syncCache.test.js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- syncCache.test.js`
Expected: FAIL — `Cannot find module '../syncCache.js'`.

- [ ] **Step 3: Write `syncCache.js`**

```js
// src/sync/syncCache.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- syncCache.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncCache.js src/sync/__tests__/syncCache.test.js
git commit -m "feat: add IndexedDB-backed sync cache for @absolute-scenes/git-sync"
```

---

### Task 4: Local book storage

**Files:**
- Create: `src/sync/bookStorage.js`
- Test: `src/sync/__tests__/bookStorage.test.js`

**Interfaces:**
- Consumes: `getDb` (Task 2).
- Produces: `loadPersistedBook(repoFullName) -> Promise<object|null>`, `savePersistedBook(repoFullName, book) -> Promise<void>`. This is mobile's replacement for desktop's local `.book` file — the durable record of whatever hasn't been pushed yet. Consumed by Task 11 (`App.jsx`).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/bookStorage.test.js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- bookStorage.test.js`
Expected: FAIL — `Cannot find module '../bookStorage.js'`.

- [ ] **Step 3: Write `bookStorage.js`**

```js
// src/sync/bookStorage.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- bookStorage.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/bookStorage.js src/sync/__tests__/bookStorage.test.js
git commit -m "feat: add IndexedDB-backed local book storage, replacing the local .book file"
```

---

### Task 5: Commit author resolution

**Files:**
- Create: `src/sync/commitAuthor.js`
- Test: `src/sync/__tests__/commitAuthor.test.js`

**Interfaces:**
- Consumes: `gitHubService.getUserInfo()` (added in Task 6), `book.github.collaboration.currentAuthor`.
- Produces: `resolveCommitAuthor(book, gitHubService) -> {name: string, email: string}`. Consumed by Task 7 (`syncOrchestrator.js`).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/commitAuthor.test.js
import { test, expect } from 'vitest';
import { resolveCommitAuthor } from '../commitAuthor.js';

test('prefers the book-level collaboration display name over the GitHub login', () => {
  const book = { github: { collaboration: { currentAuthor: 'Alice Writer' } } };
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' }) };
  expect(resolveCommitAuthor(book, gitHubService)).toEqual({
    name: 'Alice Writer',
    email: 'alice@example.com'
  });
});

test('falls back to the GitHub login when no collaboration display name is set', () => {
  const book = { github: {} };
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: null }) };
  expect(resolveCommitAuthor(book, gitHubService)).toEqual({
    name: 'alice',
    email: 'alice@users.noreply.github.com'
  });
});

test('falls back to "Unknown Author" when there is no login either', () => {
  const book = { github: {} };
  const gitHubService = { getUserInfo: () => ({}) };
  const result = resolveCommitAuthor(book, gitHubService);
  expect(result.name).toBe('Unknown Author');
});

test('handles a missing book.github block entirely', () => {
  const gitHubService = { getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' }) };
  expect(resolveCommitAuthor({}, gitHubService)).toEqual({
    name: 'alice',
    email: 'alice@example.com'
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- commitAuthor.test.js`
Expected: FAIL — `Cannot find module '../commitAuthor.js'`.

- [ ] **Step 3: Write `commitAuthor.js`**

Identical logic to desktop's `src/utils/commitAuthor.js`.

```js
// src/sync/commitAuthor.js
export function resolveCommitAuthor(book, gitHubService) {
  const userInfo = gitHubService.getUserInfo() ?? {};
  const name =
    book?.github?.collaboration?.currentAuthor ||
    userInfo.login ||
    'Unknown Author';
  const email = userInfo.email || `${userInfo.login}@users.noreply.github.com`;
  return { name, email };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- commitAuthor.test.js`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/commitAuthor.js src/sync/__tests__/commitAuthor.test.js
git commit -m "feat: add commit author resolution for mobile sync commits"
```

---

### Task 6: Rewrite `gitHubService.js` — auth kept, repo discovery rewritten

**Files:**
- Modify: `src/utils/gitHubService.js`
- Test: `src/utils/__tests__/gitHubService.test.js`

**Interfaces:**
- Consumes: `detectRepoLayout` (from `@absolute-scenes/git-sync`).
- Produces: `getUserInfo() -> object|null` (new), `getUserRepositoriesWithBooks() -> Promise<Array<{fullName, name, description, defaultBranch}>>` (rewritten — no longer single-file-based). `isAuthenticated`, `loadStoredAuth`, `storeAuth`, `clearAuth`, `validateAndSetupToken`, `token` are unchanged. Consumed by Task 7 (`syncOrchestrator.js`) and Task 11 (`App.jsx`).

Repos are now discovered by git-native layout (`book.json` at root, or a legacy single `.book` file that gets migrated on first sync), not by a Contents-API check for a `.book` file — the same `detectRepoLayout` desktop and the shared package already use. The old single-file read/write methods (`downloadBookFromRepository`, `saveBookToRepository`, `checkRepositoryForBookFile`, `getLatestCommitSha`, `getFileAtCommit`, and the `fileShaCache` they used) are removed entirely: content read/write now goes through `syncOrchestrator.js` (Task 7), and the blob-sha cache those methods maintained is superseded by `syncCache.js` (Task 3).

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/gitHubService.test.js
import { vi, beforeEach, afterEach, test, expect } from 'vitest';

vi.mock('@absolute-scenes/git-sync', () => ({
  detectRepoLayout: vi.fn(),
}));

const { detectRepoLayout } = await import('@absolute-scenes/git-sync');
const { default: gitHubService } = await import('../gitHubService.js');

beforeEach(() => {
  localStorage.clear();
  gitHubService.clearAuth();
  vi.restoreAllMocks();
});

test('is not authenticated with no stored token', () => {
  expect(gitHubService.isAuthenticated()).toBe(false);
});

test('validateAndSetupToken stores the token and user info on success', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ login: 'alice', email: 'alice@example.com' }),
  });

  const userInfo = await gitHubService.validateAndSetupToken('ghp_abc123');

  expect(userInfo).toEqual({ login: 'alice', email: 'alice@example.com' });
  expect(gitHubService.isAuthenticated()).toBe(true);
  expect(gitHubService.getUserInfo()).toEqual({ login: 'alice', email: 'alice@example.com' });
});

test('validateAndSetupToken rejects a malformed token before any request', async () => {
  global.fetch = vi.fn();
  await expect(gitHubService.validateAndSetupToken('not-a-token')).rejects.toThrow(
    'Please enter a valid GitHub personal access token'
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

test('validateAndSetupToken surfaces a clear error on 401', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
  await expect(gitHubService.validateAndSetupToken('ghp_bad')).rejects.toThrow('Invalid token');
});

test('getUserRepositoriesWithBooks keeps only repos with a legacy or new-layout book, dropping empty and unrecognized ones', async () => {
  await gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { full_name: 'alice/novel', name: 'novel', description: 'A novel', default_branch: 'main' },
      { full_name: 'alice/empty-repo', name: 'empty-repo', description: null, default_branch: 'main' },
      { full_name: 'alice/legacy-book', name: 'legacy-book', description: null, default_branch: 'master' },
      { full_name: 'alice/readme-only', name: 'readme-only', description: null, default_branch: 'main' },
    ],
  });
  detectRepoLayout
    .mockResolvedValueOnce('new')
    .mockResolvedValueOnce('empty')
    .mockResolvedValueOnce('legacy')
    // A repo with commits but no book content (e.g. GitHub's default
    // "Initialize with a README") -- @absolute-scenes/git-sync@0.2.1
    // classifies this as 'unrecognized', distinct from 'new', specifically
    // so a bare repo like this never gets treated as "already has a book."
    .mockResolvedValueOnce('unrecognized');

  const repos = await gitHubService.getUserRepositoriesWithBooks();

  expect(repos).toEqual([
    { fullName: 'alice/novel', name: 'novel', description: 'A novel', defaultBranch: 'main' },
    { fullName: 'alice/legacy-book', name: 'legacy-book', description: null, defaultBranch: 'master' },
  ]);
});

test('getUserRepositoriesWithBooks throws when not authenticated', async () => {
  await expect(gitHubService.getUserRepositoriesWithBooks()).rejects.toThrow('Not authenticated');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- gitHubService.test.js`
Expected: FAIL — `getUserInfo` is not a function; `getUserRepositoriesWithBooks` still calls the old Contents-API check, not `detectRepoLayout`.

- [ ] **Step 3: Rewrite `gitHubService.js`**

```js
// src/utils/gitHubService.js
/**
 * GitHub Service for AbsoluteScenes Mobile
 * Handles authentication and repository discovery.
 */
import { detectRepoLayout } from '@absolute-scenes/git-sync';

class GitHubService {
  constructor() {
    this.token = null;
    this.userInfo = null;
    this.loadStoredAuth();
  }

  loadStoredAuth() {
    try {
      const storedAuth = localStorage.getItem('github_auth');
      if (storedAuth) {
        const authData = JSON.parse(storedAuth);
        this.token = authData.token;
        this.userInfo = authData.userInfo;
        return true;
      }
    } catch (error) {
      console.warn('Failed to load stored GitHub auth:', error);
    }
    return false;
  }

  storeAuth(token, userInfo) {
    try {
      this.token = token;
      this.userInfo = userInfo;
      localStorage.setItem('github_auth', JSON.stringify({ token, userInfo }));
    } catch (error) {
      console.error('Failed to store GitHub auth:', error);
    }
  }

  clearAuth() {
    this.token = null;
    this.userInfo = null;
    localStorage.removeItem('github_auth');
  }

  isAuthenticated() {
    return !!this.token;
  }

  getUserInfo() {
    return this.userInfo;
  }

  async validateAndSetupToken(token) {
    if (!token || !token.startsWith('ghp_')) {
      throw new Error('Please enter a valid GitHub personal access token');
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AbsoluteScenes-Mobile'
      }
    });

    if (response.status === 401) {
      throw new Error('Invalid token. Please check that you copied it correctly.');
    } else if (response.status === 403) {
      throw new Error('Token lacks required permissions. Please ensure "repo" scope is selected.');
    } else if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userInfo = await response.json();
    this.storeAuth(token, userInfo);
    return userInfo;
  }

  /**
   * Repositories that already hold an AbsoluteScenes book, in either the
   * git-native layout (book.json at root) or the legacy single-.book-file
   * layout that gets migrated automatically on first sync.
   */
  async getUserRepositoriesWithBooks() {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=100',
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AbsoluteScenes-Mobile'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.status}`);
    }

    const repos = await response.json();
    const bookRepos = [];

    for (const repo of repos) {
      const branch = repo.default_branch || 'main';
      const layout = await detectRepoLayout({
        repo: repo.full_name,
        token: this.token,
        branch
      });

      if (layout === 'legacy' || layout === 'new') {
        bookRepos.push({
          fullName: repo.full_name,
          name: repo.name,
          description: repo.description,
          defaultBranch: branch
        });
      }
    }

    return bookRepos;
  }
}

export default new GitHubService();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- gitHubService.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/gitHubService.js src/utils/__tests__/gitHubService.test.js
git commit -m "refactor: rewrite gitHubService repo discovery around git-native layout detection"
```

---

### Task 7: Sync orchestrator

**Files:**
- Create: `src/sync/syncOrchestrator.js`
- Test: `src/sync/__tests__/syncOrchestrator.test.js`

**Interfaces:**
- Consumes: `syncRepo`, `reconcilePostSyncState` (from `@absolute-scenes/git-sync`), `resolveCommitAuthor` (Task 5), `createSyncCache` (Task 3).
- Produces: `syncBook({book, gitHubService}) -> Promise<{bookData, conflicts}|null>`, re-exports `reconcilePostSyncState`. Consumed by Task 11 (`App.jsx`).

This mirrors desktop's `gitSyncService.js` (post-promotion, per the companion plan): a single in-flight guard, `resolveCommitAuthor` for the commit identity, `createSyncCache` per repo, one call into the package's `syncRepo`, and restoring `book.github.*` bookkeeping onto the result (the same bookkeeping-overlay responsibility desktop's own wrapper has — `syncRepo`/`reassembleBook` always return `github: {}`).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/syncOrchestrator.test.js
import { vi, beforeEach, test, expect } from 'vitest';

vi.mock('@absolute-scenes/git-sync', () => ({
  syncRepo: vi.fn(),
  reconcilePostSyncState: vi.fn(),
}));

const gitSync = await import('@absolute-scenes/git-sync');
const { syncBook, __resetInFlightGuardForTests } = await import('../syncOrchestrator.js');

function makeGitHubService() {
  return {
    token: 'tok',
    isAuthenticated: () => true,
    getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' }),
  };
}

function makeBook(overrides = {}) {
  return {
    title: 'T',
    github: {
      repository: { fullName: 'owner/repo', defaultBranch: 'main' },
      lastSyncCommitSha: 'sync-sha',
      collaboration: { currentAuthor: 'Alice' },
      ...overrides,
    },
  };
}

beforeEach(() => {
  __resetInFlightGuardForTests();
  vi.clearAllMocks();
});

test('calls syncRepo with the resolved repo, branch, base commit, author, and a per-repo cache', async () => {
  gitSync.syncRepo.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T', github: {} }, conflicts: [] });

  await syncBook({ book: makeBook(), gitHubService: makeGitHubService() });

  expect(gitSync.syncRepo).toHaveBeenCalledWith(
    expect.objectContaining({
      repo: 'owner/repo',
      branch: 'main',
      lastSyncCommitSha: 'sync-sha',
      author: { name: 'Alice', email: 'alice@example.com' },
      cache: expect.objectContaining({ get: expect.any(Function), set: expect.any(Function) }),
    })
  );
});

test('restores github.repository/collaboration onto the returned bookData', async () => {
  gitSync.syncRepo.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T', github: {} }, conflicts: [] });

  const book = makeBook();
  const result = await syncBook({ book, gitHubService: makeGitHubService() });

  expect(result.bookData.github.repository).toEqual(book.github.repository);
  expect(result.bookData.github.collaboration).toEqual(book.github.collaboration);
  expect(result.bookData.github.lastSyncCommitSha).toBe('new-sha');
  expect(result.bookData.title).toBe('T');
});

test('surfaces conflicts from syncRepo unchanged', async () => {
  gitSync.syncRepo.mockResolvedValue({
    commitSha: 'new-sha',
    bookData: { title: 'T', github: {} },
    conflicts: [{ sceneId: 'sc1' }],
  });

  const result = await syncBook({ book: makeBook(), gitHubService: makeGitHubService() });

  expect(result.conflicts).toEqual([{ sceneId: 'sc1' }]);
});

test('concurrent syncBook calls share one in-flight syncRepo call', async () => {
  let resolveSync;
  gitSync.syncRepo.mockReturnValue(new Promise(resolve => { resolveSync = resolve; }));

  const book = makeBook();
  const call1 = syncBook({ book, gitHubService: makeGitHubService() });
  const call2 = syncBook({ book, gitHubService: makeGitHubService() });

  resolveSync({ commitSha: 'sha', bookData: { title: 'T', github: {} }, conflicts: [] });
  await Promise.all([call1, call2]);

  expect(gitSync.syncRepo).toHaveBeenCalledTimes(1);
});

test('skips entirely when not authenticated', async () => {
  const gitHubService = { isAuthenticated: () => false, getUserInfo: () => null };
  const result = await syncBook({ book: makeBook(), gitHubService });
  expect(result).toBeNull();
  expect(gitSync.syncRepo).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- syncOrchestrator.test.js`
Expected: FAIL — `Cannot find module '../syncOrchestrator.js'`.

- [ ] **Step 3: Write `syncOrchestrator.js`**

```js
// src/sync/syncOrchestrator.js
import { syncRepo, reconcilePostSyncState } from '@absolute-scenes/git-sync';
import { resolveCommitAuthor } from './commitAuthor.js';
import { createSyncCache } from './syncCache.js';

export { reconcilePostSyncState };

let inFlight = null;

export function __resetInFlightGuardForTests() {
  inFlight = null;
}

export async function syncBook({ book, gitHubService }) {
  if (!gitHubService.isAuthenticated()) return null;
  if (inFlight) return inFlight;

  inFlight = runSync({ book, gitHubService }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync({ book, gitHubService }) {
  const repo = book.github.repository.fullName;
  const branch = book.github.repository.defaultBranch || 'main';
  const token = gitHubService.token;
  const author = resolveCommitAuthor(book, gitHubService);
  const cache = createSyncCache(repo);

  const result = await syncRepo({
    repo,
    token,
    branch,
    bookData: book,
    lastSyncCommitSha: book.github.lastSyncCommitSha,
    cache,
    author
  });

  const bookData = {
    ...result.bookData,
    github: {
      ...book.github,
      lastSyncCommitSha: result.commitSha,
      lastSyncTime: new Date().toISOString()
    }
  };

  return { bookData, conflicts: result.conflicts };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- syncOrchestrator.test.js`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncOrchestrator.js src/sync/__tests__/syncOrchestrator.test.js
git commit -m "feat: add mobile sync orchestrator over @absolute-scenes/git-sync"
```

---

### Task 8: Sync trigger hook

**Files:**
- Create: `src/sync/useSyncTriggers.js`
- Test: `src/sync/__tests__/useSyncTriggers.test.js`

**Interfaces:**
- Produces: `useSyncTriggers(triggerSync: () => void, {enabled: boolean}) -> void`. Consumed by Task 11 (`App.jsx`). Scene-switch is *not* handled by this hook — `App.jsx` calls `triggerSync` directly from its own scene-switch handlers, since that's app-state-driven, not a browser lifecycle event.

Covers, per the spec's trigger model: on load / app becoming visible again, on `visibilitychange` to hidden, on the `online` event, and a foreground-only periodic tick (checked against `document.visibilityState` on every fire, since a background timer cannot be trusted to keep running — particularly on iOS Safari).

- [ ] **Step 1: Write the failing test**

```js
// src/sync/__tests__/useSyncTriggers.test.js
import { vi, test, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSyncTriggers } from '../useSyncTriggers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('fires once immediately when enabled', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('does not fire when disabled', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: false }));
  expect(triggerSync).not.toHaveBeenCalled();
});

test('fires on visibilitychange', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('fires on the online event', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  window.dispatchEvent(new Event('online'));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('the periodic tick only fires while the document is visible', () => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).not.toHaveBeenCalled();

  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('cleans up listeners and the interval on unmount', () => {
  vi.useFakeTimers();
  const triggerSync = vi.fn();
  const { unmount } = renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  unmount();
  triggerSync.mockClear();
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- useSyncTriggers.test.js`
Expected: FAIL — `Cannot find module '../useSyncTriggers.js'`.

- [ ] **Step 3: Write `useSyncTriggers.js`**

```js
// src/sync/useSyncTriggers.js
import { useEffect } from 'react';

const PERIODIC_INTERVAL_MS = 2 * 60 * 1000;

export function useSyncTriggers(triggerSync, { enabled }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleVisibilityChange = () => triggerSync();
    const handleOnline = () => triggerSync();
    const handleTick = () => {
      if (document.visibilityState === 'visible') triggerSync();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    const intervalId = setInterval(handleTick, PERIODIC_INTERVAL_MS);

    // Fire once immediately on mount/re-enable -- covers both the initial
    // load and "the tab was backgrounded and possibly evicted, now it's
    // back" without waiting for the first passive trigger.
    triggerSync();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      clearInterval(intervalId);
    };
  }, [triggerSync, enabled]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- useSyncTriggers.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/useSyncTriggers.js src/sync/__tests__/useSyncTriggers.test.js
git commit -m "feat: add browser-lifecycle sync trigger hook"
```

---

### Task 9: Conflict badge UI

**Files:**
- Modify: `src/components/BookOverview.jsx`
- Modify: `src/components/BookOverview.css`
- Modify: `src/components/SceneEditor.jsx`
- Test: `src/components/__tests__/BookOverview.test.jsx`
- Test: `src/components/__tests__/SceneEditor.test.jsx`

**Interfaces:**
- Consumes: `conflictSceneIds: string[]` (new prop, populated in Task 11's `App.jsx`), `syncStatusText: string|null` (new prop, also Task 11).
- Produces: no new exports — additive props only, both defaulting so existing render paths are unaffected until Task 11 wires real values in.

Replaces the old `ConflictResolution.jsx` full-overlay model (deleted in Task 11) with desktop's own pattern: conflicts are resolved by the user editing the affected scene (diff3 conflict markers land directly in its content, per `@absolute-scenes/git-sync`'s `mergeSceneContent`) and saving again — there is no separate resolution step or UI.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/components/__tests__/BookOverview.test.jsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import BookOverview from '../BookOverview.jsx';

function makeBook() {
  return {
    title: 'My Book',
    author: 'A. Writer',
    chapters: [
      {
        id: 'ch1',
        title: 'Chapter 1',
        scenes: [
          { id: 'sc1', title: 'Scene One', content: 'hello world' },
          { id: 'sc2', title: 'Scene Two', content: 'more words here' }
        ]
      }
    ]
  };
}

test('shows a conflict badge only on scenes listed in conflictSceneIds', () => {
  render(
    <BookOverview
      book={makeBook()}
      onSelectScene={() => {}}
      onAddChapter={() => {}}
      onAddScene={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      conflictSceneIds={['sc2']}
    />
  );

  expect(screen.getByText('Scene One').closest('button')).not.toHaveTextContent('⚠');
  expect(screen.getByText('Scene Two').closest('button')).toHaveTextContent('⚠');
});

test('renders the sync status text when provided', () => {
  render(
    <BookOverview
      book={makeBook()}
      onSelectScene={() => {}}
      onAddChapter={() => {}}
      onAddScene={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      conflictSceneIds={[]}
      syncStatusText="Synced 2m ago"
    />
  );

  expect(screen.getByText('Synced 2m ago')).toBeInTheDocument();
});
```

```jsx
// src/components/__tests__/SceneEditor.test.jsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import SceneEditor from '../SceneEditor.jsx';

function makeScene() {
  return { id: 'sc1', title: 'Scene One', content: '<<<<<<< LOCAL\nmine\n=======\ntheirs\n>>>>>>> REMOTE' };
}

test('shows a conflict banner when hasConflict is true', () => {
  render(
    <SceneEditor
      scene={makeScene()}
      chapter={{ id: 'ch1', title: 'Chapter 1' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      hasConflict={true}
    />
  );

  expect(screen.getByText(/merge conflict/i)).toBeInTheDocument();
});

test('does not show a conflict banner when hasConflict is false', () => {
  render(
    <SceneEditor
      scene={makeScene()}
      chapter={{ id: 'ch1', title: 'Chapter 1' }}
      book={{}}
      onSave={() => {}}
      onBack={() => {}}
      isLoading={false}
      error={null}
      hasConflict={false}
    />
  );

  expect(screen.queryByText(/merge conflict/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- BookOverview.test.jsx SceneEditor.test.jsx`
Expected: FAIL — no conflict badge, no sync status text, no conflict banner rendered yet.

- [ ] **Step 3: Add the badge and status text to `BookOverview.jsx`**

```jsx
// src/components/BookOverview.jsx
import './BookOverview.css';

function BookOverview({
  book,
  onSelectScene,
  onAddChapter,
  onAddScene,
  onBack,
  isLoading,
  error,
  conflictSceneIds = [],
  syncStatusText = null
}) {
  return (
    <div className="book-overview">
      <header className="app-header">
        <button onClick={onBack} className="btn-back">
          ← Back
        </button>
        <h1>{book.title}</h1>
      </header>

      <div className="content">
        {error && <div className="error-message">{error}</div>}

        <div className="book-info">
          <p className="author">by {book.author}</p>
          {syncStatusText && <p className="sync-status">{syncStatusText}</p>}
        </div>

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
            <span>Loading book...</span>
          </div>
        ) : book.chapters && book.chapters.length > 0 ? (
          <div className="chapters">
            {book.chapters.map((chapter, chapterIndex) => (
              <div key={chapter.id} className="chapter-card">
                <h2 className="chapter-title">
                  Chapter {chapterIndex + 1}: {chapter.title}
                </h2>
                {chapter.scenes && chapter.scenes.length > 0 ? (
                  <ul className="scene-list">
                    {chapter.scenes.map((scene) => (
                      <li key={scene.id} className="scene-item">
                        <button
                          onClick={() => onSelectScene(scene, chapter)}
                          className="scene-button"
                        >
                          <span className="scene-title">
                            {scene.title}
                            {conflictSceneIds.includes(scene.id) && (
                              <span className="conflict-badge" title="Has a merge conflict — open to resolve">
                                {' '}⚠
                              </span>
                            )}
                          </span>
                          <span className="scene-length">
                            {scene.content.split(/\s+/).filter(w => w.length > 0).length} words
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-chapter">No scenes in this chapter</p>
                )}
                <button
                  onClick={() => onAddScene(chapter.id)}
                  className="btn-add-scene"
                  disabled={isLoading}
                >
                  + Add Scene
                </button>
              </div>
            ))}
            <button
              onClick={onAddChapter}
              className="btn-add-chapter"
              disabled={isLoading}
            >
              + Add Chapter
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p>This book has no chapters yet</p>
            <button
              onClick={onAddChapter}
              className="btn-add-chapter"
              disabled={isLoading}
            >
              + Add Chapter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BookOverview;
```

```css
/* Append to src/components/BookOverview.css */
.sync-status {
  font-size: 13px;
  color: #888;
  margin-top: 0.25rem;
}

.conflict-badge {
  color: #b45309;
}
```

- [ ] **Step 4: Add the conflict banner to `SceneEditor.jsx`**

```jsx
// src/components/SceneEditor.jsx
import { useState, useEffect } from 'react';
import './SceneEditor.css';

function SceneEditor({ scene, chapter, book, onSave, onBack, isLoading, error, hasConflict = false }) {
  const [content, setContent] = useState(scene.content);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setContent(scene.content);
  }, [scene.id]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="scene-editor">
      <header className="editor-header">
        <button onClick={onBack} className="btn-back" disabled={isSaving}>
          ← Back
        </button>
        <div className="editor-title">
          <h1>{scene.title}</h1>
          <span className="chapter-info">{chapter.title}</span>
        </div>
        <button
          onClick={handleSave}
          className="btn-save"
          disabled={isSaving || isLoading}
        >
          {isSaving ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="spinner-small"></div>
              Saving...
            </span>
          ) : (
            'Save'
          )}
        </button>
      </header>

      <div className="editor-content">
        {error && <div className="error-message">{error}</div>}
        {saveSuccess && <div className="success-message">Saved successfully!</div>}
        {hasConflict && (
          <div className="conflict-notice">
            This scene has a merge conflict — resolve the `&lt;&lt;&lt;&lt;&lt;&lt;&lt;` markers below and save.
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing your scene..."
          className="scene-textarea"
          disabled={isSaving}
        />

        <div className="editor-footer">
          <span className="word-count">
            {content.split(/\s+/).filter(w => w.length > 0).length} words
          </span>
        </div>
      </div>
    </div>
  );
}

export default SceneEditor;
```

```css
/* Append to src/components/SceneEditor.css */
.conflict-notice {
  background: #fef3c7;
  color: #92400e;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 14px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- BookOverview.test.jsx SceneEditor.test.jsx`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/BookOverview.jsx src/components/BookOverview.css src/components/SceneEditor.jsx src/components/SceneEditor.css src/components/__tests__/BookOverview.test.jsx src/components/__tests__/SceneEditor.test.jsx
git commit -m "feat: show conflicts as an inline scene badge instead of a resolution overlay"
```

---

### Task 10: `RepositoryList.jsx` adjustment

**Files:**
- Modify: `src/components/RepositoryList.jsx`
- Test: `src/components/__tests__/RepositoryList.test.jsx`

**Interfaces:**
- Consumes: repo objects shaped `{fullName, name, description, defaultBranch}` (Task 6's new return shape — no `bookFileName`, since a book is now a set of files, not one file).

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/__tests__/RepositoryList.test.jsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import RepositoryList from '../RepositoryList.jsx';

test('renders repo name and description without a filename badge', () => {
  render(
    <RepositoryList
      repositories={[{ fullName: 'alice/novel', name: 'novel', description: 'A novel', defaultBranch: 'main' }]}
      onSelectRepo={() => {}}
      onLogout={() => {}}
      isLoading={false}
      error={null}
    />
  );

  expect(screen.getByText('novel')).toBeInTheDocument();
  expect(screen.getByText('A novel')).toBeInTheDocument();
  expect(screen.queryByText(/\.book/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- RepositoryList.test.jsx`
Expected: FAIL if the old markup happens to render a stray `.book` filename from a leftover `bookFileName` field in a test fixture — in this case it passes trivially since the fixture already omits `bookFileName`, so instead confirm intent by temporarily asserting the *old* `repo-file` element is gone:

Run: `npm test -- RepositoryList.test.jsx` and additionally check manually that `repo.bookFileName` is referenced nowhere in the component before Step 3 — `grep -n bookFileName src/components/RepositoryList.jsx` should show one hit (the JSX line), confirming Step 3 has something real to remove.

- [ ] **Step 3: Update `RepositoryList.jsx`**

```jsx
// src/components/RepositoryList.jsx
import './RepositoryList.css';

function RepositoryList({ repositories, onSelectRepo, onLogout, isLoading, error }) {
  return (
    <div className="repository-list">
      <header className="app-header">
        <h1>Your Books</h1>
        <button onClick={onLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="content">
        {error && <div className="error-message">{error}</div>}

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
            <span>Loading your books...</span>
          </div>
        ) : repositories.length === 0 ? (
          <div className="empty-state">
            <p>No books found in your GitHub repositories</p>
            <p className="hint">Books must have a book.json (or a legacy .book file) in the repository root</p>
          </div>
        ) : (
          <ul className="repo-list">
            {repositories.map((repo) => (
              <li key={repo.fullName} className="repo-item">
                <button
                  onClick={() => onSelectRepo(repo)}
                  className="repo-button"
                >
                  <div className="repo-icon">📖</div>
                  <div className="repo-info">
                    <h3>{repo.name}</h3>
                    {repo.description && (
                      <p className="repo-description">{repo.description}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RepositoryList;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- RepositoryList.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RepositoryList.jsx src/components/__tests__/RepositoryList.test.jsx
git commit -m "refactor: drop the single-filename badge from RepositoryList (books are now file sets)"
```

---

### Task 11: `App.jsx` rewire — the walking skeleton

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/utils/browserEnhancedGitHubService.js`
- Delete: `src/utils/browserCollaborationService.js`
- Delete: `src/components/ConflictResolution.jsx`
- Delete: `src/components/ConflictResolution.css`
- Test: `src/__tests__/App.test.jsx`

**Interfaces:**
- Consumes: `syncBook`, `reconcilePostSyncState` (Task 7), `loadPersistedBook`, `savePersistedBook` (Task 4), `useSyncTriggers` (Task 8), `gitHubService` (Task 6), `BookOverview`/`SceneEditor` (Task 9), `RepositoryList` (Task 10).

This is the task that actually reaches the walking skeleton: load from IndexedDB immediately on mount (no network wait), edits update state and persist locally straight away, and a background sync fires off the trigger hook plus scene-switch. The `bookRef`/`setBook` pattern below mirrors desktop's own `useBookState.js` — `bookRef.current` is updated synchronously in the same call as `setBook`'s state update, so a sync's in-flight snapshot comparison (`performSync`'s `reconcilePostSyncState` call) never reads a stale value even if another `setBook` happens while the sync's network round-trip is still pending.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/__tests__/App.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, test, expect } from 'vitest';

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    static getCameras() { return Promise.resolve([]); }
  }
}));

vi.mock('../sync/syncOrchestrator.js', () => ({
  syncBook: vi.fn(),
  reconcilePostSyncState: vi.fn((base, local, remote) => ({ bookData: remote, conflicts: [] })),
}));

vi.mock('../sync/bookStorage.js', () => ({
  loadPersistedBook: vi.fn(),
  savePersistedBook: vi.fn(),
}));

const { syncBook } = await import('../sync/syncOrchestrator.js');
const { loadPersistedBook, savePersistedBook } = await import('../sync/bookStorage.js');
const { default: gitHubService } = await import('../utils/gitHubService.js');
const { default: App } = await import('../App.jsx');

function pulledBook() {
  return {
    title: 'Existing Repo Book',
    author: 'A. Writer',
    chapters: [{ id: 'ch1', title: 'Chapter 1', scenes: [{ id: 'sc1', title: 'Scene One', content: 'hi' }] }],
    github: { repository: { fullName: 'alice/novel', name: 'novel', description: null, defaultBranch: 'main' }, lastSyncCommitSha: 'sha-1' }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  gitHubService.clearAuth();
  loadPersistedBook.mockResolvedValue(null);
  savePersistedBook.mockResolvedValue(undefined);
});

test('shows the login screen when not authenticated', () => {
  render(<App />);
  expect(screen.getByText(/AbsoluteScenes Mobile/i)).toBeInTheDocument();
});

test('after selecting a repo with no persisted book, a first sync pulls its content into view', async () => {
  gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ full_name: 'alice/novel', name: 'novel', description: null, default_branch: 'main' }]
  });
  vi.doMock('@absolute-scenes/git-sync', () => ({ detectRepoLayout: vi.fn().mockResolvedValue('new') }));
  syncBook.mockResolvedValue({ bookData: pulledBook(), conflicts: [] });

  render(<App />);

  const repoButton = await screen.findByText('novel');
  await userEvent.click(repoButton);

  await waitFor(() => expect(screen.getByText('Existing Repo Book')).toBeInTheDocument());
  expect(syncBook).toHaveBeenCalled();
});

test('editing a scene persists it locally immediately and fires a background sync', async () => {
  gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ full_name: 'alice/novel', name: 'novel', description: null, default_branch: 'main' }]
  });
  vi.doMock('@absolute-scenes/git-sync', () => ({ detectRepoLayout: vi.fn().mockResolvedValue('new') }));
  syncBook.mockResolvedValue({ bookData: pulledBook(), conflicts: [] });

  render(<App />);
  await userEvent.click(await screen.findByText('novel'));
  await waitFor(() => expect(screen.getByText('Existing Repo Book')).toBeInTheDocument());

  await userEvent.click(screen.getByText('Scene One'));
  const textarea = await screen.findByPlaceholderText(/start writing/i);
  await userEvent.clear(textarea);
  await userEvent.type(textarea, 'new content');
  syncBook.mockClear();
  await userEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(savePersistedBook).toHaveBeenCalledWith(
    'alice/novel',
    expect.objectContaining({ chapters: expect.any(Array) })
  ));
  expect(syncBook).toHaveBeenCalled();
});

test('a conflict reported by sync shows up as a scene badge', async () => {
  gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ full_name: 'alice/novel', name: 'novel', description: null, default_branch: 'main' }]
  });
  vi.doMock('@absolute-scenes/git-sync', () => ({ detectRepoLayout: vi.fn().mockResolvedValue('new') }));
  syncBook.mockResolvedValue({ bookData: pulledBook(), conflicts: [{ sceneId: 'sc1' }] });

  render(<App />);
  await userEvent.click(await screen.findByText('novel'));

  await waitFor(() => expect(screen.getByText('Scene One').closest('button')).toHaveTextContent('⚠'));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- App.test.jsx`
Expected: FAIL — `App.jsx` still imports the deleted `browserEnhancedGitHubService`/`ConflictResolution` modules and never calls `syncBook`/`loadPersistedBook`.

- [ ] **Step 3: Delete the superseded files**

```bash
rm src/utils/browserEnhancedGitHubService.js
rm src/utils/browserCollaborationService.js
rm src/components/ConflictResolution.jsx
rm src/components/ConflictResolution.css
```

- [ ] **Step 4: Rewrite `App.jsx`**

```jsx
// src/App.jsx
import { useState, useCallback, useRef } from 'react';
import LoginScreen from './components/LoginScreen';
import RepositoryList from './components/RepositoryList';
import BookOverview from './components/BookOverview';
import SceneEditor from './components/SceneEditor';
import gitHubService from './utils/gitHubService';
import { syncBook, reconcilePostSyncState } from './sync/syncOrchestrator.js';
import { loadPersistedBook, savePersistedBook } from './sync/bookStorage.js';
import { useSyncTriggers } from './sync/useSyncTriggers.js';
import './App.css';

function formatSyncStatus(book) {
  if (!navigator.onLine) return 'Offline — will sync when connection returns';
  const lastSyncTime = book?.github?.lastSyncTime;
  if (!lastSyncTime) return 'Not yet synced';
  const minutesAgo = Math.round((Date.now() - new Date(lastSyncTime).getTime()) / 60000);
  if (minutesAgo < 1) return 'Synced just now';
  return `Synced ${minutesAgo}m ago`;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(gitHubService.isAuthenticated());
  const [isLoading, setIsLoading] = useState(false);
  const [repositories, setRepositories] = useState([]);
  const [book, setBookState] = useState(null);
  const [currentScene, setCurrentScene] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [error, setError] = useState(null);
  const [conflictSceneIds, setConflictSceneIds] = useState([]);

  const bookRef = useRef(null);
  const setBook = useCallback(newBook => {
    bookRef.current = newBook;
    setBookState(newBook);
  }, []);

  const performSync = useCallback(async () => {
    const snapshotBook = bookRef.current;
    if (!snapshotBook?.github?.repository) return null;

    try {
      const result = await syncBook({ book: snapshotBook, gitHubService });
      if (!result) return null;

      const { bookData, conflicts } = reconcilePostSyncState(
        snapshotBook,
        bookRef.current,
        result.bookData
      );
      setBook(bookData);
      await savePersistedBook(bookData.github.repository.fullName, bookData);
      setConflictSceneIds([
        ...new Set([
          ...result.conflicts.map(c => c.sceneId),
          ...conflicts.map(c => c.sceneId)
        ])
      ]);
      return result;
    } catch (err) {
      // Background sync triggers fail silently -- a transient offline blip
      // shouldn't interrupt writing.
      console.error('Sync failed:', err);
      return null;
    }
  }, [setBook]);

  useSyncTriggers(performSync, { enabled: !!book });

  const handleLogin = async token => {
    setIsLoading(true);
    setError(null);
    try {
      await gitHubService.validateAndSetupToken(token);
      setIsAuthenticated(true);
      await loadRepositories();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    gitHubService.clearAuth();
    setIsAuthenticated(false);
    setRepositories([]);
    setBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);
  };

  const loadRepositories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repos = await gitHubService.getUserRepositoriesWithBooks();
      setRepositories(repos);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectRepo = async repo => {
    setError(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);

    const persisted = await loadPersistedBook(repo.fullName);
    if (persisted) {
      setBook(persisted);
    } else {
      // No local record yet -- a stub with no lastSyncCommitSha. The first
      // sync trigger (useSyncTriggers fires immediately on enable) pulls the
      // repo's real content wholesale instead of pushing this stub as a
      // "merge" against it.
      setBook({
        title: '',
        author: '',
        chapters: [],
        illustrations: [],
        metadata: {},
        github: { repository: repo }
      });
    }
  };

  const selectScene = (scene, chapter) => {
    setCurrentScene(scene);
    setCurrentChapter(chapter);
    performSync();
  };

  const goBackToOverview = () => {
    setCurrentScene(null);
    setCurrentChapter(null);
    performSync();
  };

  const goBackToBooks = () => {
    setBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);
  };

  const persistAndSync = async updatedBook => {
    setBook(updatedBook);
    await savePersistedBook(updatedBook.github.repository.fullName, updatedBook);
    performSync();
  };

  const addChapter = async () => {
    if (!bookRef.current) return;
    const newChapter = {
      id: Date.now().toString(),
      title: `Chapter ${bookRef.current.chapters.length + 1}`,
      scenes: [],
      assignedAuthor: null
    };
    await persistAndSync({
      ...bookRef.current,
      chapters: [...bookRef.current.chapters, newChapter],
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    });
  };

  const addScene = async chapterId => {
    if (!bookRef.current) return;
    const chapter = bookRef.current.chapters.find(ch => ch.id === chapterId);
    if (!chapter) return;

    const newScene = {
      id: Date.now().toString(),
      title: `Scene ${chapter.scenes.length + 1}`,
      content: '',
      notes: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      assignedAuthor: null
    };
    const updatedBook = {
      ...bookRef.current,
      chapters: bookRef.current.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, scenes: [...ch.scenes, newScene] } : ch
      ),
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    };
    await persistAndSync(updatedBook);
    setCurrentScene(newScene);
    setCurrentChapter(updatedBook.chapters.find(ch => ch.id === chapterId));
  };

  const saveScene = async content => {
    if (!currentScene || !bookRef.current || !currentChapter) return;
    const updatedScene = { ...currentScene, content, modified: new Date().toISOString() };
    const updatedBook = {
      ...bookRef.current,
      chapters: bookRef.current.chapters.map(ch =>
        ch.id === currentChapter.id
          ? { ...ch, scenes: ch.scenes.map(s => (s.id === currentScene.id ? updatedScene : s)) }
          : ch
      ),
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    };
    setCurrentScene(updatedScene);
    await persistAndSync(updatedBook);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} isLoading={isLoading} error={error} />;
  }

  if (currentScene && book) {
    return (
      <SceneEditor
        scene={currentScene}
        chapter={currentChapter}
        book={book}
        onSave={saveScene}
        onBack={goBackToOverview}
        isLoading={isLoading}
        error={error}
        hasConflict={conflictSceneIds.includes(currentScene.id)}
      />
    );
  }

  if (book) {
    return (
      <BookOverview
        book={book}
        onSelectScene={selectScene}
        onAddChapter={addChapter}
        onAddScene={addScene}
        onBack={goBackToBooks}
        isLoading={isLoading}
        error={error}
        conflictSceneIds={conflictSceneIds}
        syncStatusText={formatSyncStatus(book)}
      />
    );
  }

  return (
    <RepositoryListWithLoad
      repositories={repositories}
      onSelectRepo={selectRepo}
      onLogout={handleLogout}
      isLoading={isLoading}
      error={error}
      loadRepositories={loadRepositories}
    />
  );
}

// Loads repositories on first render of the repo-list screen (mirrors the
// old top-level mount effect, scoped to this screen since App no longer has
// a single "authenticated" useEffect -- isAuthenticated can flip true from
// handleLogin, which already calls loadRepositories itself; this covers the
// remaining case of a page reload with a token already in localStorage).
function RepositoryListWithLoad({ loadRepositories, ...props }) {
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    loadRepositories();
  }
  return <RepositoryList {...props} />;
}

export default App;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- App.test.jsx`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Confirm no other file references the deleted modules**

Run: `grep -rn "browserEnhancedGitHubService\|browserCollaborationService\|ConflictResolution" src/`
Expected: no output.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS, every suite from Tasks 1–11.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rewire App.jsx onto the IndexedDB-backed sync orchestrator, drop the old sync stack"
```

---

### Task 12: Real-device walking-skeleton verification

**Files:** none (manual verification against a real GitHub repo and phone browser)

This is the spec's required first delivered unit: a real, live-testable round trip, checked on a real phone before any further feature is built on top of it.

- [ ] **Step 1: Start the dev server reachable over the LAN**

Run: `npm run dev -- --host`
Note the LAN URL Vite prints (e.g. `http://192.168.1.x:5173/`).

- [ ] **Step 2: Load it on a real phone browser**

Open that LAN URL on a phone on the same network. Confirm the login screen renders.

- [ ] **Step 3: Sign in**

Paste a real GitHub PAT with `repo` scope (or scan a QR code from the desktop app, if that flow is already wired on the desktop side). Confirm the repository list loads and shows a real test repository.

- [ ] **Step 4: Connect a repo and confirm the first sync**

Tap a repo with existing book content (or an empty test repo, to exercise the bootstrap path). Confirm the book's real chapters/scenes appear (or, for an empty repo, that a bootstrap commit lands — see Step 6).

- [ ] **Step 5: Edit a scene**

Open a scene, change its text, tap Save. Confirm the UI returns to the book overview without hanging.

- [ ] **Step 6: Verify the commit landed for real, against the GitHub API directly**

Run (substituting the real repo and token):

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>/commits?per_page=1" | \
  python3 -c "import json,sys; c=json.load(sys.stdin)[0]; print(c['sha'], c['commit']['message'])"
```

Expected: the most recent commit's message is `Sync` (or `bootstrap: initial commit` for a freshly bootstrapped repo), authored close to when Step 5 happened.

Then verify the edited scene's actual content landed, not just a commit:

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>/contents/scenes/<sceneId>.md" | \
  python3 -c "import json,sys,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())"
```

Expected: the exact text typed in Step 5.

- [ ] **Step 7: Background the tab and bring it back**

Switch to another app on the phone for 30+ seconds, then return. Confirm no crash and the book is still shown (from IndexedDB, not re-fetched from scratch).

- [ ] **Step 8: Toggle airplane mode**

Turn on airplane mode, edit another scene and save. Confirm the edit is visible locally and the UI does not hang or error. Turn airplane mode back off and confirm (via the same `curl` check as Step 6, after waiting ~2 minutes for the periodic trigger or backgrounding/foregrounding the tab once to fire the visibility trigger) that the edit reaches GitHub.

- [ ] **Step 9: Record the result**

If every step passes, this is the walking skeleton the spec calls for — safe to build further increments (e.g. the deferred book-overview UX work) on top of it. If any step fails, treat it as a bug against this plan's tasks, not a follow-up plan.

---

## Self-review notes (from the plan author, before handoff)

- **Spec coverage:** local persistence via IndexedDB, offline-first render (Task 4, Task 11 Step 4's `selectRepo`), promoted orchestration fixes reused rather than re-derived (Task 7, depends on the companion plan), browser-lifecycle trigger model (Task 8), staleness indicator (Task 9/11's `formatSyncStatus`), conflict UX matching desktop's badge-not-overlay pattern (Task 9), walking-skeleton-first delivery with real-device verification (Task 12). Output generation and book-overview/navigation UX overhaul are confirmed out of scope and untouched by any task.
- **Type consistency:** `syncBook`'s `{bookData, conflicts}` return shape (Task 7) matches what Task 11's `performSync` destructures. `createSyncCache`'s `{get, set}` shape (Task 3) matches what `syncRepo` (companion plan) expects. Repo objects are `{fullName, name, description, defaultBranch}` consistently from Task 6's `gitHubService.getUserRepositoriesWithBooks` through Task 10's `RepositoryList` and Task 11's `selectRepo`/`book.github.repository`.
- **Known scope boundary:** continuous autosave-while-typing in `SceneEditor` is deliberately not added — the existing explicit-Save-button model already satisfies "persisted independent of sync," and adding debounced keystroke autosave would be scope beyond this pass's walking skeleton (the app's own positioning is "not a full-parity editor").
- **Sequencing dependency:** this plan cannot start until the companion plan (`2026-08-31-promote-orchestration-into-git-sync.md`) has published `@absolute-scenes/git-sync@0.2.0` — every task from Task 1 onward pins to that tag.
