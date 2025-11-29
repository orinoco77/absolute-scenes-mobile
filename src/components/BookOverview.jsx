import './BookOverview.css';

function BookOverview({ book, onSelectScene, onBack, isLoading, error }) {
  return (
    <div className="book-overview">
      <header className="app-header">
        <button onClick={onBack} className="btn-back">
          ← Back
        </button>
        <h1>{book.title}</h1>
      </header>

      <div className="content">
        {error && <div className="error-message">{error}</div>}

        <div className="book-info">
          <p className="author">by {book.author}</p>
        </div>

        {isLoading ? (
          <div className="loading">Loading...</div>
        ) : book.chapters && book.chapters.length > 0 ? (
          <div className="chapters">
            {book.chapters.map((chapter, chapterIndex) => (
              <div key={chapter.id} className="chapter-card">
                <h2 className="chapter-title">
                  Chapter {chapterIndex + 1}: {chapter.title}
                </h2>
                {chapter.scenes && chapter.scenes.length > 0 ? (
                  <ul className="scene-list">
                    {chapter.scenes.map((scene) => (
                      <li key={scene.id} className="scene-item">
                        <button
                          onClick={() => onSelectScene(scene, chapter)}
                          className="scene-button"
                        >
                          <span className="scene-title">{scene.title}</span>
                          <span className="scene-length">
                            {scene.content.length || 0} chars
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-chapter">No scenes in this chapter</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>This book has no chapters yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default BookOverview;
