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
