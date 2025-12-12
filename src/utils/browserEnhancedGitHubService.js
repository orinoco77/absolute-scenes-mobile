/**
 * Browser-compatible Enhanced GitHub Service with collaboration
 * Provides conflict-aware synchronization for collaborative book writing in the browser
 */

import { BrowserCollaborationService } from './browserCollaborationService';
import GitHubServiceInstance from './gitHubService';

export class BrowserEnhancedGitHubService {
  constructor() {
    this.gitHubService = GitHubServiceInstance;
    this.collaborationService = new BrowserCollaborationService();
    this.conflicts = [];
  }

  /**
   * Safely sync with repository, detecting and handling conflicts
   * @param {Object} repository - Repository info {owner, repo}
   * @param {Object} bookData - Local book data
   * @param {string} commitMessage - Commit message
   * @param {string} currentFilePath - Current local file path for filename generation
   * @returns {Promise<Object>} - Sync result with conflicts if any
   */
  async safeSyncWithRepository(
    repository,
    bookData,
    commitMessage,
    currentFilePath = null,
    retryCount = 0
  ) {
    try {
      // Clear SHA cache if this is a retry (to get fresh remote)
      if (retryCount > 0) {
        this.gitHubService.fileShaCache?.clear();
      }

      // Get remote content and determine filename
      const remoteResult =
        await this.getRemoteBookContentWithFilename(repository);
      const remoteBookData = remoteResult.bookData;
      const filename =
        remoteResult.filename ||
        this.generateFilename(bookData, currentFilePath);

      if (!remoteBookData) {
        // No remote content, safe to push
        await this.collaborationService.createCommit(bookData, commitMessage);
        const pushResult = await this.pushToRepository(
          repository,
          bookData,
          commitMessage,
          filename
        );
        return {
          success: pushResult.success,
          conflicts: [],
          error: pushResult.error
        };
      }

      // Get the base content (last synced version) for proper 3-way merge
      // Try to fetch from GitHub using commit SHA for more reliable base tracking
      let baseContent = null;

      if (bookData.github?.lastSyncCommitSha) {
        console.log(`Fetching base content from commit ${bookData.github.lastSyncCommitSha}`);
        baseContent = await this.gitHubService.getFileAtCommit(
          repository,
          filename,
          bookData.github.lastSyncCommitSha
        );
      }

      // Fall back to stored content if SHA fetch fails (backward compatibility)
      if (!baseContent && bookData.github?.lastSyncedContent) {
        console.log('Using stored lastSyncedContent as base (fallback)');
        baseContent = bookData.github.lastSyncedContent;
      }

      // If still no base, use remote as the base (first sync scenario)
      if (!baseContent) {
        console.log('No base content found, using remote as base (first sync)');
        baseContent = remoteBookData;
      }

      // Strip sync metadata from all versions before comparison
      // These fields are metadata about sync state, not actual content
      baseContent = JSON.parse(JSON.stringify(baseContent));
      const cleanRemote = JSON.parse(JSON.stringify(remoteBookData));
      const cleanLocal = JSON.parse(JSON.stringify(bookData));

      delete baseContent.github?.lastSyncedContent;
      delete baseContent.github?.lastSyncCommitSha;
      delete cleanRemote.github?.lastSyncedContent;
      delete cleanRemote.github?.lastSyncCommitSha;
      delete cleanLocal.github?.lastSyncedContent;
      delete cleanLocal.github?.lastSyncCommitSha;

      // Perform 3-way merge with proper base
      // This will only create conflicts when the SAME item was modified in both local and remote
      const mergeResult = await this.collaborationService.mergeContent(
        baseContent, // Common ancestor (last synced state)
        cleanRemote, // Remote changes (what's in GitHub)
        cleanLocal // Local changes (current local state)
      );

      if (mergeResult.hasConflicts) {
        // Real conflicts detected - same item modified in both places
        this.conflicts = mergeResult.conflicts;
        return {
          success: false,
          conflicts: mergeResult.conflicts,
          requiresResolution: true,
          remoteContent: cleanRemote, // Use cleaned version for conflict display
          baseContent: baseContent,
          filename
        };
      }

      // Check if merged content is different from remote
      // If identical, no need to push (just update local with sync metadata)
      const mergedContentClean = JSON.parse(
        JSON.stringify(mergeResult.content)
      );
      delete mergedContentClean.github?.lastSyncedContent;
      delete mergedContentClean.github?.lastSyncCommitSha;

      const isIdenticalToRemote =
        JSON.stringify(mergedContentClean) === JSON.stringify(cleanRemote);

      let commitSha = null;

      if (!isIdenticalToRemote) {
        // Content changed - push to GitHub
        await this.collaborationService.createCommit(
          mergeResult.content,
          commitMessage
        );
        const pushResult = await this.pushToRepository(
          repository,
          mergeResult.content,
          commitMessage,
          filename
        );

        if (!pushResult.success) {
          // Check if it's a SHA conflict (file changed on GitHub while we were working)
          if (
            pushResult.error &&
            pushResult.error.includes('does not match') &&
            retryCount === 0
          ) {
            // File changed remotely - automatically retry with fresh fetch
            console.log(
              '🔄 File changed on GitHub during sync, retrying with latest version...'
            );
            return await this.safeSyncWithRepository(
              repository,
              bookData,
              commitMessage,
              currentFilePath,
              retryCount + 1
            );
          }

          return {
            success: false,
            conflicts: [],
            error: pushResult.error
          };
        }

        // Capture the commit SHA from the push
        commitSha = pushResult.commitSha;
        console.log(`Pushed to GitHub, commit SHA: ${commitSha}`);
      } else {
        // Content identical to remote, get the latest commit SHA
        commitSha = await this.gitHubService.getLatestCommitSha(
          repository,
          filename
        );
        console.log(`No push needed, using remote commit SHA: ${commitSha}`);
      }

      // Store the commit SHA for future base tracking
      // This is much more reliable and efficient than storing full content
      mergeResult.content.github = {
        ...mergeResult.content.github,
        lastSyncCommitSha: commitSha
      };

      // Clean up old lastSyncedContent if it exists (migration)
      if (mergeResult.content.github?.lastSyncedContent) {
        delete mergeResult.content.github.lastSyncedContent;
        console.log('Migrated from lastSyncedContent to lastSyncCommitSha');
      }

      return {
        success: true,
        conflicts: [],
        mergedContent: mergeResult.content,
        wasPushed: !isIdenticalToRemote
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Resolve conflicts and complete the sync
   * @param {Object} repository - Repository info
   * @param {Array} resolutions - Array of conflict resolutions
   * @param {Object} localBookData - Local book data
   * @param {string} commitMessage - Commit message
   * @param {string} filename - Filename to use for the book file
   * @returns {Promise<Object>} - Sync result
   */
  async resolveConflictsAndSync(
    repository,
    resolutions,
    localBookData,
    commitMessage,
    filename
  ) {
    try {
      const mergedContent = this.collaborationService.applyResolutions(
        resolutions,
        localBookData,
        this.conflicts
      );

      await this.collaborationService.createCommit(
        mergedContent,
        commitMessage
      );
      const pushResult = await this.pushToRepository(
        repository,
        mergedContent,
        commitMessage,
        filename
      );

      if (pushResult.success) {
        // Store the commit SHA for future base tracking
        mergedContent.github = {
          ...mergedContent.github,
          lastSyncCommitSha: pushResult.commitSha
        };

        // Clean up old lastSyncedContent if it exists (migration)
        if (mergedContent.github?.lastSyncedContent) {
          delete mergedContent.github.lastSyncedContent;
        }

        console.log(`Conflict resolved and synced, commit SHA: ${pushResult.commitSha}`);
      }

      return {
        success: pushResult.success,
        mergedContent,
        error: pushResult.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get remote book content from repository
   * @param {Object} repository - Repository info
   * @returns {Promise<Object|null>} - Remote book data or null if not found
   */
  async getRemoteBookContent(repository) {
    const result = await this.getRemoteBookContentWithFilename(repository);
    return result.bookData;
  }

  /**
   * Get remote book content and filename from repository
   * @param {Object} repository - Repository info {fullName}
   * @returns {Promise<Object>} - {bookData, filename} or {bookData: null, filename: null}
   */
  async getRemoteBookContentWithFilename(repository) {
    try {
      const bookFile =
        await this.gitHubService.checkRepositoryForBookFile(repository.fullName);
      if (bookFile) {
        const result = await this.gitHubService.downloadBookFromRepository(
          repository.fullName,
          bookFile
        );
        return {
          bookData: result,
          filename: bookFile
        };
      }
      return { bookData: null, filename: null };
    } catch (error) {
      throw new Error(`Failed to get remote content: ${error.message}`);
    }
  }

  /**
   * Generate filename using the same logic as the original code
   * @param {Object} bookData - Book data for title-based generation
   * @param {string} currentFilePath - Current local file path
   * @returns {string} - Generated filename
   */
  generateFilename(bookData, currentFilePath) {
    let filename = 'manuscript.book'; // Default fallback

    if (currentFilePath) {
      // Extract filename from current local file path
      filename = currentFilePath.split(/[\\/]/).pop();
      if (!filename.endsWith('.book')) {
        filename = filename.replace(/\.(book|json)$/, '') + '.book';
      }
      // Sanitize the filename even when extracted from path
      // Remove URL encoding and special characters that might cause API issues
      filename =
        decodeURIComponent(filename)
          .replace(/\.book$/, '') // Remove extension temporarily
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Remove special chars including apostrophes
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') + '.book';
    } else if (bookData.title?.trim()) {
      // Generate filename from book title
      filename =
        bookData.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') + '.book';
    }

    return filename;
  }

  /**
   * Push content to repository
   * @param {Object} repository - Repository info {fullName}
   * @param {Object} content - Content to push
   * @param {string} commitMessage - Commit message
   * @param {string} filename - Filename to use for the book file
   * @returns {Promise<Object>} - Push result
   */
  async pushToRepository(repository, content, commitMessage, filename) {
    try {
      const result = await this.gitHubService.saveBookToRepository(
        repository.fullName,
        filename,
        content,
        commitMessage
      );
      return {
        success: true,
        commitSha: result.commit?.sha // Return the commit SHA for base tracking
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup (no-op in browser, but kept for API compatibility)
   */
  cleanup() {
    // No cleanup needed in browser version
    this.conflicts = [];
  }
}
