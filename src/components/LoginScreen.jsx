import { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './LoginScreen.css';

function LoginScreen({ onLogin, isLoading, error: propError }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(propError);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanner, setScanner] = useState(null);

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

  const handleScanSuccess = async (decodedText, qrScanner) => {
    console.log('QR Code scanned:', decodedText);
    try {
      const qrData = JSON.parse(decodedText);
      console.log('Parsed QR data:', qrData);

      if (qrData.type === 'absolute-scenes-github-token' && qrData.token) {
        // Stop scanner
        if (qrScanner) {
          await qrScanner.stop();
        }
        setShowScanner(false);
        setScanner(null);

        // Automatically log in with the scanned token
        await onLogin(qrData.token);
        setError(null);
      } else {
        console.error('Invalid QR data structure:', qrData);
        setError('Invalid QR code. Please scan a valid Absolute Scenes token QR code.');
      }
    } catch (err) {
      console.error('Failed to parse QR code:', err, 'Raw text:', decodedText);
      setError('Invalid QR code format. Please try again.');
    }
  };

  const handleStartScanning = () => {
    setShowScanner(true);
    setError(null);
  };

  const handleStopScanning = async () => {
    if (scanner) {
      try {
        await scanner.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      setScanner(null);
    }
    setShowScanner(false);
  };

  useEffect(() => {
    let qrScanner = null;
    let isCleaningUp = false;

    const startScanner = async () => {
      if (showScanner && !qrScanner) {
        try {
          console.log('Initializing QR scanner...');
          qrScanner = new Html5Qrcode('qr-reader');

          // Get available cameras
          const devices = await Html5Qrcode.getCameras();
          console.log('Available cameras:', devices);

          if (devices && devices.length > 0) {
            // Try to find back/rear camera, otherwise use first camera
            let selectedCamera = devices[0];

            // Look for back/rear/environment camera
            const backCamera = devices.find(device =>
              device.label.toLowerCase().includes('back') ||
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment')
            );

            if (backCamera) {
              selectedCamera = backCamera;
              console.log('Using back camera:', selectedCamera.label);
            } else {
              console.log('Using first available camera:', selectedCamera.label);
            }

            // Start scanning with the selected camera
            await qrScanner.start(
              selectedCamera.id,
              {
                fps: 20,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
              },
              (decodedText) => {
                if (!isCleaningUp) {
                  console.log('QR code detected!');
                  handleScanSuccess(decodedText, qrScanner);
                }
              },
              (errorMessage) => {
                // Ignore continuous scanning errors
                if (!errorMessage.includes('NotFoundException')) {
                  console.debug('QR scan error:', errorMessage);
                }
              }
            );

            setScanner(qrScanner);
          } else {
            setError('No cameras found. Please check camera permissions.');
            setShowScanner(false);
          }
        } catch (err) {
          console.error('Failed to start scanner:', err);
          setError('Failed to access camera. Please check permissions.');
          setShowScanner(false);
        }
      }
    };

    startScanner();

    return () => {
      isCleaningUp = true;
      if (qrScanner) {
        console.log('Cleaning up QR scanner...');
        qrScanner.stop().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]);

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="logo">📚</div>
        <h1>AbsoluteScenes Mobile</h1>
        <p className="subtitle">Connect to GitHub to access your books</p>

        {!showScanner ? (
          <>
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
                {isLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <div className="spinner-small"></div>
                    Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </button>
            </form>

            <div style={{ margin: '1rem 0', textAlign: 'center', color: '#666' }}>
              OR
            </div>

            <button
              onClick={handleStartScanning}
              className="btn-secondary"
              disabled={isLoading}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              📱 Scan QR Code from Desktop
            </button>
          </>
        ) : (
          <div className="qr-scanner-container">
            <p style={{ marginBottom: '1rem', color: '#666', fontSize: '14px' }}>
              Point your camera at the QR code on your desktop
            </p>
            <div id="qr-reader" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}></div>
            {error && <div className="error-message" style={{ marginTop: '1rem' }}>{error}</div>}
            <button
              onClick={handleStopScanning}
              className="btn-secondary"
              style={{ marginTop: '1rem', width: '100%' }}
            >
              Cancel
            </button>
          </div>
        )}

        {!showScanner && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
