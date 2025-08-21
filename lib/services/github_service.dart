import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/book.dart';

class GitHubService {
  static const String _baseUrl = 'https://api.github.com';
  static const String _tokenKey = 'github_token';
  static const String _userKey = 'github_user';

  String? _token;
  Map<String, dynamic>? _userInfo;

  // Singleton pattern
  static final GitHubService _instance = GitHubService._internal();
  factory GitHubService() => _instance;
  GitHubService._internal();

  // Check if authenticated
  bool get isAuthenticated => _token != null;

  // Load stored authentication
  Future<bool> loadStoredAuth() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    
    if (userJson != null) {
      _userInfo = json.decode(userJson);
    }
    
    return _token != null;
  }

  // Validate and store token
  Future<Map<String, dynamic>> validateAndSetupToken(String token) async {
    if (!token.startsWith('ghp_')) {
      throw Exception('Please enter a valid GitHub personal access token');
    }

    final response = await http.get(
      Uri.parse('$_baseUrl/user'),
      headers: {
        'Authorization': 'Bearer $token',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AbsoluteScenes-Mobile',
      },
    );

    if (response.statusCode == 401) {
      throw Exception('Invalid token. Please check that you copied it correctly.');
    } else if (response.statusCode == 403) {
      throw Exception('Token lacks required permissions. Please ensure "repo" and "user:email" scopes are selected.');
    } else if (response.statusCode != 200) {
      throw Exception('GitHub API error: ${response.statusCode}');
    }

    final userInfo = json.decode(response.body);
    await _storeAuth(token, userInfo);
    return userInfo;
  }

  // Store authentication
  Future<void> _storeAuth(String token, Map<String, dynamic> userInfo) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_userKey, json.encode(userInfo));
    
    _token = token;
    _userInfo = userInfo;
  }

  // Get repositories with book files
  Future<List<Repository>> getUserRepositoriesWithBooks() async {
    if (!isAuthenticated) throw Exception('Not authenticated');

    final response = await http.get(
      Uri.parse('$_baseUrl/user/repos?sort=updated&per_page=100'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AbsoluteScenes-Mobile',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch repositories: ${response.statusCode}');
    }

    final repos = json.decode(response.body) as List;
    final bookRepos = <Repository>[];

    // Check each repo for book files
    for (final repo in repos) {
      final bookFile = await _checkForBookFile(repo['full_name']);
      if (bookFile != null) {
        bookRepos.add(Repository(
          fullName: repo['full_name'],
          name: repo['name'],
          description: repo['description'],
          bookFileName: bookFile,
        ));
      }
    }

    return bookRepos;
  }

  // Check if repository contains a book file
  Future<String?> _checkForBookFile(String repoFullName) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/repos/$repoFullName/contents'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AbsoluteScenes-Mobile',
        },
      );

      if (response.statusCode == 200) {
        final contents = json.decode(response.body) as List;
        for (final file in contents) {
          if (file['type'] == 'file' && file['name'].toString().endsWith('.book')) {
            return file['name'];
          }
        }
      }
    } catch (e) {
      // Ignore errors - repo might be empty or inaccessible
    }
    
    return null;
  }

  // Download book from repository
  Future<Book> downloadBookFromRepository(String repoFullName, String fileName) async {
    if (!isAuthenticated) throw Exception('Not authenticated');

    final response = await http.get(
      Uri.parse('$_baseUrl/repos/$repoFullName/contents/$fileName'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AbsoluteScenes-Mobile',
      },
    );

    if (response.statusCode == 404) {
      throw Exception('Book file not found in repository');
    } else if (response.statusCode != 200) {
      throw Exception('Failed to download file: ${response.statusCode}');
    }

    final fileData = json.decode(response.body);
    final content = utf8.decode(base64.decode(fileData['content'].replaceAll(RegExp(r'\s'), '')));
    
    // Normalize line endings
    final normalizedContent = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    
    try {
      final bookJson = json.decode(normalizedContent);
      return Book.fromJson(bookJson);
    } catch (e) {
      throw Exception('Downloaded file is not a valid book format');
    }
  }

  // Save book to repository
  Future<void> saveBookToRepository(String repoFullName, String fileName, Book book, String commitMessage) async {
    if (!isAuthenticated) throw Exception('Not authenticated');

    // Get current file SHA if it exists
    String? fileSha;
    try {
      final fileResponse = await http.get(
        Uri.parse('$_baseUrl/repos/$repoFullName/contents/$fileName'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AbsoluteScenes-Mobile',
        },
      );

      if (fileResponse.statusCode == 200) {
        final fileData = json.decode(fileResponse.body);
        fileSha = fileData['sha'];
      }
    } catch (e) {
      // File doesn't exist - will create new
    }

    // Prepare content
    final bookJson = json.encode(book.toJson());
    final normalizedContent = bookJson.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    final encodedContent = base64.encode(utf8.encode(normalizedContent));

    final updateData = {
      'message': commitMessage,
      'content': encodedContent,
      'branch': 'main',
    };

    if (fileSha != null) {
      updateData['sha'] = fileSha;
    }

    final response = await http.put(
      Uri.parse('$_baseUrl/repos/$repoFullName/contents/$fileName'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AbsoluteScenes-Mobile',
        'Content-Type': 'application/json',
      },
      body: json.encode(updateData),
    );

    if (response.statusCode != 200 && response.statusCode != 201) {
      final errorData = json.decode(response.body);
      throw Exception(errorData['message'] ?? 'Failed to save to repository: ${response.statusCode}');
    }
  }

  // Clear authentication
  Future<void> clearAuth() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    
    _token = null;
    _userInfo = null;
  }
}

class Repository {
  final String fullName;
  final String name;
  final String? description;
  final String bookFileName;

  Repository({
    required this.fullName,
    required this.name,
    this.description,
    required this.bookFileName,
  });
}