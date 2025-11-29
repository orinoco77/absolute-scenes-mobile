# AbsoluteScenes Mobile

Mobile web companion for the AbsoluteScenes book writing application. Built with React and optimized for mobile devices.

## 🌐 Web App
Access the live web app at: **https://orinoco77.github.io/absolute-scenes-mobile/**

Works on all platforms including iOS, Android, and desktop browsers. Add it to your home screen for a native app-like experience.

## Features
- 📱 **Mobile-optimized** - Responsive design for phones and tablets
- 🔐 **GitHub Integration** - Direct sync with your book repositories
- ✍️ **Scene Editing** - Edit individual scenes with word count tracking
- 💾 **Cloud Sync** - Automatic save to GitHub with commit history
- 📖 **Book Management** - Browse chapters and scenes easily
- ✨ **Native Paste** - Full iOS Safari paste support (no Flutter issues!)

## Built With
- **React 18** - Modern UI library
- **Vite** - Fast build tool
- **GitHub API** - Cloud storage and version control
- **Vanilla CSS** - Lightweight styling

## Development

### Prerequisites
- Node.js 18+ and npm

### Setup
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Local Development
The app will be available at `http://localhost:5173` during development.

## GitHub Pages Deployment

### Automatic Deployment
The app automatically deploys to GitHub Pages when you push to the `main` branch via GitHub Actions.

### Manual Setup (One-time)
1. Go to repository settings
2. Navigate to **Settings → Pages**
3. Under "Build and deployment":
   - Source: **GitHub Actions**
4. Push to `main` to trigger deployment

## GitHub Token Setup
To use the app, create a GitHub Personal Access Token:

1. Visit https://github.com/settings/tokens/new
2. Give it a name like "AbsoluteScenes Mobile"
3. Select the **`repo`** scope (full repository access)
4. Click "Generate token"
5. Copy and paste the token into the app

**Note:** The token is stored locally in your browser and never sent anywhere except GitHub's API.

## File Format Compatibility
This app uses the same `.book` file format as the desktop version of Absolute Scenes, ensuring full compatibility between mobile and desktop editing.

## Future Plans
- **Native Mobile Apps** - Can be wrapped with Capacitor for iOS/Android app stores
- **Offline Mode** - Local caching with sync queue
- **PWA Features** - Install as standalone app on mobile devices
