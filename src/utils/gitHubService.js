/**
 * GitHub Service for AbsoluteScenes Mobile
 * Handles authentication and repository operations for book files
 */

class GitHubService {
  constructor() {
    this.token = null;
    this.userInfo = null;
    this.fileShaCache = new Map();
    this.loadStoredAuth();
  }

  /**
   * Load stored authentication from localStorage
   */
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

  /**
   * Store authentication
   */
  storeAuth(token, userInfo) {
    try {
      this.token = token;
      this.userInfo = userInfo;
      localStorage.setItem('github_auth', JSON.stringify({ token, userInfo }));
    } catch (error) {
      console.error('Failed to store GitHub auth:', error);
    }
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.token = null;
    this.userInfo = null;
    this.fileShaCache.clear();
    localStorage.removeItem('github_auth');
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Validate and setup GitHub token
   */
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
   * Get repositories with .book files
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

    // Check each repo for .book files
    for (const repo of repos) {
      const bookFile = await this.checkRepositoryForBookFile(repo.full_name);
      if (bookFile) {
        bookRepos.push({
          fullName: repo.full_name,
          name: repo.name,
          description: repo.description,
          bookFileName: bookFile
        });
      }
    }

    return bookRepos;
  }

  /**
   * Check if repository contains a .book file
   */
  async checkRepositoryForBookFile(repoFullName) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AbsoluteScenes-Mobile'
          }
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const contents = await response.json();
      const bookFile = contents.find(
        file => file.type === 'file' && file.name.endsWith('.book')
      );

      return bookFile ? bookFile.name : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Download book from repository
   */
  async downloadBookFromRepository(repoFullName, fileName) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${fileName}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AbsoluteScenes-Mobile'
        }
      }
    );

    if (response.status === 404) {
      throw new Error('Book file not found in repository');
    } else if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const fileData = await response.json();

    // Check if content exists - if not, file might be too large for inline content
    let rawContent;

    if (!fileData.content) {
      // Use Git Data API to get blob content for large files
      const blobResponse = await fetch(
        `https://api.github.com/repos/${repoFullName}/git/blobs/${fileData.sha}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AbsoluteScenes-Mobile'
          }
        }
      );

      if (!blobResponse.ok) {
        throw new Error(`Failed to download large file: ${blobResponse.status}`);
      }

      const blobData = await blobResponse.json();

      if (!blobData.content) {
        throw new Error('Git API returned no content');
      }

      // Decode the base64 content from Git API
      const base64Content = blobData.content.replace(/\s/g, '');
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      rawContent = new TextDecoder('utf-8').decode(bytes);
    } else {
      // Decode base64 content with proper UTF-8 handling
      const base64Content = fileData.content.replace(/\s/g, '');

      try {
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        rawContent = new TextDecoder('utf-8').decode(bytes);
      } catch (decodeError) {
        console.error('Base64 decode error:', decodeError);
        throw new Error('Failed to decode file content from GitHub');
      }
    }

    // Normalize line endings
    const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    try {
      const bookData = JSON.parse(normalizedContent);

      // Validate that this looks like a book file
      if (!bookData || typeof bookData !== 'object') {
        throw new Error('Downloaded content is not a valid object');
      }

      // Cache the SHA for future saves
      this.fileShaCache.set(`${repoFullName}/${fileName}`, fileData.sha);

      return bookData;
    } catch (error) {
      throw new Error(`Downloaded file is not a valid book format: ${error.message}`);
    }
  }

  /**
   * Save book to repository
   */
  async saveBookToRepository(repoFullName, fileName, bookData, commitMessage) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Get current file SHA
    const cacheKey = `${repoFullName}/${fileName}`;
    let fileSha = this.fileShaCache.get(cacheKey);

    // If no cached SHA, fetch it
    if (!fileSha) {
      try {
        const fileResponse = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents/${fileName}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AbsoluteScenes-Mobile'
            }
          }
        );

        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          fileSha = fileData.sha;
          this.fileShaCache.set(cacheKey, fileSha);
        }
      } catch (error) {
        console.log('File check failed, creating new file');
      }
    }

    // Prepare content
    const fileContent = JSON.stringify(bookData, null, 2);
    const normalizedContent = fileContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const encodedContent = btoa(unescape(encodeURIComponent(normalizedContent)));

    const updateData = {
      message: commitMessage,
      content: encodedContent,
      branch: 'main'
    };

    if (fileSha) {
      updateData.sha = fileSha;
    }

    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${fileName}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AbsoluteScenes-Mobile',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!response.ok) {
      const error = await response.json();

      // On 409 conflict, clear cached SHA
      if (response.status === 409) {
        this.fileShaCache.delete(cacheKey);
      }

      throw new Error(error.message || `Failed to save: ${response.status}`);
    }

    const result = await response.json();

    // Update cached SHA
    if (result.content && result.content.sha) {
      this.fileShaCache.set(cacheKey, result.content.sha);
    }

    return result;
  }
}

// Export singleton instance
export default new GitHubService();
