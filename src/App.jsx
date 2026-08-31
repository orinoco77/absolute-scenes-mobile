// src/App.jsx
import { useState, useCallback, useRef, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import RepositoryList from './components/RepositoryList';
import BookOverview from './components/BookOverview';
import SceneEditor from './components/SceneEditor';
import gitHubService from './utils/gitHubService';
import { syncBook, reconcilePostSyncState } from './sync/syncOrchestrator.js';
import { loadPersistedBook, savePersistedBook } from './sync/bookStorage.js';
import { useSyncTriggers } from './sync/useSyncTriggers.js';
import './App.css';

const LAST_REPO_KEY = 'absolute-scenes-mobile:lastOpenedRepo';

function formatSyncStatus(book) {
  if (!navigator.onLine) return 'Offline — will sync when connection returns';
  const lastSyncTime = book?.github?.lastSyncTime;
  if (!lastSyncTime) return 'Not yet synced';
  const minutesAgo = Math.round((Date.now() - new Date(lastSyncTime).getTime()) / 60000);
  if (minutesAgo < 1) return 'Synced just now';
  return `Synced ${minutesAgo}m ago`;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(gitHubService.isAuthenticated());
  const [isLoading, setIsLoading] = useState(false);
  const [repositories, setRepositories] = useState([]);
  const [book, setBookState] = useState(null);
  const [currentScene, setCurrentScene] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [error, setError] = useState(null);
  const [conflictSceneIds, setConflictSceneIds] = useState([]);

  const bookRef = useRef(null);
  const setBook = useCallback(newBook => {
    bookRef.current = newBook;
    setBookState(newBook);
  }, []);

  const performSync = useCallback(async () => {
    const snapshotBook = bookRef.current;
    if (!snapshotBook?.github?.repository) return null;

    try {
      const result = await syncBook({ book: snapshotBook, gitHubService });
      if (!result) return null;

      const { bookData, conflicts } = reconcilePostSyncState(
        snapshotBook,
        bookRef.current,
        result.bookData
      );
      setBook(bookData);
      await savePersistedBook(bookData.github.repository.fullName, bookData);

      // Re-point the open scene/chapter (if any) at their post-sync
      // versions -- otherwise SceneEditor keeps showing pre-merge content,
      // and a later Save would silently overwrite whatever this sync just
      // merged in. SceneEditor itself only adopts the refreshed content if
      // the user hasn't started an unsaved edit (see its own effect).
      setCurrentChapter(prevChapter => {
        if (!prevChapter) return prevChapter;
        return bookData.chapters.find(ch => ch.id === prevChapter.id) ?? prevChapter;
      });
      setCurrentScene(prevScene => {
        if (!prevScene) return prevScene;
        for (const chapter of bookData.chapters) {
          const found = chapter.scenes.find(s => s.id === prevScene.id);
          if (found) return found;
        }
        return prevScene;
      });

      setConflictSceneIds([
        ...new Set([
          ...result.conflicts.map(c => c.sceneId),
          ...conflicts.map(c => c.sceneId)
        ])
      ]);
      return result;
    } catch (err) {
      // Background sync triggers fail silently -- a transient offline blip
      // shouldn't interrupt writing.
      console.error('Sync failed:', err);
      return null;
    }
  }, [setBook]);

  useSyncTriggers(performSync, { enabled: !!book });

  const selectRepo = async repo => {
    setError(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);
    localStorage.setItem(LAST_REPO_KEY, JSON.stringify(repo));

    const persisted = await loadPersistedBook(repo.fullName);
    if (persisted) {
      setBook(persisted);
    } else {
      // No local record yet -- a stub with no lastSyncCommitSha. The first
      // sync trigger (useSyncTriggers fires immediately on enable) pulls the
      // repo's real content wholesale instead of pushing this stub as a
      // "merge" against it.
      setBook({
        title: '',
        author: '',
        chapters: [],
        illustrations: [],
        metadata: {},
        github: { repository: repo }
      });
    }
  };

  // Offline-first cold start: rehydrate the last-opened repo's persisted
  // book straight from IndexedDB on mount, before (and independent of) the
  // repositories-list network call -- so reloading with no connectivity
  // still shows the user's own local, possibly-unpushed work instead of an
  // empty "No books found" screen.
  useEffect(() => {
    if (!isAuthenticated) return;
    const stored = localStorage.getItem(LAST_REPO_KEY);
    if (!stored) return;
    try {
      const repo = JSON.parse(stored);
      selectRepo(repo);
    } catch {
      localStorage.removeItem(LAST_REPO_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async token => {
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
    localStorage.removeItem(LAST_REPO_KEY);
    setIsAuthenticated(false);
    setRepositories([]);
    setBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);
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

  const selectScene = (scene, chapter) => {
    setCurrentScene(scene);
    setCurrentChapter(chapter);
    performSync();
  };

  const goBackToOverview = () => {
    setCurrentScene(null);
    setCurrentChapter(null);
    performSync();
  };

  const goBackToBooks = () => {
    localStorage.removeItem(LAST_REPO_KEY);
    setBook(null);
    setCurrentScene(null);
    setCurrentChapter(null);
    setConflictSceneIds([]);
  };

  const persistAndSync = async updatedBook => {
    setBook(updatedBook);
    await savePersistedBook(updatedBook.github.repository.fullName, updatedBook);
    performSync();
  };

  const addChapter = async () => {
    if (!bookRef.current) return;
    const newChapter = {
      id: Date.now().toString(),
      title: `Chapter ${bookRef.current.chapters.length + 1}`,
      scenes: [],
      assignedAuthor: null
    };
    await persistAndSync({
      ...bookRef.current,
      chapters: [...bookRef.current.chapters, newChapter],
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    });
  };

  const addScene = async chapterId => {
    if (!bookRef.current) return;
    const chapter = bookRef.current.chapters.find(ch => ch.id === chapterId);
    if (!chapter) return;

    const newScene = {
      id: Date.now().toString(),
      title: `Scene ${chapter.scenes.length + 1}`,
      content: '',
      notes: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      assignedAuthor: null
    };
    const updatedBook = {
      ...bookRef.current,
      chapters: bookRef.current.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, scenes: [...ch.scenes, newScene] } : ch
      ),
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    };
    await persistAndSync(updatedBook);
    setCurrentScene(newScene);
    setCurrentChapter(updatedBook.chapters.find(ch => ch.id === chapterId));
  };

  const saveScene = async content => {
    if (!currentScene || !bookRef.current || !currentChapter) return;
    const updatedScene = { ...currentScene, content, modified: new Date().toISOString() };
    const updatedBook = {
      ...bookRef.current,
      chapters: bookRef.current.chapters.map(ch =>
        ch.id === currentChapter.id
          ? { ...ch, scenes: ch.scenes.map(s => (s.id === currentScene.id ? updatedScene : s)) }
          : ch
      ),
      metadata: { ...bookRef.current.metadata, modified: new Date().toISOString() }
    };
    setCurrentScene(updatedScene);
    await persistAndSync(updatedBook);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} isLoading={isLoading} error={error} />;
  }

  if (currentScene && book) {
    return (
      <SceneEditor
        scene={currentScene}
        chapter={currentChapter}
        book={book}
        onSave={saveScene}
        onBack={goBackToOverview}
        isLoading={isLoading}
        error={error}
        hasConflict={conflictSceneIds.includes(currentScene.id)}
      />
    );
  }

  if (book) {
    return (
      <BookOverview
        book={book}
        onSelectScene={selectScene}
        onAddChapter={addChapter}
        onAddScene={addScene}
        onBack={goBackToBooks}
        isLoading={isLoading}
        error={error}
        conflictSceneIds={conflictSceneIds}
        syncStatusText={formatSyncStatus(book)}
      />
    );
  }

  return (
    <RepositoryListWithLoad
      repositories={repositories}
      onSelectRepo={selectRepo}
      onLogout={handleLogout}
      isLoading={isLoading}
      error={error}
      loadRepositories={loadRepositories}
    />
  );
}

// Loads repositories on mount of the repo-list screen (mirrors the old
// top-level mount effect, scoped to this screen since App no longer has a
// single "authenticated" useEffect -- isAuthenticated can flip true from
// handleLogin, which already calls loadRepositories itself; this covers the
// remaining case of a page reload with a token already in localStorage but
// no remembered repo to rehydrate).
function RepositoryListWithLoad({ loadRepositories, ...props }) {
  useEffect(() => {
    loadRepositories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <RepositoryList {...props} />;
}

export default App;
