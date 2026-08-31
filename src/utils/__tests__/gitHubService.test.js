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

test('a repo whose layout check fails is skipped, not fatal to the whole listing', async () => {
  await gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { full_name: 'alice/broken-repo', name: 'broken-repo', description: null, default_branch: 'main' },
      { full_name: 'alice/novel', name: 'novel', description: 'A novel', default_branch: 'main' },
    ],
  });
  detectRepoLayout
    .mockRejectedValueOnce(new Error('rate limited'))
    .mockResolvedValueOnce('new');

  const repos = await gitHubService.getUserRepositoriesWithBooks();

  expect(repos).toEqual([
    { fullName: 'alice/novel', name: 'novel', description: 'A novel', defaultBranch: 'main' },
  ]);
});

test('checks repos concurrently and preserves result order regardless of resolution order', async () => {
  await gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  const manyRepos = Array.from({ length: 4 }, (_, i) => ({
    full_name: `alice/repo-${i}`,
    name: `repo-${i}`,
    description: null,
    default_branch: 'main',
  }));
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => manyRepos });

  const resolvers = [];
  detectRepoLayout.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));

  const resultPromise = gitHubService.getUserRepositoriesWithBooks();

  // Let queued microtasks settle without resolving any check yet.
  await Promise.resolve();
  await Promise.resolve();

  // A sequential (await-in-a-for-loop) implementation would only have
  // called detectRepoLayout once by this point, still awaiting its result
  // before starting the next. A concurrent implementation starts all of
  // them up front.
  expect(resolvers).toHaveLength(4);

  // Resolve out of order to prove the final list isn't just "whichever
  // finished first" -- it must still match the original repo order.
  resolvers[2]('new');
  resolvers[0]('new');
  resolvers[3]('new');
  resolvers[1]('new');

  const repos = await resultPromise;
  expect(repos.map(r => r.fullName)).toEqual(manyRepos.map(r => r.full_name));
});

test('reuses a cached layout for a repo whose pushed_at has not changed since the last check', async () => {
  await gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { full_name: 'alice/novel', name: 'novel', description: 'A novel', default_branch: 'main', pushed_at: '2026-01-01T00:00:00Z' },
    ],
  });
  detectRepoLayout.mockResolvedValueOnce('new');

  const first = await gitHubService.getUserRepositoriesWithBooks();
  expect(first).toEqual([{ fullName: 'alice/novel', name: 'novel', description: 'A novel', defaultBranch: 'main' }]);
  expect(detectRepoLayout).toHaveBeenCalledTimes(1);

  // Second load: pushed_at is identical -- nothing changed on GitHub since
  // the last check, so this must reuse the cached layout instead of
  // re-running detectRepoLayout's 3 API calls.
  detectRepoLayout.mockClear();
  const second = await gitHubService.getUserRepositoriesWithBooks();
  expect(second).toEqual(first);
  expect(detectRepoLayout).not.toHaveBeenCalled();
});

test('re-checks a repo whose pushed_at has changed since the last cached check', async () => {
  await gitHubService.storeAuth('ghp_abc123', { login: 'alice' });
  global.fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { full_name: 'alice/novel', name: 'novel', description: 'A novel', default_branch: 'main', pushed_at: '2026-01-01T00:00:00Z' },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { full_name: 'alice/novel', name: 'novel', description: 'A novel', default_branch: 'main', pushed_at: '2026-01-02T00:00:00Z' },
      ],
    });
  detectRepoLayout.mockResolvedValueOnce('new').mockResolvedValueOnce('new');

  await gitHubService.getUserRepositoriesWithBooks();
  await gitHubService.getUserRepositoriesWithBooks();

  expect(detectRepoLayout).toHaveBeenCalledTimes(2);
});

test('getUserRepositoriesWithBooks throws when not authenticated', async () => {
  await expect(gitHubService.getUserRepositoriesWithBooks()).rejects.toThrow('Not authenticated');
});
