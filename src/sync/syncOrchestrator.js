import { syncRepo, reconcilePostSyncState } from '@absolute-scenes/git-sync';
import { resolveCommitAuthor } from './commitAuthor.js';
import { createSyncCache } from './syncCache.js';

export { reconcilePostSyncState };

const inFlightByRepo = new Map();

export function __resetInFlightGuardForTests() {
  inFlightByRepo.clear();
}

export async function syncBook({ book, gitHubService }) {
  if (!gitHubService.isAuthenticated()) return null;

  const repoKey = book.github.repository.fullName;
  const existing = inFlightByRepo.get(repoKey);
  if (existing) return existing;

  const promise = runSync({ book, gitHubService }).finally(() => {
    inFlightByRepo.delete(repoKey);
  });
  inFlightByRepo.set(repoKey, promise);
  return promise;
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
