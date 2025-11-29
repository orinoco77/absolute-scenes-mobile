import { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import RepositoryList from './components/RepositoryList';
import BookOverview from './components/BookOverview';
import SceneEditor from './components/SceneEditor';
import gitHubService from './utils/gitHubService';
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

      // Save to GitHub
      await gitHubService.saveBookToRepository(
        currentRepo.fullName,
        currentRepo.bookFileName,
        updatedBook,
        `Mobile edit: Updated scene "${currentScene.title}"`
      );

      setCurrentBook(updatedBook);
      setCurrentScene(updatedScene);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
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
