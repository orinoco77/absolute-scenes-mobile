/**
 * GitHub Service for AbsoluteScenes Mobile
 * Handles authentication and repository discovery.
 */
import { detectRepoLayout } from '@absolute-scenes/git-sync';

// Runs `mapper` over `items` with at most `limit` in flight at once,
// returning results in the same order as `items` regardless of which
// finishes first. Each `detectRepoLayout` check is itself 3 sequential
// GitHub API calls, and a repo list can have up to 100 entries -- a plain
// sequential loop means up to 300 serialized round trips before the repo
// list screen can render. A bounded pool gets most of the speed of full
// concurrency without firing 100 requests at GitHub simultaneously.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

const REPO_LAYOUT_CHECK_CONCURRENCY = 5;
const REPO_LAYOUT_CACHE_KEY = 'absolute-scenes-mobile:repoLayoutCache';

// GitHub's own repo-list response already includes `pushed_at` for every
// repo -- if it's unchanged since the last time we checked, nothing could
// have changed at the tip of that repo's default branch, so the cached
// layout classification is still correct and detectRepoLayout's 3 API
// calls can be skipped entirely for that repo.
function loadRepoLayoutCache() {
  try {
    return JSON.parse(localStorage.getItem(REPO_LAYOUT_CACHE_KEY)) ?? {};
  } catch (error) {
    console.warn('Failed to read repo layout cache:', error);
    return {};
  }
}

function saveRepoLayoutCache(cache) {
  try {
    localStorage.setItem(REPO_LAYOUT_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to persist repo layout cache:', error);
  }
}

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
    const cache = loadRepoLayoutCache();
    const nextCache = {};

    const checked = await mapWithConcurrency(repos, REPO_LAYOUT_CHECK_CONCURRENCY, async repo => {
      const branch = repo.default_branch || 'main';
      const cached = cache[repo.full_name];
      let layout;

      if (cached && cached.pushedAt === repo.pushed_at) {
        layout = cached.layout;
      } else {
        try {
          layout = await detectRepoLayout({
            repo: repo.full_name,
            token: this.token,
            branch
          });
        } catch (error) {
          console.warn(`Skipping ${repo.full_name}: failed to detect layout`, error);
          return null;
        }
      }

      nextCache[repo.full_name] = { layout, pushedAt: repo.pushed_at };

      if (layout !== 'legacy' && layout !== 'new') return null;
      return {
        fullName: repo.full_name,
        name: repo.name,
        description: repo.description,
        defaultBranch: branch
      };
    });

    saveRepoLayoutCache(nextCache);
    return checked.filter(Boolean);
  }
}

export default new GitHubService();
