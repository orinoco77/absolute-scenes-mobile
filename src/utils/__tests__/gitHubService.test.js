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

test('getUserRepositoriesWithBooks throws when not authenticated', async () => {
  await expect(gitHubService.getUserRepositoriesWithBooks()).rejects.toThrow('Not authenticated');
});
