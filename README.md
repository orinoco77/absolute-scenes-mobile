# AbsoluteScenes Mobile

Mobile companion app for the AbsoluteScenes book writing application.

## 🌐 Web App
Access the live web app at: **https://orinoco77.github.io/absolute-scenes-mobile/**

The web version works on all platforms including iOS, Android, and desktop browsers. You can add it to your home screen for a native app-like experience.

## Features
- 📱 Cross-platform (iOS, Android, Web)
- 🔐 Secure GitHub authentication
- 📚 Edit books stored in GitHub repositories
- ✍️ Scene-based writing interface
- 💾 Auto-save to GitHub
- 📖 Chapter and scene management

## GitHub Pages Deployment

### Automatic Deployment
The app automatically deploys to GitHub Pages when you push to the `main` branch.

### Manual Setup (One-time)
1. Go to your GitHub repository settings
2. Navigate to **Settings → Pages**
3. Under "Build and deployment":
   - Source: **GitHub Actions**
4. Push to `main` branch to trigger deployment

### Local Testing
```bash
# Build for web
flutter build web --release --base-href /absolute-scenes-mobile/

# Test locally (optional)
cd build/web
python3 -m http.server 8000
# Visit http://localhost:8000
```

## Development

### Prerequisites
- Flutter SDK 3.0.0 or higher
- Dart SDK 3.0.0 or higher

### Setup
```bash
# Install dependencies
flutter pub get

# Run on web
flutter run -d chrome

# Run on mobile device
flutter run
```

### Building for Production

**Web:**
```bash
flutter build web --release
```

**Android:**
```bash
flutter build appbundle --release
```

**iOS:**
```bash
flutter build ipa --release
```

## GitHub Token Setup
To use the app, you'll need a GitHub Personal Access Token with these permissions:
- `repo` (Full control of private repositories)
- `user:email` (Access user email addresses)

[Create a token here](https://github.com/settings/tokens/new)
