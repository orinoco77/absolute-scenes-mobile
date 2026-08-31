# Promote Orchestration Fixes Into @absolute-scenes/git-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two sync-orchestration bug fixes that currently live only in desktop's `gitSyncService.js` (in-flight-edit reconciliation, first-sync-pulls-not-pushes) into `@absolute-scenes/git-sync` itself, then update desktop to call the promoted versions instead of its own copies — so mobile (companion plan) inherits both fixes for free instead of re-deriving them.

**Architecture:** `@absolute-scenes/git-sync` gains two new exports: `reconcilePostSyncState` (moved verbatim — it already has zero platform dependencies, only using `projectBook`/`reassembleBook`/`mergeSceneContent`/`mergeBookMetadata`, all already in the package) and `syncRepo` (a new higher-level orchestrator that inlines the layout-detection/bootstrap/migrate/first-sync-pull-vs-push decision tree currently duplicated inside desktop's `runSync`). Desktop's `gitSyncService.js` shrinks to platform-specific glue only: resolving the commit author, building the IPC-backed cache, calling `syncRepo`, and restoring `book.github.*` bookkeeping onto the result (that bookkeeping shape is per-platform and deliberately stays out of the package, exactly as it does today for `pushSync`/`pullSync`).

**Tech Stack:** `@absolute-scenes/git-sync` (Node, native ESM, Jest with `--experimental-vm-modules` and `jest.unstable_mockModule`); `absolute-scenes` desktop app (Electron, React, Jest with `babel-jest`).

**Spec:** `docs/superpowers/specs/2026-08-31-mobile-git-native-sync-design.md` (section "Promoting the orchestration fixes into the shared package")

## Global Constraints

- `@absolute-scenes/git-sync`'s existing convention for mocking sibling modules in tests is `jest.unstable_mockModule`, registered before any dynamic `import()` of the module under test — plain `jest.spyOn` does not work on this package's native-ESM read-only export bindings (established in `src/migration.test.js`). Every new test in this package follows that same pattern.
- Desktop's pre-commit hook runs the full Jest suite plus `eslint --max-warnings 0` on every commit — no task may land code that isn't fully covered and lint-clean.
- `syncRepo`'s returned `bookData` still comes from `reassembleBook`, which always sets `github: {}` (documented in the package's own tests). Restoring real `github.*` bookkeeping (`repository`, `collaboration`, `lastSyncCommitSha`, `lastSyncTime`) remains each caller's responsibility, unchanged from today's `pushSync`/`pullSync` contract.
- Publishing a new package version (Task 2) means pushing a git tag to `orinoco77/absolute-scenes-git-sync` — a shared, externally-visible action. Stop and get explicit confirmation before running the `git push --tags` step.

---

### Task 1: Add `syncRepo` and `reconcilePostSyncState` to the package

**Files:**
- Create: `~/RiderProjects/absolute-scenes-git-sync/src/syncRepo.js`
- Create: `~/RiderProjects/absolute-scenes-git-sync/src/syncRepo.test.js`
- Create: `~/RiderProjects/absolute-scenes-git-sync/src/reconcile.js`
- Create: `~/RiderProjects/absolute-scenes-git-sync/src/reconcile.test.js`
- Modify: `~/RiderProjects/absolute-scenes-git-sync/index.js`

**Interfaces:**
- Consumes: `detectRepoLayout`, `migrateLegacyRepo` (`src/migration.js`); `pushSync`, `pullSync` (`src/sync.js`); `getRef`, `getCommit`, `getTree`, `bootstrapEmptyRepo` (`src/apiClient.js`); `projectBook`, `reassembleBook` (`src/project.js`); `mergeSceneContent` (`src/mergeScene.js`); `mergeBookMetadata` (`src/mergeMetadata.js`).
- Produces: `syncRepo({repo, token, branch, bookData, lastSyncCommitSha, cache, author}) -> Promise<{commitSha, bookData, conflicts}>` and `reconcilePostSyncState(base, local, remote) -> {bookData, conflicts}`. Both consumed by Task 2 (desktop's `gitSyncService.js`) and by the companion mobile plan's sync orchestrator.

- [ ] **Step 1: Write the failing test for `reconcilePostSyncState`**

This is a verbatim port of desktop's existing `src/services/__tests__/postSyncReconciliation.test.js` — same scenarios, same assertions, only the import path changes.

```js
// ~/RiderProjects/absolute-scenes-git-sync/src/reconcile.test.js
import { reconcilePostSyncState } from './reconcile.js';

function makeBook() {
  return {
    title: 'T',
    author: 'A',
    frontMatter: [],
    backMatter: [],
    parts: [],
    chapters: [
      {
        id: 'ch1',
        title: 'Chapter 1',
        scenes: [
          {
            id: 'sc1',
            title: 'Scene 1',
            content: 'original content',
            notes: '',
            created: '',
            modified: '',
            assignedAuthor: ''
          }
        ]
      }
    ],
    illustrations: [],
    characters: [],
    characterDetectionBlacklist: [],
    locations: [],
    backgroundFolders: [],
    template: {},
    collaboration: {},
    metadata: {},
    github: { repository: { full_name: 'o/r' }, lastSyncCommitSha: 'old-sha' }
  };
}

function withNewScene(book, scene) {
  return {
    ...book,
    chapters: book.chapters.map(ch =>
      ch.id === 'ch1' ? { ...ch, scenes: [...ch.scenes, scene] } : ch
    )
  };
}

test('fast path: identical reference for base and local returns the sync result untouched', () => {
  const base = makeBook();
  const remote = { ...makeBook(), title: 'Synced Title' };
  const { bookData, conflicts } = reconcilePostSyncState(base, base, remote);
  expect(bookData).toBe(remote);
  expect(conflicts).toEqual([]);
});

test('a scene added locally while the sync was in flight survives, not just the sync result', () => {
  const base = makeBook();
  const local = withNewScene(base, {
    id: 'sc2',
    title: 'Scene 2',
    content: 'added mid-flight',
    notes: '',
    created: '',
    modified: '',
    assignedAuthor: ''
  });
  const remote = {
    ...base,
    title: 'Synced Title',
    github: { ...base.github, lastSyncCommitSha: 'new-sha' }
  };

  const { bookData, conflicts } = reconcilePostSyncState(base, local, remote);

  expect(conflicts).toEqual([]);
  expect(bookData.title).toBe('Synced Title');
  const scenes = bookData.chapters[0].scenes;
  expect(scenes.find(s => s.id === 'sc1').content).toBe('original content');
  const sc2 = scenes.find(s => s.id === 'sc2');
  expect(sc2).toBeDefined();
  expect(sc2.content).toBe('added mid-flight');
  expect(bookData.github.lastSyncCommitSha).toBe('new-sha');
});

test('a scene deleted locally while the sync was in flight stays deleted', () => {
  const base = makeBook();
  const local = {
    ...base,
    chapters: [{ ...base.chapters[0], scenes: [] }]
  };
  const remote = { ...base, title: 'Synced Title' };

  const { bookData } = reconcilePostSyncState(base, local, remote);

  expect(bookData.chapters[0].scenes).toHaveLength(0);
  expect(bookData.title).toBe('Synced Title');
});

test('editing content on a scene both mid-flight locally and via the sync result merges, flagging a conflict only on real overlap', () => {
  const base = makeBook();
  const local = {
    ...base,
    chapters: [
      {
        ...base.chapters[0],
        scenes: [
          {
            ...base.chapters[0].scenes[0],
            content: 'original content\nlocal addition at the end'
          }
        ]
      }
    ]
  };
  const remote = {
    ...base,
    chapters: [
      {
        ...base.chapters[0],
        scenes: [
          {
            ...base.chapters[0].scenes[0],
            content: 'remote addition at the start\noriginal content'
          }
        ]
      }
    ]
  };

  const { bookData, conflicts } = reconcilePostSyncState(base, local, remote);

  expect(conflicts).toEqual([]);
  expect(bookData.chapters[0].scenes[0].content).toBe(
    'remote addition at the start\noriginal content\nlocal addition at the end'
  );
});

test('an illustration changed both mid-flight locally and by the sync result prefers the more recent local edit', () => {
  const base = {
    ...makeBook(),
    illustrations: [
      { id: 'illus1', imageData: 'data:image/png;base64,YmFzZQ==' }
    ]
  };
  const local = {
    ...base,
    illustrations: [
      { id: 'illus1', imageData: 'data:image/png;base64,bG9jYWw=' }
    ]
  };
  const remote = {
    ...base,
    illustrations: [
      { id: 'illus1', imageData: 'data:image/png;base64,cmVtb3Rl' }
    ]
  };

  const { bookData } = reconcilePostSyncState(base, local, remote);

  expect(bookData.illustrations[0].imageData).toBe(
    'data:image/png;base64,bG9jYWw='
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/RiderProjects/absolute-scenes-git-sync && node --experimental-vm-modules node_modules/.bin/jest reconcile.test.js`
Expected: FAIL — `Cannot find module './reconcile.js'`.

- [ ] **Step 3: Write `reconcile.js`**

Identical logic to desktop's `postSyncReconciliation.js`, with imports changed from `'@absolute-scenes/git-sync'` to relative in-package paths.

```js
// ~/RiderProjects/absolute-scenes-git-sync/src/reconcile.js
import { projectBook, reassembleBook } from './project.js';
import { mergeSceneContent } from './mergeScene.js';
import { mergeBookMetadata } from './mergeMetadata.js';

function filesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.content === b.content && a.encoding === b.encoding;
}

// A sync's round-trip is not instant -- it can take several seconds. Treating
// sync completion as an unconditional replace silently discards any edit made
// on this device while the round-trip was still in flight, with nothing
// pushed to GitHub to recover it from (confirmed live during desktop's own
// sync rework). This reconciles the sync's result against whatever actually
// happened on this device in the meantime, using the exact same 3-way-merge
// shape pushSync's buildAttempt already uses for local-vs-remote -- just run
// once more, purely in memory, with "the edit made while the sync was
// running" standing in for "local" and "the sync's own result" standing in
// for "remote". `base` is the book snapshot the sync started from; `local` is
// the caller's current in-memory state as of the moment the sync resolved;
// `remote` is the sync's own result.
export function reconcilePostSyncState(base, local, remote) {
  if (local === base) {
    // Nothing changed on this device while the sync was in flight -- fast
    // path, skip the merge machinery entirely.
    return { bookData: remote, conflicts: [] };
  }

  const baseFiles = projectBook(base);
  const localFiles = projectBook(local);
  const remoteFiles = projectBook(remote);
  const allPaths = new Set([
    ...baseFiles.keys(),
    ...localFiles.keys(),
    ...remoteFiles.keys()
  ]);

  const merged = new Map();
  const conflicts = [];

  for (const path of allPaths) {
    const b = baseFiles.get(path);
    const l = localFiles.get(path);
    const r = remoteFiles.get(path);

    const localChanged = !filesEqual(b, l);
    const remoteChanged = !filesEqual(b, r);

    if (!localChanged && !remoteChanged) {
      if (r ?? b) merged.set(path, r ?? b);
      continue;
    }
    if (!localChanged && remoteChanged) {
      if (r) merged.set(path, r);
      continue;
    }
    if (localChanged && !remoteChanged) {
      if (l) merged.set(path, l);
      continue;
    }

    if (!l && !r) continue;
    if (!l) {
      merged.set(path, r);
      continue;
    }
    if (!r) {
      merged.set(path, l);
      continue;
    }

    if (path === 'book.json') {
      const bookMerged = mergeBookMetadata(
        JSON.parse(b.content),
        JSON.parse(l.content),
        JSON.parse(r.content),
        'local'
      );
      merged.set(path, {
        content: JSON.stringify(bookMerged, null, 2),
        encoding: 'utf-8'
      });
    } else if (path.startsWith('scenes/')) {
      const { content, conflict } = mergeSceneContent(
        b?.content,
        l.content,
        r.content
      );
      merged.set(path, { content, encoding: 'utf-8' });
      if (conflict) {
        conflicts.push({
          sceneId: path.replace('scenes/', '').replace('.md', '')
        });
      }
    } else {
      merged.set(path, l);
    }
  }

  const bookData = { ...reassembleBook(merged), github: remote.github };
  return { bookData, conflicts };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/RiderProjects/absolute-scenes-git-sync && node --experimental-vm-modules node_modules/.bin/jest reconcile.test.js`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Write the failing test for `syncRepo`**

```js
// ~/RiderProjects/absolute-scenes-git-sync/src/syncRepo.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('./migration.js', () => ({
  detectRepoLayout: jest.fn(),
  migrateLegacyRepo: jest.fn(),
}));
jest.unstable_mockModule('./sync.js', () => ({
  pushSync: jest.fn(),
  pullSync: jest.fn(),
}));
jest.unstable_mockModule('./apiClient.js', () => ({
  getRef: jest.fn(),
  getCommit: jest.fn(),
  getTree: jest.fn(),
  bootstrapEmptyRepo: jest.fn(),
}));

const { syncRepo } = await import('./syncRepo.js');
const migration = await import('./migration.js');
const sync = await import('./sync.js');
const apiClient = await import('./apiClient.js');

afterEach(() => jest.restoreAllMocks());

function baseArgs(overrides = {}) {
  return {
    repo: 'owner/repo',
    token: 't',
    branch: 'main',
    bookData: { title: 'T' },
    lastSyncCommitSha: 'sync-sha',
    cache: { get: jest.fn(), set: jest.fn() },
    author: { name: 'Alice', email: 'alice@example.com' },
    ...overrides,
  };
}

test('an already-new-layout repo skips migration and calls pushSync directly', async () => {
  migration.detectRepoLayout.mockResolvedValue('new');
  sync.pushSync.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T' }, conflicts: [] });

  const result = await syncRepo(baseArgs());

  expect(migration.migrateLegacyRepo).not.toHaveBeenCalled();
  expect(sync.pushSync).toHaveBeenCalledWith(
    expect.objectContaining({ repo: 'owner/repo', branch: 'main', lastSyncCommitSha: 'sync-sha' })
  );
  expect(result.conflicts).toEqual([]);
});

test('a legacy-layout repo is migrated before the first pushSync call', async () => {
  migration.detectRepoLayout.mockResolvedValue('legacy');
  apiClient.getRef.mockResolvedValue({ sha: 'ref-sha' });
  apiClient.getCommit.mockResolvedValue({ tree: { sha: 'tree-sha' } });
  apiClient.getTree.mockResolvedValue([{ path: 'Book.book' }, { path: 'nested/other.book' }]);
  migration.migrateLegacyRepo.mockResolvedValue({ commitSha: 'migration-sha' });
  sync.pushSync.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T' }, conflicts: [] });

  await syncRepo(baseArgs());

  expect(migration.migrateLegacyRepo).toHaveBeenCalledWith(
    expect.objectContaining({ legacyFilePath: 'Book.book' })
  );
  const pushCall = sync.pushSync.mock.calls[0][0];
  expect(pushCall.lastSyncCommitSha).toBe('migration-sha');
});

test('no prior lastSyncCommitSha against a legacy repo pulls the migrated content instead of pushing a merge', async () => {
  migration.detectRepoLayout.mockResolvedValue('legacy');
  apiClient.getRef.mockResolvedValue({ sha: 'ref-sha' });
  apiClient.getCommit.mockResolvedValue({ tree: { sha: 'tree-sha' } });
  apiClient.getTree.mockResolvedValue([{ path: 'Book.book' }]);
  migration.migrateLegacyRepo.mockResolvedValue({ commitSha: 'migration-sha' });
  sync.pullSync.mockResolvedValue({
    commitSha: 'migration-sha',
    bookData: { title: 'Migrated Book', chapters: [{ id: 'ch1', scenes: [{ id: 'sc1' }] }] },
  });

  const result = await syncRepo(baseArgs({ lastSyncCommitSha: undefined }));

  expect(sync.pushSync).not.toHaveBeenCalled();
  expect(sync.pullSync).toHaveBeenCalled();
  expect(result.bookData.title).toBe('Migrated Book');
  expect(result.commitSha).toBe('migration-sha');
  expect(result.conflicts).toEqual([]);
});

test('no prior lastSyncCommitSha against an already-populated new-layout repo pulls instead of pushing', async () => {
  migration.detectRepoLayout.mockResolvedValue('new');
  sync.pullSync.mockResolvedValue({ commitSha: 'existing-tip-sha', bookData: { title: 'Existing Repo Book', chapters: [] } });

  const result = await syncRepo(baseArgs({ lastSyncCommitSha: undefined }));

  expect(sync.pushSync).not.toHaveBeenCalled();
  expect(sync.pullSync).toHaveBeenCalled();
  expect(result.bookData.title).toBe('Existing Repo Book');
  expect(result.commitSha).toBe('existing-tip-sha');
});

test('no prior lastSyncCommitSha against a freshly bootstrapped (empty) repo still pushes -- nothing real to pull yet', async () => {
  migration.detectRepoLayout.mockResolvedValue('empty');
  apiClient.bootstrapEmptyRepo.mockResolvedValue({ commitSha: 'bootstrap-sha' });
  sync.pushSync.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T' }, conflicts: [] });

  await syncRepo(baseArgs({ lastSyncCommitSha: undefined }));

  expect(sync.pullSync).not.toHaveBeenCalled();
  const pushCall = sync.pushSync.mock.calls[0][0];
  expect(pushCall.lastSyncCommitSha).toBe('bootstrap-sha');
});

test('an empty repo is bootstrapped, then migration is skipped (nothing to migrate), then pushed', async () => {
  migration.detectRepoLayout.mockResolvedValue('empty');
  apiClient.bootstrapEmptyRepo.mockResolvedValue({ commitSha: 'bootstrap-sha' });
  sync.pushSync.mockResolvedValue({ commitSha: 'new-sha', bookData: { title: 'T' }, conflicts: [] });

  await syncRepo(baseArgs());

  expect(apiClient.bootstrapEmptyRepo).toHaveBeenCalled();
  expect(migration.migrateLegacyRepo).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd ~/RiderProjects/absolute-scenes-git-sync && node --experimental-vm-modules node_modules/.bin/jest syncRepo.test.js`
Expected: FAIL — `Cannot find module './syncRepo.js'`.

- [ ] **Step 7: Write `syncRepo.js`**

This inlines desktop's `runSync` layout-detection/bootstrap/migrate/first-sync-pull dance, with the electron-specific author resolution and `book.github.*` bookkeeping overlay removed (those stay with each platform's own thin wrapper, exactly as `pushSync`/`pullSync` already work today).

```js
// ~/RiderProjects/absolute-scenes-git-sync/src/syncRepo.js
import { detectRepoLayout, migrateLegacyRepo } from './migration.js';
import { pushSync, pullSync } from './sync.js';
import { getRef, getCommit, getTree, bootstrapEmptyRepo } from './apiClient.js';

// Higher-level orchestration over pushSync/pullSync: decides whether a repo
// needs bootstrapping (never had a commit), migrating (still on the legacy
// single-.book-file layout), or is ready for a normal push -- and, critically,
// whether this device's *first* sync against an already-populated repo should
// pull that content wholesale rather than feed pushSync a base commit the
// local book was never actually derived from. Feeding pushSync that base
// makes it read every bit of real content as "deleted locally" and wipe it on
// the very next push -- confirmed live during desktop's migration testing. A
// freshly bootstrapped ('empty') repo is excluded from the pull branch
// deliberately: there's nothing real to pull yet, and local's own content is
// what should get pushed there.
export async function syncRepo({ repo, token, branch, bookData, lastSyncCommitSha, cache, author }) {
  const isFirstSyncForThisDevice = !lastSyncCommitSha;
  let baseCommitSha = lastSyncCommitSha;
  const layout = await detectRepoLayout({ repo, token, branch });

  if (layout === 'empty') {
    const bootstrap = await bootstrapEmptyRepo({
      repo,
      token,
      branch,
      path: '_bootstrap.txt',
      content: 'AbsoluteScenes sync bootstrap',
    });
    baseCommitSha = bootstrap.commitSha;
  } else if (layout === 'legacy') {
    // detectRepoLayout only reports the layout kind, not the legacy file's
    // path, so walk the tree to find the single root `.book`-suffixed file
    // before handing it to migrateLegacyRepo.
    const ref = await getRef({ repo, token, branch });
    const commit = await getCommit({ repo, token, sha: ref.sha });
    const tree = await getTree({ repo, token, sha: commit.tree.sha });
    const legacyEntry = tree.find(
      e => !e.path.includes('/') && e.path.endsWith('.book')
    );
    const migration = await migrateLegacyRepo({
      repo,
      token,
      branch,
      legacyFilePath: legacyEntry.path,
      author,
    });
    baseCommitSha = migration.commitSha;
  }

  if (isFirstSyncForThisDevice && (layout === 'legacy' || layout === 'new')) {
    const pulled = await pullSync({ repo, token, branch, cache });
    return { commitSha: pulled.commitSha, bookData: pulled.bookData, conflicts: [] };
  }

  return pushSync({
    repo,
    token,
    branch,
    bookData,
    lastSyncCommitSha: baseCommitSha,
    cache,
    author,
  });
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd ~/RiderProjects/absolute-scenes-git-sync && node --experimental-vm-modules node_modules/.bin/jest syncRepo.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 9: Export both from the package root**

```js
// ~/RiderProjects/absolute-scenes-git-sync/index.js
// Public API — each export is added by the task that implements it.
export { computeGitBlobSha } from './src/blobSha.js';
export { projectBook, reassembleBook } from './src/project.js';
export { mergeSceneContent } from './src/mergeScene.js';
export { mergeBookMetadata } from './src/mergeMetadata.js';
export {
  getRepo, getRef, updateRef, createRef, createBlob, getBlob,
  createTree, getTree, createCommit, getCommit, compareCommits, bootstrapEmptyRepo,
} from './src/apiClient.js';
export { detectRepoLayout, migrateLegacyRepo } from './src/migration.js';
export { pushSync, pullSync } from './src/sync.js';
export { syncRepo } from './src/syncRepo.js';
export { reconcilePostSyncState } from './src/reconcile.js';
```

- [ ] **Step 10: Run the full package test suite**

Run: `cd ~/RiderProjects/absolute-scenes-git-sync && npm test`
Expected: PASS, all suites (existing + the two new ones).

- [ ] **Step 11: Commit**

```bash
cd ~/RiderProjects/absolute-scenes-git-sync
git add index.js src/syncRepo.js src/syncRepo.test.js src/reconcile.js src/reconcile.test.js
git commit -m "feat: promote first-sync-pull and post-sync reconciliation from desktop into the package"
```

---

### Task 2: Bump the package version and tag it

**Files:**
- Modify: `~/RiderProjects/absolute-scenes-git-sync/package.json`

**Interfaces:**
- Produces: git tag `v0.2.0`, consumed by Task 3 (desktop) and by the companion mobile plan's `package.json` dependency.

- [ ] **Step 1: Bump the version**

```json
{
  "name": "@absolute-scenes/git-sync",
  "version": "0.2.0",
  ...
}
```

- [ ] **Step 2: Commit the version bump**

```bash
cd ~/RiderProjects/absolute-scenes-git-sync
git add package.json
git commit -m "chore: bump to v0.2.0 (adds syncRepo, reconcilePostSyncState)"
```

- [ ] **Step 3: Tag it — STOP and get explicit confirmation before this step**

Pushing a tag to `orinoco77/absolute-scenes-git-sync` is a shared, externally-visible action (it's what desktop's and mobile's `package.json` `github:` dependency references pin to). Confirm with the user before running:

```bash
cd ~/RiderProjects/absolute-scenes-git-sync
git tag v0.2.0
git push origin main --tags
```

---

### Task 3: Update desktop's `gitSyncService.js` to call the promoted functions

**Files:**
- Modify: `~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/package.json`
- Modify: `~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/gitSyncService.js`
- Delete: `~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/postSyncReconciliation.js`
- Delete: `~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/__tests__/postSyncReconciliation.test.js`
- Modify: `~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/__tests__/gitSyncService.test.js`

**Interfaces:**
- Consumes: `syncRepo`, `reconcilePostSyncState` (Task 1, now published as `@absolute-scenes/git-sync@0.2.0`).
- Produces: `gitSyncService.syncBook`/`gitSyncService.pullBook`/`gitSyncService.reconcilePostSyncState` — same external shape as before, so `App.jsx`/`GitHubIntegration.jsx` need no changes.

- [ ] **Step 1: Bump the dependency**

```json
"dependencies": {
  "@absolute-scenes/git-sync": "github:orinoco77/absolute-scenes-git-sync#v0.2.0",
```

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && npm install`
Expected: lockfile updates, `node_modules/@absolute-scenes/git-sync/package.json` now reads `"version": "0.2.0"`.

- [ ] **Step 2: Write the failing tests — replace the layout-orchestration cases in `gitSyncService.test.js`**

`runSync` will stop calling `detectRepoLayout`/`pushSync`/`pullSync`/`bootstrapEmptyRepo`/`migrateLegacyRepo`/`getRef`/`getCommit`/`getTree` directly — it delegates the whole decision to `syncRepo`. Replace the file's layout-related tests (everything above the `pullBook` describe block, which is untested by this change since `pullBook` doesn't use `syncRepo`) with tests against the new call shape:

```js
// ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/__tests__/gitSyncService.test.js
import * as gitSync from '@absolute-scenes/git-sync';
import {
  syncBook,
  pullBook,
  __resetInFlightGuardForTests
} from '../gitSyncService.js';

jest.mock('@absolute-scenes/git-sync');

function makeGitHubService() {
  return {
    isAuthenticated: () => true,
    getUserInfo: () => ({ login: 'alice', email: 'alice@example.com' })
  };
}

function makeBook() {
  return {
    title: 'T',
    github: {
      repository: { full_name: 'owner/repo', default_branch: 'main' },
      lastSyncCommitSha: 'sync-sha',
      collaboration: { currentAuthor: 'Alice' }
    }
  };
}

beforeEach(() => {
  __resetInFlightGuardForTests();
  jest.clearAllMocks();
  window.electron = {
    readSyncCache: jest.fn(async () => ({})),
    writeSyncCache: jest.fn(async () => {})
  };
});

test('calls syncRepo with the resolved repo, branch, base commit, author, and cache', async () => {
  gitSync.syncRepo.mockResolvedValue({
    commitSha: 'new-sha',
    bookData: { title: 'T', github: {} },
    conflicts: []
  });

  await syncBook({
    book: makeBook(),
    filePath: '/x/Book.book',
    gitHubService: makeGitHubService()
  });

  expect(gitSync.syncRepo).toHaveBeenCalledWith(
    expect.objectContaining({
      repo: 'owner/repo',
      branch: 'main',
      lastSyncCommitSha: 'sync-sha',
      author: { name: 'Alice', email: 'alice@example.com' }
    })
  );
});

test('restores github.repository/collaboration onto the returned bookData, since syncRepo/reassembleBook always returns github: {}', async () => {
  gitSync.syncRepo.mockResolvedValue({
    commitSha: 'new-sha',
    bookData: { title: 'T', github: {} },
    conflicts: []
  });

  const book = makeBook();
  const result = await syncBook({
    book,
    filePath: '/x/Book.book',
    gitHubService: makeGitHubService()
  });

  expect(result.bookData.github.repository).toEqual(book.github.repository);
  expect(result.bookData.github.collaboration).toEqual(book.github.collaboration);
  expect(result.bookData.github.lastSyncCommitSha).toBe('new-sha');
  expect(result.bookData.title).toBe('T');
});

test('surfaces conflicts from syncRepo unchanged', async () => {
  gitSync.syncRepo.mockResolvedValue({
    commitSha: 'new-sha',
    bookData: { title: 'T', github: {} },
    conflicts: [{ sceneId: 'sc1' }]
  });

  const result = await syncBook({
    book: makeBook(),
    filePath: '/x/Book.book',
    gitHubService: makeGitHubService()
  });

  expect(result.conflicts).toEqual([{ sceneId: 'sc1' }]);
});

test('concurrent syncBook calls for the same session share one in-flight syncRepo call', async () => {
  let resolveSync;
  gitSync.syncRepo.mockReturnValue(
    new Promise(resolve => {
      resolveSync = resolve;
    })
  );

  const book = makeBook();
  const call1 = syncBook({ book, filePath: '/x/Book.book', gitHubService: makeGitHubService() });
  const call2 = syncBook({ book, filePath: '/x/Book.book', gitHubService: makeGitHubService() });

  resolveSync({ commitSha: 'sha', bookData: { title: 'T', github: {} }, conflicts: [] });
  await Promise.all([call1, call2]);

  expect(gitSync.syncRepo).toHaveBeenCalledTimes(1);
});

test('skips entirely when not authenticated', async () => {
  const gitHubService = { isAuthenticated: () => false, getUserInfo: () => null };
  const result = await syncBook({
    book: makeBook(),
    filePath: '/x/Book.book',
    gitHubService
  });
  expect(result).toBeNull();
  expect(gitSync.syncRepo).not.toHaveBeenCalled();
});

describe('pullBook', () => {
  function makeRepo() {
    return { full_name: 'owner/repo', default_branch: 'main' };
  }

  function makePulledBook() {
    return { title: 'Recovered', chapters: [] };
  }

  test('a new-layout repo calls pullSync directly without migration', async () => {
    gitSync.detectRepoLayout.mockResolvedValue('new');
    gitSync.pullSync.mockResolvedValue({ bookData: makePulledBook() });

    const result = await pullBook({
      repo: makeRepo(),
      filePath: '/x/Book.book',
      gitHubService: makeGitHubService()
    });

    expect(gitSync.migrateLegacyRepo).not.toHaveBeenCalled();
    expect(gitSync.pullSync).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'owner/repo', branch: 'main' })
    );
    expect(result).toEqual(makePulledBook());
  });

  test('a legacy-layout repo is migrated before pullSync is called', async () => {
    gitSync.detectRepoLayout.mockResolvedValue('legacy');
    gitSync.getRef.mockResolvedValue({ sha: 'ref-sha' });
    gitSync.getCommit.mockResolvedValue({ tree: { sha: 'tree-sha' } });
    gitSync.getTree.mockResolvedValue([{ path: 'Book.book' }, { path: 'nested/other.book' }]);
    gitSync.migrateLegacyRepo.mockResolvedValue({ commitSha: 'migration-sha' });
    gitSync.pullSync.mockResolvedValue({ bookData: makePulledBook() });

    await pullBook({
      repo: makeRepo(),
      filePath: '/x/Book.book',
      gitHubService: makeGitHubService()
    });

    expect(gitSync.migrateLegacyRepo).toHaveBeenCalledWith(
      expect.objectContaining({ legacyFilePath: 'Book.book' })
    );
    expect(gitSync.pullSync).toHaveBeenCalled();
  });

  test('an empty repo returns null', async () => {
    gitSync.detectRepoLayout.mockResolvedValue('empty');

    const result = await pullBook({
      repo: makeRepo(),
      filePath: '/x/Book.book',
      gitHubService: makeGitHubService()
    });

    expect(result).toBeNull();
    expect(gitSync.pullSync).not.toHaveBeenCalled();
  });

  test('uses in-memory cache when filePath is null (recovery case)', async () => {
    gitSync.detectRepoLayout.mockResolvedValue('new');
    gitSync.pullSync.mockResolvedValue({ bookData: makePulledBook() });

    await pullBook({ repo: makeRepo(), filePath: null, gitHubService: makeGitHubService() });

    const pullCall = gitSync.pullSync.mock.calls[0][0];
    expect(pullCall.cache).toBeDefined();
    expect(await pullCall.cache.get()).toBeNull();
    await pullCall.cache.set('key', 'value');
    expect(await pullCall.cache.get()).toBeNull();
  });

  test('skips entirely when not authenticated', async () => {
    const gitHubService = { isAuthenticated: () => false };
    const result = await pullBook({
      repo: makeRepo(),
      filePath: '/x/Book.book',
      gitHubService
    });
    expect(result).toBeNull();
    expect(gitSync.pullSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && npx jest gitSyncService.test.js`
Expected: FAIL — `gitSync.syncRepo` is undefined (not yet exported by the mocked module in the old `gitSyncService.js`'s import list) and/or `runSync` still calls the old direct APIs.

- [ ] **Step 4: Rewrite `gitSyncService.js`**

```js
// ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync/src/services/gitSyncService.js
import {
  syncRepo,
  pullSync,
  detectRepoLayout,
  migrateLegacyRepo,
  getRef,
  getCommit,
  getTree
} from '@absolute-scenes/git-sync';
import { resolveCommitAuthor } from '../utils/commitAuthor.js';
import { createSyncCache } from '../utils/syncCache.js';

export { reconcilePostSyncState } from '@absolute-scenes/git-sync';

let inFlight = null;

export function __resetInFlightGuardForTests() {
  inFlight = null;
}

export async function syncBook({ book, filePath, gitHubService }) {
  if (!gitHubService.isAuthenticated()) return null;
  if (inFlight) return inFlight;

  inFlight = runSync({ book, filePath, gitHubService }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync({ book, filePath, gitHubService }) {
  const repo = book.github.repository.full_name;
  const branch = book.github.repository.default_branch || 'main';
  const token = gitHubService.token;
  const author = resolveCommitAuthor(book, gitHubService);
  const cache = createSyncCache(filePath);

  const result = await syncRepo({
    repo,
    token,
    branch,
    bookData: book,
    lastSyncCommitSha: book.github.lastSyncCommitSha,
    cache,
    author
  });

  // syncRepo (like pushSync/pullSync before it) always returns github: {} --
  // restoring "github.* local bookkeeping" (repository, collaboration,
  // authorName, ...) is deliberately the orchestration layer's job, not the
  // package's. Overlay the original book's github settings back on,
  // refreshing only the fields this sync actually changed.
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

export async function pullBook({ repo, filePath, gitHubService }) {
  if (!gitHubService.isAuthenticated()) return null;

  const repoFullName = repo.full_name;
  const branch = repo.default_branch || 'main';
  const token = gitHubService.token;

  const cache = filePath
    ? createSyncCache(filePath)
    : {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve()
      };

  const layout = await detectRepoLayout({ repo: repoFullName, token, branch });
  if (layout === 'empty') return null;

  if (layout === 'legacy') {
    const ref = await getRef({ repo: repoFullName, token, branch });
    const commit = await getCommit({ repo: repoFullName, token, sha: ref.sha });
    const tree = await getTree({
      repo: repoFullName,
      token,
      sha: commit.tree.sha
    });
    const legacyEntry = tree.find(
      e => !e.path.includes('/') && e.path.endsWith('.book')
    );
    await migrateLegacyRepo({
      repo: repoFullName,
      token,
      branch,
      legacyFilePath: legacyEntry.path,
      author: {
        name: 'AbsoluteScenes Recovery',
        email: 'recovery@users.noreply.github.com'
      }
    });
  }

  const result = await pullSync({ repo: repoFullName, token, branch, cache });
  return result.bookData;
}
```

Note what changed: `runSync` no longer imports or calls `pushSync`/`bootstrapEmptyRepo` directly, and no longer walks the tree itself for the legacy-file path — `syncRepo` (Task 1) does all of that now. `pullBook` is untouched: it has different semantics (always pull, never push, even when not the first sync — used for the recovery feature) and was never part of the duplicated logic this plan promotes.

- [ ] **Step 5: Delete the now-superseded reconciliation file and its test**

```bash
cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync
rm src/services/postSyncReconciliation.js
rm src/services/__tests__/postSyncReconciliation.test.js
```

`reconcile.test.js` in the package (Task 1) now owns this coverage; `gitSyncService.js`'s `export { reconcilePostSyncState } from '@absolute-scenes/git-sync';` line (already in Step 4's rewrite) is the only remaining reference.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && npx jest gitSyncService.test.js`
Expected: PASS, all 10 tests (5 `syncBook`-level + 5 `pullBook`-level).

- [ ] **Step 7: Confirm no other file references the deleted module**

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && grep -rn "postSyncReconciliation" src/`
Expected: no output.

- [ ] **Step 8: Run the full desktop test suite**

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && npm test`
Expected: PASS, all suites — in particular `GitHubIntegration.test.js` and `App.jsx`'s own tests, which call `gitSyncService.syncBook`/`reconcilePostSyncState` through the same external shape and should need no changes.

- [ ] **Step 9: Lint**

Run: `cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync && npx eslint --max-warnings 0 src/services/gitSyncService.js src/services/__tests__/gitSyncService.test.js`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
cd ~/RiderProjects/absolute-scenes/.claude/worktrees/git-native-sync
git add package.json package-lock.json src/services/gitSyncService.js src/services/__tests__/gitSyncService.test.js
git rm src/services/postSyncReconciliation.js src/services/__tests__/postSyncReconciliation.test.js
git commit -m "refactor: delegate gitSyncService's layout orchestration to git-sync's promoted syncRepo"
```

---

## Self-review notes (from the plan author, before handoff)

- **Spec coverage:** "Promoting the orchestration fixes into the shared package" — both fixes promoted (Task 1), desktop updated to consume them instead of its own copies (Task 3), version published for downstream consumers (Task 2). The package's own README/versioning conventions aren't touched by this plan since none exist to update.
- **Type consistency:** `syncRepo`'s `{commitSha, bookData, conflicts}` return shape (Task 1) matches exactly what `pushSync`/`pullSync` already return, and is what `gitSyncService.js`'s `runSync` (Task 3) destructures. `reconcilePostSyncState`'s `{bookData, conflicts}` shape is unchanged from its pre-promotion form, so no caller (App.jsx's `performGitSync`) needs to change.
- **Known scope boundary:** `pullBook`'s own layout-detection/migration dance is deliberately *not* folded into `syncRepo` — it has different semantics (always pull, never conditionally push) and doing so would make `syncRepo` serve two incompatible call shapes. Left as-is, consuming `detectRepoLayout`/`migrateLegacyRepo`/`pullSync` directly, exactly as before.
