/**
 * Tests for GitHub Sync with SHA Comparison
 * Tests the SHA-based sync optimization and merge logic
 */

import { jest } from '@jest/globals';

// Create mock GitHubService
const mockGitHubService = {
  isAuthenticated: jest.fn(),
  saveBookToRepository: jest.fn(),
  checkRepositoryForBookFile: jest.fn(),
  downloadBookFromRepository: jest.fn(),
  getLatestCommitSha: jest.fn(),
  getFileAtCommit: jest.fn()
};

// Mock the module before importing
jest.unstable_mockModule('../gitHubService', () => ({
  default: mockGitHubService
}));

// Import after mocking
const { BrowserEnhancedGitHubService } = await import('../browserEnhancedGitHubService');

describe('Mobile GitHub Sync - SHA Comparison', () => {
  let service;
  const mockRepository = { fullName: 'user/test-book', name: 'test-book' };

  const createBook = (overrides = {}) => ({
    title: 'Test Book',
    author: 'Test Author',
    chapters: [],
    characters: [],
    locations: [],
    parts: [],
    backgroundFolders: [],
    frontMatter: [],
    characterDetectionBlacklist: [],
    template: {},
    github: {},
    metadata: {},
    collaboration: {},
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BrowserEnhancedGitHubService();
    mockGitHubService.isAuthenticated.mockReturnValue(true);
    // Default mocks
    mockGitHubService.getLatestCommitSha.mockResolvedValue(null);
    mockGitHubService.getFileAtCommit.mockResolvedValue(null);
    mockGitHubService.saveBookToRepository.mockResolvedValue({
      commit: { sha: 'new-commit-sha-123' },
      content: { sha: 'new-file-sha-456' }
    });
  });

  describe('SHA Comparison Optimization', () => {
    it('uses fast path when SHAs match (no remote changes)', async () => {
      const localBook = createBook({
        title: 'Test Book v2',
        github: {
          lastSyncCommitSha: 'abc123'
        }
      });

      // Mock: remote hasn't changed
      mockGitHubService.getLatestCommitSha.mockResolvedValue('abc123');
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(
        createBook({ title: 'Test Book' })
      );

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Update title'
      );

      expect(result.success).toBe(true);
      expect(result.wasPushed).toBe(true);
      // Should NOT fetch base content (fast path)
      expect(mockGitHubService.getFileAtCommit).not.toHaveBeenCalled();
      // Should push directly
      expect(mockGitHubService.saveBookToRepository).toHaveBeenCalled();
      // Should return updated book with new SHA
      expect(result.mergedContent.github.lastSyncCommitSha).toBe('new-commit-sha-123');
    });

    it('uses merge path when SHAs do not match (remote changed)', async () => {
      const baseBook = createBook({
        title: 'Original Title',
        author: 'Original Author'
      });

      const localBook = createBook({
        title: 'Original Title', // Unchanged
        author: 'Updated Author', // Changed by local
        github: {
          lastSyncCommitSha: 'abc123' // Old SHA
        }
      });

      const remoteBook = createBook({
        title: 'Updated Title', // Changed by remote
        author: 'Original Author' // Unchanged
      });

      // Mock: remote has changed (different fields than local)
      mockGitHubService.getLatestCommitSha.mockResolvedValue('def456'); // New SHA!
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(remoteBook);
      mockGitHubService.getFileAtCommit.mockResolvedValue(baseBook); // Base content

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Update author'
      );

      expect(result.success).toBe(true);
      // Should fetch base content for 3-way merge
      expect(mockGitHubService.getFileAtCommit).toHaveBeenCalledWith(
        mockRepository,
        'book.json',
        'abc123'
      );
      // Should perform merge and push
      expect(mockGitHubService.saveBookToRepository).toHaveBeenCalled();
      // Merged result should have both changes
      expect(result.mergedContent.title).toBe('Updated Title'); // From remote
      expect(result.mergedContent.author).toBe('Updated Author'); // From local
    });

    it('uses merge path when no local SHA exists (first sync)', async () => {
      const localBook = createBook({
        title: 'Shared Title', // Same as remote
        author: 'Shared Author', // Same as remote
        chapters: [{ id: '1', title: 'Local Chapter' }] // Only local has chapters
        // No github.lastSyncCommitSha
      });

      const remoteBook = createBook({
        title: 'Shared Title', // Same as local
        author: 'Shared Author', // Same as local
        characters: [{ id: 'char1', name: 'Remote Character' }] // Only remote has characters
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('remote-sha-123');
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(remoteBook);

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'First sync'
      );

      expect(result.success).toBe(true);
      // Should NOT use fast path (no local SHA)
      expect(mockGitHubService.getFileAtCommit).not.toHaveBeenCalled(); // No SHA to fetch with
      // Should perform merge with empty base
      expect(mockGitHubService.saveBookToRepository).toHaveBeenCalled();
      // Should merge both sides (no conflicts - same title/author, different arrays)
      expect(result.mergedContent.author).toBe('Shared Author');
      expect(result.mergedContent.title).toBe('Shared Title');
      expect(result.mergedContent.chapters).toHaveLength(1);
      expect(result.mergedContent.characters).toHaveLength(1);
    });
  });

  describe('SHA Storage and Retrieval', () => {
    it('stores new SHA after successful push (fast path)', async () => {
      const localBook = createBook({
        github: {
          lastSyncCommitSha: 'old-sha-123'
        }
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('old-sha-123'); // Match
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(createBook());
      mockGitHubService.saveBookToRepository.mockResolvedValue({
        commit: { sha: 'new-sha-456' },
        content: { sha: 'file-sha' }
      });

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Test'
      );

      expect(result.success).toBe(true);
      expect(result.mergedContent.github.lastSyncCommitSha).toBe('new-sha-456');
    });

    it('stores new SHA after successful merge and push', async () => {
      const localBook = createBook({
        github: {
          lastSyncCommitSha: 'old-sha-123'
        }
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('different-sha'); // No match
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(createBook());
      mockGitHubService.getFileAtCommit.mockResolvedValue(createBook());
      mockGitHubService.saveBookToRepository.mockResolvedValue({
        commit: { sha: 'merged-sha-789' },
        content: { sha: 'file-sha' }
      });

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Test'
      );

      expect(result.success).toBe(true);
      expect(result.mergedContent.github.lastSyncCommitSha).toBe('merged-sha-789');
    });

    it('preserves SHA across multiple saves when remote unchanged', async () => {
      const book1 = createBook({
        title: 'Version 1',
        github: { lastSyncCommitSha: 'sha-100' }
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('sha-100'); // Match
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(createBook());
      mockGitHubService.saveBookToRepository.mockResolvedValue({
        commit: { sha: 'sha-101' },
        content: { sha: 'file-sha' }
      });

      // First save
      const result1 = await service.safeSyncWithRepository(
        mockRepository,
        book1,
        'Save 1'
      );

      expect(result1.mergedContent.github.lastSyncCommitSha).toBe('sha-101');

      // Second save - use the book from first save
      const book2 = { ...result1.mergedContent, title: 'Version 2' };

      mockGitHubService.getLatestCommitSha.mockResolvedValue('sha-101'); // Match new SHA
      mockGitHubService.saveBookToRepository.mockResolvedValue({
        commit: { sha: 'sha-102' },
        content: { sha: 'file-sha' }
      });

      const result2 = await service.safeSyncWithRepository(
        mockRepository,
        book2,
        'Save 2'
      );

      expect(result2.mergedContent.github.lastSyncCommitSha).toBe('sha-102');
      // Should use fast path both times (no merge needed)
      expect(mockGitHubService.getFileAtCommit).not.toHaveBeenCalled();
    });
  });

  describe('Conflict Detection', () => {
    it('detects conflicts when both local and remote changed same field', async () => {
      const localBook = createBook({
        title: 'Local Title',
        github: { lastSyncCommitSha: 'base-sha' }
      });

      const remoteBook = createBook({
        title: 'Remote Title'
      });

      const baseBook = createBook({
        title: 'Original Title'
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('remote-sha'); // Different
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(remoteBook);
      mockGitHubService.getFileAtCommit.mockResolvedValue(baseBook);

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Update title'
      );

      expect(result.success).toBe(false);
      expect(result.requiresResolution).toBe(true);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('does NOT detect conflict for metadata fields (modified, created)', async () => {
      const localBook = createBook({
        metadata: { modified: '2024-01-01T10:00:00.000Z' },
        github: { lastSyncCommitSha: 'base-sha' }
      });

      const remoteBook = createBook({
        metadata: { modified: '2024-01-01T11:00:00.000Z' } // Different time!
      });

      const baseBook = createBook({
        metadata: { modified: '2024-01-01T09:00:00.000Z' }
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('remote-sha');
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(remoteBook);
      mockGitHubService.getFileAtCommit.mockResolvedValue(baseBook);

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Update'
      );

      // Should NOT have conflicts (metadata excluded)
      expect(result.success).toBe(true);
      expect(result.conflicts?.length || 0).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles missing remote gracefully (first push)', async () => {
      const localBook = createBook();

      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue(null); // No remote

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'First push'
      );

      expect(result.success).toBe(true);
      expect(mockGitHubService.saveBookToRepository).toHaveBeenCalled();
      expect(mockGitHubService.getLatestCommitSha).not.toHaveBeenCalled(); // No remote to check
    });

    it('handles null SHA from push gracefully', async () => {
      const localBook = createBook({
        github: { lastSyncCommitSha: 'old-sha' }
      });

      mockGitHubService.getLatestCommitSha.mockResolvedValue('old-sha');
      mockGitHubService.checkRepositoryForBookFile.mockResolvedValue('book.json');
      mockGitHubService.downloadBookFromRepository.mockResolvedValue(createBook());
      mockGitHubService.saveBookToRepository.mockResolvedValue({
        commit: null, // No commit SHA returned!
        content: { sha: 'file-sha' }
      });

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Test'
      );

      expect(result.success).toBe(true);
      // Should handle null SHA gracefully
      expect(result.mergedContent.github.lastSyncCommitSha).toBeUndefined();
    });

    it('handles API errors gracefully', async () => {
      const localBook = createBook();

      mockGitHubService.checkRepositoryForBookFile.mockRejectedValue(
        new Error('Network error')
      );

      const result = await service.safeSyncWithRepository(
        mockRepository,
        localBook,
        'Test'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
