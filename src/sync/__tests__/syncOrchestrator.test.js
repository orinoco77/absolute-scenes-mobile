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

test('syncing two different repos concurrently does not coalesce them', async () => {
  const bookA = makeBook();
  const bookB = makeBook({ repository: { fullName: 'owner/other-repo', defaultBranch: 'main' } });

  let resolveA, resolveB;
  gitSync.syncRepo
    .mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveB = resolve; }));

  const callA = syncBook({ book: bookA, gitHubService: makeGitHubService() });
  const callB = syncBook({ book: bookB, gitHubService: makeGitHubService() });

  resolveB({ commitSha: 'b-sha', bookData: { title: 'B', github: {} }, conflicts: [] });
  resolveA({ commitSha: 'a-sha', bookData: { title: 'A', github: {} }, conflicts: [] });
  const [resultA, resultB] = await Promise.all([callA, callB]);

  expect(gitSync.syncRepo).toHaveBeenCalledTimes(2);
  expect(resultA.bookData.title).toBe('A');
  expect(resultB.bookData.title).toBe('B');
});

test('skips entirely when not authenticated', async () => {
  const gitHubService = { isAuthenticated: () => false, getUserInfo: () => null };
  const result = await syncBook({ book: makeBook(), gitHubService });
  expect(result).toBeNull();
  expect(gitSync.syncRepo).not.toHaveBeenCalled();
});
