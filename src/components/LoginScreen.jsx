import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './LoginScreen.css';

function LoginScreen({ onLogin, isLoading, error: propError }) {
  const [error, setError] = useState(propError);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const handleScanSuccess = async (decodedText) => {
    // Prevent multiple simultaneous scans
    if (isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const qrData = JSON.parse(decodedText);

      if (qrData.type === 'absolute-scenes-github-token' && qrData.token) {
        // Stop scanner and show loading state
        await stopScanner();
        setIsLoggingIn(true);
        setError(null);

        // Automatically log in with the scanned token
        try {
          await onLogin(qrData.token);
          // Don't set isLoggingIn to false - let the parent component handle the transition
          // The LoginScreen will unmount when login succeeds
        } catch (loginErr) {
          setError(`Login failed: ${loginErr.message}`);
          setIsLoggingIn(false);
          setShowScanner(false);
          isProcessingRef.current = false;
        }
      } else {
        setError('Invalid QR code. Please scan a valid Absolute Scenes token QR code.');
        isProcessingRef.current = false;
      }
    } catch (err) {
      setError('Invalid QR code format. Please try again.');
      isProcessingRef.current = false;
    }
  };

  const handleStartScanning = () => {
    setShowScanner(true);
    setShowManualEntry(false);
    setError(null);
    isProcessingRef.current = false;
  };

  const handleStopScanning = async () => {
    await stopScanner();
    setShowScanner(false);
    isProcessingRef.current = false;
  };

  const handleShowManualEntry = () => {
    setShowManualEntry(true);
    setError(null);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const token = manualToken.trim();
    if (!token) return;

    setIsLoggingIn(true);
    setError(null);
    try {
      await onLogin(token);
      // Don't set isLoggingIn to false -- let the parent handle the
      // transition, same as the QR path. LoginScreen unmounts on success.
    } catch (err) {
      setError(`Login failed: ${err.message}`);
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    let isCleaningUp = false;

    const startScanner = async () => {
      if (showScanner && !scannerRef.current) {
        try {
          console.log('Initializing QR scanner...');
          const qrScanner = new Html5Qrcode('qr-reader');
          scannerRef.current = qrScanner;

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
                  handleScanSuccess(decodedText);
                }
              },
              (errorMessage) => {
                // Ignore continuous scanning errors
                if (!errorMessage.includes('NotFoundException')) {
                  console.debug('QR scan error:', errorMessage);
                }
              }
            );
          } else {
            setError('No cameras found. Please check camera permissions.');
            setShowScanner(false);
          }
        } catch (err) {
          console.error('Failed to start scanner:', err);
          setError(`Failed to access camera: ${err.message || err}`);
          setShowScanner(false);
        }
      }
    };

    startScanner();

    return () => {
      isCleaningUp = true;
      if (scannerRef.current) {
        console.log('Cleaning up QR scanner...');
        try {
          // stop() throws synchronously (rather than rejecting) when the
          // scanner was constructed but never successfully started -- e.g.
          // camera access failed before qrScanner.start() was ever called.
          // An uncaught synchronous throw here, during effect cleanup,
          // crashes the whole render tree with no error boundary to catch
          // it -- confirmed live (blank page) when camera access failed on
          // an insecure (non-HTTPS, non-localhost) origin.
          scannerRef.current.stop().catch(console.error);
        } catch (err) {
          console.error('Error stopping scanner:', err);
        }
        scannerRef.current = null;
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

        {isLoggingIn ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
            <p style={{ color: '#666', fontSize: '16px' }}>
              Connecting to GitHub...
            </p>
          </div>
        ) : !showScanner ? (
          <div style={{ padding: '2rem 1rem' }}>
            <p style={{ marginBottom: '2rem', color: '#666', fontSize: '15px', lineHeight: '1.5' }}>
              To get started, you'll need to connect to GitHub using your desktop app.
            </p>

            {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

            <button
              onClick={handleStartScanning}
              className="btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              📱 Scan QR Code from Desktop
            </button>

            {!showManualEntry ? (
              <button
                onClick={handleShowManualEntry}
                className="btn-link"
                style={{ width: '100%', textAlign: 'center' }}
              >
                Or paste a token manually
              </button>
            ) : (
              <form onSubmit={handleManualSubmit}>
                <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="password"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="ghp_..."
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  disabled={!manualToken.trim()}
                >
                  Connect
                </button>
              </form>
            )}

            <div className="instructions" style={{ marginTop: '2rem' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '0.75rem' }}>How it works:</h3>
              <ol style={{ fontSize: '14px', lineHeight: '1.6' }}>
                <li>Open Absolute Scenes on your desktop</li>
                <li>Connect to GitHub in Settings</li>
                <li>Click "Share Token with Mobile App"</li>
                <li>Scan the QR code with this app, or copy the token and paste it above</li>
              </ol>
            </div>
          </div>
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
      </div>
    </div>
  );
}

export default LoginScreen;
