// Book data model matching the .book file format
class Book {
  final String title;
  final String author;
  final List<Chapter> chapters;
  final List<Character> characters;
  final List<Location> locations;
  final Map<String, dynamic> metadata;

  Book({
    required this.title,
    required this.author,
    required this.chapters,
    required this.characters,
    required this.locations,
    required this.metadata,
  });

  // Convert from JSON (from .book file)
  factory Book.fromJson(Map<String, dynamic> json) {
    return Book(
      title: json['title'] ?? 'Untitled',
      author: json['author'] ?? 'Unknown Author',
      chapters: (json['chapters'] as List<dynamic>? ?? [])
          .map((chapter) => Chapter.fromJson(chapter))
          .toList(),
      characters: (json['characters'] as List<dynamic>? ?? [])
          .map((character) => Character.fromJson(character))
          .toList(),
      locations: (json['locations'] as List<dynamic>? ?? [])
          .map((location) => Location.fromJson(location))
          .toList(),
      metadata: json['metadata'] ?? {},
    );
  }

  // Convert to JSON (for .book file)
  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'author': author,
      'chapters': chapters.map((chapter) => chapter.toJson()).toList(),
      'characters': characters.map((character) => character.toJson()).toList(),
      'locations': locations.map((location) => location.toJson()).toList(),
      'metadata': metadata,
    };
  }
}

class Scene {
  final String id;
  final String title;
  String content;
  final String notes;
  final DateTime created;
  final DateTime modified;

  Scene({
    required this.id,
    required this.title,
    required this.content,
    required this.notes,
    required this.created,
    required this.modified,
  });

  factory Scene.fromJson(Map<String, dynamic> json) {
    return Scene(
      id: json['id'] ?? '',
      title: json['title'] ?? 'Untitled Scene',
      content: json['content'] ?? '',
      notes: json['notes'] ?? '',
      created: DateTime.tryParse(json['created'] ?? '') ?? DateTime.now(),
      modified: DateTime.tryParse(json['modified'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'notes': notes,
      'created': created.toIso8601String(),
      'modified': modified.toIso8601String(),
    };
  }
}

class Chapter {
  final String id;
  final String title;
  final List<Scene> scenes;

  Chapter({
    required this.id,
    required this.title,
    required this.scenes,
  });

  factory Chapter.fromJson(Map<String, dynamic> json) {
    return Chapter(
      id: json['id'] ?? '',
      title: json['title'] ?? 'Untitled Chapter',
      scenes: (json['scenes'] as List<dynamic>? ?? [])
          .map((scene) => Scene.fromJson(scene))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'scenes': scenes.map((scene) => scene.toJson()).toList(),
    };
  }
}

class Character {
  final String id;
  final String name;
  final String? description;
  final Map<String, dynamic> attributes;

  Character({
    required this.id,
    required this.name,
    this.description,
    required this.attributes,
  });

  factory Character.fromJson(Map<String, dynamic> json) {
    return Character(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unnamed Character',
      description: json['description'],
      attributes: json['attributes'] ?? {},
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'attributes': attributes,
    };
  }
}

class Location {
  final String id;
  final String name;
  final String? description;
  final Map<String, dynamic> attributes;

  Location({
    required this.id,
    required this.name,
    this.description,
    required this.attributes,
  });

  factory Location.fromJson(Map<String, dynamic> json) {
    return Location(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unnamed Location',
      description: json['description'],
      attributes: json['attributes'] ?? {},
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'attributes': attributes,
    };
  }
}