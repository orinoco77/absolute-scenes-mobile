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
