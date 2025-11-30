import { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import RepositoryList from './components/RepositoryList';
import BookOverview from './components/BookOverview';
import SceneEditor from './components/SceneEditor';
import ConflictResolution from './components/ConflictResolution';
import gitHubService from './utils/gitHubService';
import { BrowserEnhancedGitHubService } from './utils/browserEnhancedGitHubService';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [repositories, setRepositories] = useState([]);
  const [currentBook, setCurrentBook] = useState(null);
  const [currentScene, setCurrentScene] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [pendingSaveData, setPendingSaveData] = useState(null);

  // Initialize enhanced GitHub service
  const [enhancedGitHub] = useState(() => new BrowserEnhancedGitHubService());

  // Check auth status on mount
  useEffect(() => {
    setIsAuthenticated(gitHubService.isAuthenticated());
    if (gitHubService.isAuthenticated()) {
      loadRepositories();
    }
  }, []);

  const handleLogin = async (token) => {
    setIsLoading(true);
    setError(null);
    try {
      await gitHubService.validateAndSetupToken(token);
      setIsAuthenticated(true);
      await loadRepositories();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    gitHubService.clearAuth();
    setIsAuthenticated(false);
    setRepositories([]);
    setCurrentBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setCurrentRepo(null);
  };

  const loadRepositories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repos = await gitHubService.getUserRepositoriesWithBooks();
      setRepositories(repos);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBook = async (repo) => {
    setIsLoading(true);
    setError(null);
    try {
      const bookData = await gitHubService.downloadBookFromRepository(
        repo.fullName,
        repo.bookFileName
      );
      setCurrentBook(bookData);
      setCurrentRepo(repo);
      setCurrentScene(null);
      setCurrentChapter(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectScene = (scene, chapter) => {
    setCurrentScene(scene);
    setCurrentChapter(chapter);
  };

  const saveScene = async (content) => {
    if (!currentScene || !currentBook || !currentChapter) return;

    setIsLoading(true);
    setError(null);
    try {
      // Update scene content
      const updatedScene = {
        ...currentScene,
        content,
        modified: new Date().toISOString()
      };

      // Find and update scene in book
      const updatedBook = { ...currentBook };
      const chapterIndex = updatedBook.chapters.findIndex(
        c => c.id === currentChapter.id
      );

      if (chapterIndex !== -1) {
        const sceneIndex = updatedBook.chapters[chapterIndex].scenes.findIndex(
          s => s.id === currentScene.id
        );

        if (sceneIndex !== -1) {
          updatedBook.chapters[chapterIndex].scenes[sceneIndex] = updatedScene;
        }
      }

      // Update metadata
      updatedBook.metadata = {
        ...updatedBook.metadata,
        modified: new Date().toISOString()
      };

      // Use enhanced GitHub service for conflict-aware save
      const syncResult = await enhancedGitHub.safeSyncWithRepository(
        currentRepo,
        updatedBook,
        `Mobile edit: Updated scene "${currentScene.title}"`
      );

      if (syncResult.success) {
        // Save successful - update local state with merged content
        const finalBook = syncResult.mergedContent || updatedBook;
        setCurrentBook(finalBook);

        // Update current scene reference with the one from the saved book
        const savedChapter = finalBook.chapters.find(c => c.id === currentChapter.id);
        if (savedChapter) {
          const savedScene = savedChapter.scenes.find(s => s.id === currentScene.id);
          if (savedScene) {
            setCurrentScene(savedScene);
          }
        }
      } else if (syncResult.requiresResolution) {
        // Conflicts detected - show resolution UI
        setConflicts(syncResult.conflicts);
        setPendingSaveData({
          updatedBook,
          updatedScene,
          commitMessage: `Mobile edit: Updated scene "${currentScene.title}"`,
          filename: syncResult.filename
        });
        setIsLoading(false);
        return; // Don't throw error, let user resolve conflicts
      } else {
        // Save failed
        throw new Error(syncResult.error || 'Failed to save to GitHub');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleConflictResolution = async (resolutions) => {
    if (!pendingSaveData || !conflicts) return;

    setIsLoading(true);
    setError(null);
    try {
      const syncResult = await enhancedGitHub.resolveConflictsAndSync(
        currentRepo,
        resolutions,
        pendingSaveData.updatedBook,
        pendingSaveData.commitMessage,
        pendingSaveData.filename
      );

      if (syncResult.success) {
        // Save successful after conflict resolution
        const finalBook = syncResult.mergedContent || pendingSaveData.updatedBook;
        setCurrentBook(finalBook);

        // Update current scene reference
        const savedChapter = finalBook.chapters.find(c => c.id === currentChapter.id);
        if (savedChapter) {
          const savedScene = savedChapter.scenes.find(s => s.id === currentScene.id);
          if (savedScene) {
            setCurrentScene(savedScene);
          }
        }

        // Clear conflict state
        setConflicts(null);
        setPendingSaveData(null);
      } else {
        throw new Error(syncResult.error || 'Failed to save after conflict resolution');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelConflictResolution = () => {
    setConflicts(null);
    setPendingSaveData(null);
    setError('Save cancelled - conflicts need to be resolved');
  };

  const goBackToOverview = () => {
    setCurrentScene(null);
    setCurrentChapter(null);
  };

  const goBackToBooks = () => {
    setCurrentBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setCurrentRepo(null);
  };

  // Render appropriate screen based on state
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} isLoading={isLoading} error={error} />;
  }

  // Show conflict resolution overlay if there are conflicts
  if (conflicts && conflicts.length > 0) {
    return (
      <ConflictResolution
        conflicts={conflicts}
        onResolve={handleConflictResolution}
        onCancel={handleCancelConflictResolution}
      />
    );
  }

  if (currentScene && currentBook) {
    return (
      <SceneEditor
        scene={currentScene}
        chapter={currentChapter}
        book={currentBook}
        onSave={saveScene}
        onBack={goBackToOverview}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  if (currentBook) {
    return (
      <BookOverview
        book={currentBook}
        onSelectScene={selectScene}
        onBack={goBackToBooks}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return (
    <RepositoryList
      repositories={repositories}
      onSelectRepo={loadBook}
      onLogout={handleLogout}
      isLoading={isLoading}
      error={error}
    />
  );
}

export default App;
