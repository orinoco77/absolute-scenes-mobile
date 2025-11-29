import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'services/github_service.dart';
import 'models/book.dart';

void main() {
  runApp(const AbsoluteScenesApp());
}

class AbsoluteScenesApp extends StatelessWidget {
  const AbsoluteScenesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(
        title: 'AbsoluteScenes Mobile',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          appBarTheme: const AppBarTheme(
            backgroundColor: Colors.blue,
            foregroundColor: Colors.white,
          ),
        ),
        home: const HomePage(),
      ),
    );
  }
}

class AppState extends ChangeNotifier {
  final GitHubService _githubService = GitHubService();
  
  bool _isAuthenticated = false;
  bool _isLoading = false;
  List<Repository> _repositories = [];
  Book? _currentBook;
  Scene? _currentScene;
  Chapter? _currentChapter;
  String? _currentRepoFullName;
  String? _currentBookFileName;

  bool get isAuthenticated => _isAuthenticated;
  bool get isLoading => _isLoading;
  List<Repository> get repositories => _repositories;
  Book? get currentBook => _currentBook;
  Scene? get currentScene => _currentScene;
  Chapter? get currentChapter => _currentChapter;

  Future<void> checkAuthStatus() async {
    _isLoading = true;
    notifyListeners();
    
    _isAuthenticated = await _githubService.loadStoredAuth();
    if (_isAuthenticated) {
      await loadRepositories();
    }
    
    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String token) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      await _githubService.validateAndSetupToken(token);
      _isAuthenticated = true;
      await loadRepositories();
    } catch (e) {
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadRepositories() async {
    _repositories = await _githubService.getUserRepositoriesWithBooks();
    notifyListeners();
  }

  Future<void> loadBook(Repository repo) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      _currentBook = await _githubService.downloadBookFromRepository(
        repo.fullName, 
        repo.bookFileName,
      );
      _currentRepoFullName = repo.fullName;
      _currentBookFileName = repo.bookFileName;
      
      // Don't auto-select a scene - let user choose from overview
      _currentScene = null;
      _currentChapter = null;
    } catch (e) {
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void selectScene(Scene scene, Chapter chapter) {
    _currentScene = scene;
    _currentChapter = chapter;
    notifyListeners();
  }

  String get currentSceneTitle {
    if (_currentScene != null) {
      return _currentScene!.title;
    }
    if (_currentBook != null && _currentBook!.chapters.isNotEmpty && _currentBook!.chapters.first.scenes.isNotEmpty) {
      return _currentBook!.chapters.first.scenes.first.title;
    }
    return 'No Scene';
  }

  Future<void> saveCurrentScene(String content) async {
    if (_currentScene == null || _currentBook == null || _currentChapter == null) return;

    _isLoading = true;
    notifyListeners();
    
    try {
      // Update scene content and modified time
      final updatedScene = Scene(
        id: _currentScene!.id,
        title: _currentScene!.title,
        content: content,
        notes: _currentScene!.notes,
        created: _currentScene!.created,
        modified: DateTime.now(),
      );
      
      // Find and update scene in chapter
      final chapterIndex = _currentBook!.chapters.indexWhere((c) => c.id == _currentChapter!.id);
      if (chapterIndex != -1) {
        final sceneIndex = _currentBook!.chapters[chapterIndex].scenes.indexWhere((s) => s.id == _currentScene!.id);
        if (sceneIndex != -1) {
          _currentBook!.chapters[chapterIndex].scenes[sceneIndex] = updatedScene;
          _currentScene = updatedScene;
        }
      }

      // Save to GitHub
      await _githubService.saveBookToRepository(
        _currentRepoFullName!,
        _currentBookFileName!,
        _currentBook!,
        'Mobile edit: Updated scene "${_currentScene!.title}"',
      );
    } catch (e) {
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _githubService.clearAuth();
    _isAuthenticated = false;
    _repositories = [];
    _currentBook = null;
    _currentScene = null;
    _currentChapter = null;
    _currentRepoFullName = null;
    _currentBookFileName = null;
    notifyListeners();
  }

  void goBackToOverview() {
    _currentScene = null;
    _currentChapter = null;
    notifyListeners();
  }

  void goBackToBooks() {
    _currentBook = null;
    _currentScene = null;
    _currentChapter = null;
    _currentRepoFullName = null;
    _currentBookFileName = null;
    notifyListeners();
  }

  void createNewScene(String title, Chapter chapter) {
    if (_currentBook == null) return;

    final newScene = Scene(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      content: '',
      notes: '',
      created: DateTime.now(),
      modified: DateTime.now(),
    );

    final chapterIndex = _currentBook!.chapters.indexWhere((c) => c.id == chapter.id);
    if (chapterIndex != -1) {
      _currentBook!.chapters[chapterIndex].scenes.add(newScene);
      _currentScene = newScene;
      _currentChapter = chapter;
    }
    notifyListeners();
  }

  void createNewChapter(String title) {
    if (_currentBook == null) return;

    final newChapter = Chapter(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      scenes: [],
    );

    _currentBook!.chapters.add(newChapter);
    notifyListeners();
  }

  void deleteScene(Scene scene, Chapter chapter) {
    if (_currentBook == null) return;

    final chapterIndex = _currentBook!.chapters.indexWhere((c) => c.id == chapter.id);
    if (chapterIndex != -1) {
      _currentBook!.chapters[chapterIndex].scenes.removeWhere((s) => s.id == scene.id);
      
      // If we're currently editing this scene, go back to overview
      if (_currentScene?.id == scene.id) {
        _currentScene = null;
        _currentChapter = null;
      }
      
      notifyListeners();
    }
  }

  void deleteChapter(Chapter chapter) {
    if (_currentBook == null) return;

    _currentBook!.chapters.removeWhere((c) => c.id == chapter.id);
    
    // If we're currently editing a scene from this chapter, go back to overview
    if (_currentChapter?.id == chapter.id) {
      _currentScene = null;
      _currentChapter = null;
    }
    
    notifyListeners();
  }

}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().checkAuthStatus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, child) {
        if (!appState.isAuthenticated) {
          return const LoginScreen();
        }
        
        if (appState.currentBook != null) {
          if (appState.currentScene != null) {
            return const BookEditorScreen();
          } else {
            return const BookOverviewScreen();
          }
        }
        
        return const RepositoryListScreen();
      },
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _tokenController = TextEditingController();
  String? _errorMessage;

  void _showTokenInstructions(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('GitHub Token Setup'),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Follow these steps to create your GitHub token:'),
              SizedBox(height: 16),
              Text('1. Go to github.com and sign in'),
              SizedBox(height: 8),
              Text('2. Click your profile picture → Settings'),
              SizedBox(height: 8),
              Text('3. Scroll down and click "Developer settings"'),
              SizedBox(height: 8),
              Text('4. Click "Personal access tokens" → "Tokens (classic)"'),
              SizedBox(height: 8),
              Text('5. Click "Generate new token" → "Generate new token (classic)"'),
              SizedBox(height: 8),
              Text('6. Give it a name like "AbsoluteScenes Mobile"'),
              SizedBox(height: 8),
              Text('7. Check these permissions:', style: TextStyle(fontWeight: FontWeight.bold)),
              Text('   ✓ repo (Full control of private repositories)'),
              Text('   ✓ user:email (Access user email addresses)'),
              SizedBox(height: 8),
              Text('8. Click "Generate token"'),
              SizedBox(height: 8),
              Text('9. Copy the token and paste it here'),
              SizedBox(height: 16),
              Text('⚠️ Important: The token will only be shown once!', 
                   style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AbsoluteScenes Mobile')),
      body: Consumer<AppState>(
        builder: (context, appState, child) {
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.book, size: 80, color: Colors.blue),
                const SizedBox(height: 20),
                const Text(
                  'Connect to GitHub',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 40),
                TextField(
                  controller: _tokenController,
                  decoration: InputDecoration(
                    labelText: 'GitHub Personal Access Token',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.vpn_key),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.content_paste),
                      tooltip: 'Paste from clipboard',
                      onPressed: () async {
                        try {
                          final clipboardData = await Clipboard.getData(Clipboard.kTextPlain);
                          if (clipboardData != null && clipboardData.text != null) {
                            _tokenController.text = clipboardData.text!;
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Token pasted successfully!'),
                                  duration: Duration(seconds: 2),
                                ),
                              );
                            }
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Failed to paste. Please try typing or using long-press paste.'),
                                duration: Duration(seconds: 3),
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ),
                  enableInteractiveSelection: true,
                  autocorrect: false,
                  keyboardType: TextInputType.text,
                  maxLines: 1,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Tip: Tap the paste icon or long-press in the field to paste',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                if (_errorMessage != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: appState.isLoading ? null : () async {
                      if (_tokenController.text.isEmpty) {
                        setState(() {
                          _errorMessage = 'Please enter your GitHub token';
                        });
                        return;
                      }

                      try {
                        await appState.login(_tokenController.text);
                        setState(() {
                          _errorMessage = null;
                        });
                      } catch (e) {
                        setState(() {
                          _errorMessage = e.toString();
                        });
                      }
                    },
                    child: appState.isLoading
                        ? const CircularProgressIndicator()
                        : const Text('Connect'),
                  ),
                ),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: () => _showTokenInstructions(context),
                  icon: const Icon(Icons.help_outline),
                  label: const Text('How to get a GitHub token'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class RepositoryListScreen extends StatelessWidget {
  const RepositoryListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your Books'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AppState>().logout(),
          ),
        ],
      ),
      body: Consumer<AppState>(
        builder: (context, appState, child) {
          if (appState.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (appState.repositories.isEmpty) {
            return const Center(
              child: Text('No books found in your repositories'),
            );
          }

          return ListView.builder(
            itemCount: appState.repositories.length,
            itemBuilder: (context, index) {
              final repo = appState.repositories[index];
              return ListTile(
                leading: const Icon(Icons.book),
                title: Text(repo.name),
                subtitle: Text(repo.description ?? 'No description'),
                trailing: Text(repo.bookFileName),
                onTap: () async {
                  try {
                    await appState.loadBook(repo);
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to load book: $e')),
                      );
                    }
                  }
                },
              );
            },
          );
        },
      ),
    );
  }
}

class BookOverviewScreen extends StatelessWidget {
  const BookOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, child) {
        if (appState.currentBook == null) return Container();

        final book = appState.currentBook!;

        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => appState.goBackToBooks(),
            ),
            title: Text(book.title),
            actions: [
              IconButton(
                icon: const Icon(Icons.add_circle, color: Colors.white),
                onPressed: () => _showCreateChapterDialog(context, appState),
                tooltip: 'Add Chapter',
              ),
            ],
          ),
          body: book.chapters.isEmpty
              ? _buildEmptyState(context, appState)
              : ListView(
                  padding: const EdgeInsets.all(16.0),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16.0),
                      child: Text(
                        'by ${book.author}',
                        style: const TextStyle(color: Colors.grey, fontSize: 16),
                      ),
                    ),
                    ...book.chapters.asMap().entries.map((entry) {
                      final index = entry.key;
                      final chapter = entry.value;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 16.0),
                        child: ExpansionTile(
                          leading: const Icon(Icons.folder, color: Colors.orange),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  chapter.title,
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                ),
                              ),
                              PopupMenuButton<String>(
                                onSelected: (action) {
                                  if (action == 'delete') {
                                    _showDeleteChapterDialog(context, appState, chapter);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem<String>(
                                    value: 'delete',
                                    child: Row(
                                      children: [
                                        Icon(Icons.delete, color: Colors.red),
                                        SizedBox(width: 8),
                                        Text('Delete Chapter', style: TextStyle(color: Colors.red)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          subtitle: Text('Chapter ${index + 1} • ${chapter.scenes.length} scenes'),
                          children: [
                            ...chapter.scenes.map((scene) => ListTile(
                              leading: const Icon(Icons.description, color: Colors.blue),
                              title: Text(scene.title),
                              subtitle: Text(scene.content.isEmpty 
                                  ? 'Empty scene' 
                                  : '${scene.content.length} characters'),
                              trailing: PopupMenuButton<String>(
                                onSelected: (action) {
                                  if (action == 'edit') {
                                    appState.selectScene(scene, chapter);
                                  } else if (action == 'delete') {
                                    _showDeleteSceneDialog(context, appState, scene, chapter);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem<String>(
                                    value: 'edit',
                                    child: Row(
                                      children: [
                                        Icon(Icons.edit),
                                        SizedBox(width: 8),
                                        Text('Edit'),
                                      ],
                                    ),
                                  ),
                                  const PopupMenuItem<String>(
                                    value: 'delete',
                                    child: Row(
                                      children: [
                                        Icon(Icons.delete, color: Colors.red),
                                        SizedBox(width: 8),
                                        Text('Delete', style: TextStyle(color: Colors.red)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              onTap: () {
                                appState.selectScene(scene, chapter);
                              },
                            )).toList(),
                            ListTile(
                              leading: const Icon(Icons.add, color: Colors.blue),
                              title: const Text('Add Scene to Chapter'),
                              onTap: () => _showCreateSceneDialog(context, appState, chapter: chapter),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ],
                ),
        );
      },
    );
  }

  Widget _buildEmptyState(BuildContext context, AppState appState) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.book, size: 80, color: Colors.grey),
          const SizedBox(height: 16),
          const Text(
            'Your book is ready!',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Text(
            'Start by creating your first chapter',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: () => _showCreateChapterDialog(context, appState),
            icon: const Icon(Icons.add),
            label: const Text('Create First Chapter'),
          ),
        ],
      ),
    );
  }

  void _showCreateChapterDialog(BuildContext context, AppState appState) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create New Chapter'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Chapter Title',
            hintText: 'Enter chapter title...',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                appState.createNewChapter(controller.text.trim());
                Navigator.pop(context);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _showCreateSceneDialog(BuildContext context, AppState appState, {required Chapter chapter}) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Create Scene in "${chapter.title}"'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Scene Title',
            hintText: 'Enter scene title...',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                appState.createNewScene(controller.text.trim(), chapter);
                Navigator.pop(context);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _showDeleteSceneDialog(BuildContext context, AppState appState, Scene scene, Chapter chapter) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Scene'),
        content: Text('Are you sure you want to delete "${scene.title}"? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              appState.deleteScene(scene, chapter);
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _showDeleteChapterDialog(BuildContext context, AppState appState, Chapter chapter) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Chapter'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Are you sure you want to delete "${chapter.title}"?'),
            const SizedBox(height: 8),
            if (chapter.scenes.isNotEmpty) ...[
              const Text(
                'This will also delete all scenes in this chapter:',
                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red),
              ),
              const SizedBox(height: 4),
              ...chapter.scenes.map((scene) => Text('• ${scene.title}')).toList(),
              const SizedBox(height: 8),
            ],
            const Text(
              'This action cannot be undone.',
              style: TextStyle(color: Colors.red),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              appState.deleteChapter(chapter);
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class BookEditorScreen extends StatefulWidget {
  const BookEditorScreen({super.key});

  @override
  State<BookEditorScreen> createState() => _BookEditorScreenState();
}

class _BookEditorScreenState extends State<BookEditorScreen> {
  final _textController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Use addPostFrameCallback to ensure the widget is built
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _updateTextFromScene();
    });
  }

  void _updateTextFromScene() {
    final appState = context.read<AppState>();
    if (appState.currentScene != null) {
      _textController.text = appState.currentScene!.content;
    } else if (appState.currentBook != null && appState.currentBook!.chapters.isNotEmpty && appState.currentBook!.chapters.first.scenes.isNotEmpty) {
      // Auto-select first scene if none selected
      final firstChapter = appState.currentBook!.chapters.first;
      final firstScene = firstChapter.scenes.first;
      appState.selectScene(firstScene, firstChapter);
      _textController.text = firstScene.content;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, child) {
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => appState.goBackToOverview(),
            ),
            title: Text(appState.currentSceneTitle),
            actions: [
              IconButton(
                icon: appState.isLoading 
                    ? const CircularProgressIndicator()
                    : const Icon(Icons.save),
                onPressed: appState.isLoading ? null : () async {
                  try {
                    await appState.saveCurrentScene(_textController.text);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Scene saved!')),
                      );
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to save: $e')),
                      );
                    }
                  }
                },
              ),
            ],
          ),
          body: Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              controller: _textController,
              maxLines: null,
              expands: true,
              decoration: const InputDecoration(
                hintText: 'Start writing your scene...',
                border: InputBorder.none,
              ),
              style: const TextStyle(fontSize: 16, height: 1.5),
            ),
          ),
        );
      },
    );
  }

}