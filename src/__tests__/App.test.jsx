// src/__tests__/App.test.jsx
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach, test, expect } from 'vitest';

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

// Hoisted (not vi.doMock inside the tests below) because gitHubService.js is
// imported statically just below, before any test body runs -- a vi.doMock
// call inside a test can't retroactively rebind an import a module already
// resolved earlier. All three tests that need this want the same 'new'
// return value anyway, so one hoisted mock covers them (mirrors the pattern
// in src/utils/__tests__/gitHubService.test.js).
vi.mock('@absolute-scenes/git-sync', () => ({
  detectRepoLayout: vi.fn().mockResolvedValue('new'),
}));

const { syncBook } = await import('../sync/syncOrchestrator.js');
const { loadPersistedBook, savePersistedBook } = await import('../sync/bookStorage.js');
const { detectRepoLayout } = await import('@absolute-scenes/git-sync');
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
  detectRepoLayout.mockResolvedValue('new');
});

afterEach(cleanup);

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
  syncBook.mockResolvedValue({ bookData: pulledBook(), conflicts: [{ sceneId: 'sc1' }] });

  render(<App />);
  await userEvent.click(await screen.findByText('novel'));

  await waitFor(() => expect(screen.getByText('Scene One').closest('button')).toHaveTextContent('⚠'));
});
