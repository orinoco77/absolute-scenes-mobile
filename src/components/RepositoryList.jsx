import './RepositoryList.css';

function RepositoryList({ repositories, onSelectRepo, onLogout, isLoading, error }) {
  return (
    <div className="repository-list">
      <header className="app-header">
        <h1>Your Books</h1>
        <button onClick={onLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="content">
        {error && <div className="error-message">{error}</div>}

        {isLoading ? (
          <div className="loading">Loading your books...</div>
        ) : repositories.length === 0 ? (
          <div className="empty-state">
            <p>No books found in your GitHub repositories</p>
            <p className="hint">Books must have a .book file in the repository root</p>
          </div>
        ) : (
          <ul className="repo-list">
            {repositories.map((repo) => (
              <li key={repo.fullName} className="repo-item">
                <button
                  onClick={() => onSelectRepo(repo)}
                  className="repo-button"
                >
                  <div className="repo-icon">📖</div>
                  <div className="repo-info">
                    <h3>{repo.name}</h3>
                    {repo.description && (
                      <p className="repo-description">{repo.description}</p>
                    )}
                    <span className="repo-file">{repo.bookFileName}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RepositoryList;
