import { useState } from 'react';
import './LoginScreen.css';

function LoginScreen({ onLogin, isLoading, error: propError }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(propError);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter your GitHub token');
      return;
    }

    try {
      await onLogin(token);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const openTokenPage = () => {
    const description = `AbsoluteScenes Mobile (${new Date().toLocaleDateString()})`;
    const url = `https://github.com/settings/tokens/new?scopes=repo&description=${encodeURIComponent(description)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="logo">📚</div>
        <h1>AbsoluteScenes Mobile</h1>
        <p className="subtitle">Connect to GitHub to access your books</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="token">GitHub Personal Access Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              disabled={isLoading}
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>
        </form>

        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="btn-link"
        >
          {showInstructions ? 'Hide' : 'Show'} Setup Instructions
        </button>

        {showInstructions && (
          <div className="instructions">
            <h3>How to create a GitHub token:</h3>
            <ol>
              <li>
                <button onClick={openTokenPage} className="btn-inline">
                  Click here to open GitHub token page
                </button>
              </li>
              <li>Give it a name like "AbsoluteScenes Mobile"</li>
              <li>Ensure the <strong>repo</strong> scope is checked</li>
              <li>Click "Generate token" at the bottom</li>
              <li>Copy the token and paste it above</li>
            </ol>
            <p className="warning">⚠️ The token will only be shown once!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
