/**
 * Browser-compatible collaboration service for book writing
 * Provides safe, conflict-aware synchronization without Node.js dependencies
 */

export class BrowserCollaborationService {
  constructor() {
    this.conflicts = [];
  }

  /**
   * Detect conflicts between local and remote content
   * @param {Object} localContent - Local book data
   * @param {Object} remoteContent - Remote book data
   * @returns {Promise<Array>} - Array of conflict objects
   */
  async detectConflicts(localContent, remoteContent) {
    const conflicts = [];

    // Check title conflicts
    if (
      localContent.title &&
      remoteContent.title &&
      localContent.title !== remoteContent.title
    ) {
      conflicts.push({
        type: 'title',
        localContent: localContent.title,
        remoteContent: remoteContent.title
      });
    }

    // Check scene content conflicts
    if (localContent.scenes && remoteContent.scenes) {
      for (const localScene of localContent.scenes) {
        const remoteScene = remoteContent.scenes.find(
          s => s.id === localScene.id
        );

        if (remoteScene && localScene.content !== remoteScene.content) {
          conflicts.push({
            type: 'scene_content',
            sceneId: localScene.id,
            localContent: localScene.content,
            remoteContent: remoteScene.content
          });
        }
      }
    }

    // Check character conflicts
    if (localContent.characters && remoteContent.characters) {
      for (const localChar of localContent.characters) {
        const remoteChar = remoteContent.characters.find(
          c => c.id === localChar.id
        );

        if (remoteChar) {
          // Check each field for conflicts
          ['name', 'description', 'notes'].forEach(field => {
            if (
              localChar[field] &&
              remoteChar[field] &&
              localChar[field] !== remoteChar[field]
            ) {
              conflicts.push({
                type: 'character',
                characterId: localChar.id,
                field,
                localContent: localChar[field],
                remoteContent: remoteChar[field]
              });
            }
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Merge content from local and remote sources
   * @param {Object} baseContent - Common ancestor content (the last known shared state)
   * @param {Object} remoteContent - Remote changes (what's in GitHub)
   * @param {Object} localContent - Local changes (what we're trying to push)
   * @returns {Promise<Object>} - Merge result with conflicts if any
   */
  async mergeContent(baseContent, remoteContent, localContent) {
    const conflicts = [];
    const merged = JSON.parse(JSON.stringify(baseContent)); // Start with base

    // Merge simple string fields
    this.mergeSimpleField(
      'title',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeSimpleField(
      'author',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );

    // Merge array fields with IDs (scenes, characters, chapters, etc.)
    this.mergeArrayWithIds(
      'scenes',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'characters',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'chapters',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'parts',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'locations',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'backgroundFolders',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeArrayWithIds(
      'frontMatter',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );

    // Merge simple arrays (like blacklists)
    this.mergeSimpleArray(
      'characterDetectionBlacklist',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );

    // Merge complex nested objects
    this.mergeObject(
      'template',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeObject(
      'github',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeObject(
      'metadata',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );
    this.mergeObject(
      'collaboration',
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );

    // Handle any remaining fields not explicitly handled above
    this.mergeRemainingFields(
      baseContent,
      localContent,
      remoteContent,
      merged,
      conflicts
    );

    return {
      content: merged,
      hasConflicts: conflicts.length > 0,
      conflicts
    };
  }

  mergeSimpleField(
    fieldName,
    baseContent,
    localContent,
    remoteContent,
    merged,
    conflicts
  ) {
    const baseValue = baseContent[fieldName];
    const localValue = localContent[fieldName];
    const remoteValue = remoteContent[fieldName];

    // Use JSON.stringify for deep equality comparison (handles arrays/objects)
    const localStr = JSON.stringify(localValue);
    const remoteStr = JSON.stringify(remoteValue);
    const baseStr = JSON.stringify(baseValue);

    // 3-way merge logic
    if (localStr === remoteStr) {
      // Both sides agree - use this value
      merged[fieldName] = localValue;
    } else if (localStr === baseStr) {
      // Local unchanged, remote changed - use remote
      merged[fieldName] = remoteValue;
    } else if (remoteStr === baseStr) {
      // Remote unchanged, local changed - use local
      merged[fieldName] = localValue;
    } else {
      // Both changed differently - conflict
      conflicts.push({
        type: fieldName,
        localContent: localValue,
        remoteContent: remoteValue,
        baseContent: baseValue
      });
      // Default to remote value (newer) for auto-merge
      merged[fieldName] = remoteValue;
    }
  }

  mergeArrayWithIds(
    fieldName,
    baseContent,
    localContent,
    remoteContent,
    merged,
    conflicts
  ) {
    const baseArray = baseContent[fieldName] || [];
    const localArray = localContent[fieldName] || [];
    const remoteArray = remoteContent[fieldName] || [];

    // Create a map of all unique IDs from all three versions
    const allIds = new Set([
      ...baseArray.map(item => item.id),
      ...localArray.map(item => item.id),
      ...remoteArray.map(item => item.id)
    ]);

    merged[fieldName] = [];

    for (const id of allIds) {
      const baseItem = baseArray.find(item => item.id === id);
      const localItem = localArray.find(item => item.id === id);
      const remoteItem = remoteArray.find(item => item.id === id);

      if (localItem && remoteItem) {
        // Both local and remote have the item
        if (JSON.stringify(localItem) === JSON.stringify(remoteItem)) {
          // Identical - use either
          merged[fieldName].push({ ...localItem });
        } else if (
          baseItem &&
          JSON.stringify(localItem) === JSON.stringify(baseItem)
        ) {
          // Local unchanged, remote changed - use remote
          merged[fieldName].push({ ...remoteItem });
        } else if (
          baseItem &&
          JSON.stringify(remoteItem) === JSON.stringify(baseItem)
        ) {
          // Remote unchanged, local changed - use local
          merged[fieldName].push({ ...localItem });
        } else {
          // Both changed - check for conflicts in fields
          const itemConflicts = this.compareObjectsThreeWay(
            baseItem || {},
            localItem,
            remoteItem,
            `${fieldName}_${id}`
          );
          if (itemConflicts.length > 0) {
            conflicts.push(...itemConflicts);
          }
          // Merge the item fields
          const mergedItem = this.mergeItemFields(
            baseItem || {},
            localItem,
            remoteItem
          );
          merged[fieldName].push(mergedItem);
        }
      } else if (localItem && !remoteItem) {
        // Item in local but not remote
        if (baseItem) {
          // Was in base, remote deleted it, local kept/modified it - conflict
          conflicts.push({
            type: `${fieldName}_deleted`,
            id,
            localContent: localItem,
            remoteContent: null,
            baseContent: baseItem
          });
          // Keep the local version
          merged[fieldName].push({ ...localItem });
        } else {
          // Not in base, local added it - keep local addition
          merged[fieldName].push({ ...localItem });
        }
      } else if (remoteItem && !localItem) {
        // Item in remote but not local
        if (baseItem) {
          // Was in base, local deleted it, remote kept/modified it - conflict
          conflicts.push({
            type: `${fieldName}_deleted`,
            id,
            localContent: null,
            remoteContent: remoteItem,
            baseContent: baseItem
          });
          // Keep the remote version (newer)
          merged[fieldName].push({ ...remoteItem });
        } else {
          // Not in base, remote added it - keep remote addition
          merged[fieldName].push({ ...remoteItem });
        }
      }
    }
  }

  mergeSimpleArray(
    fieldName,
    baseContent,
    localContent,
    remoteContent,
    merged,
    conflicts
  ) {
    const baseArray = baseContent[fieldName] || [];
    const localArray = localContent[fieldName] || [];
    const remoteArray = remoteContent[fieldName] || [];

    // For simple arrays like blacklists, merge as sets (union of all additions)
    const baseSet = new Set(baseArray);
    const localSet = new Set(localArray);
    const remoteSet = new Set(remoteArray);

    // Items added in local
    const localAdded = localArray.filter(item => !baseSet.has(item));
    // Items added in remote
    const remoteAdded = remoteArray.filter(item => !baseSet.has(item));
    // Items removed in local
    const localRemoved = baseArray.filter(item => !localSet.has(item));
    // Items removed in remote
    const remoteRemoved = baseArray.filter(item => !remoteSet.has(item));

    // Start with base, apply non-conflicting changes
    const mergedSet = new Set(baseArray);

    // Add items added by either side
    localAdded.forEach(item => mergedSet.add(item));
    remoteAdded.forEach(item => mergedSet.add(item));

    // Remove items removed by either side (unless the other side modified it)
    localRemoved.forEach(item => {
      if (!remoteAdded.includes(item)) {
        mergedSet.delete(item);
      }
    });
    remoteRemoved.forEach(item => {
      if (!localAdded.includes(item)) {
        mergedSet.delete(item);
      }
    });

    merged[fieldName] = Array.from(mergedSet);

    // Only report conflicts if there are actual contradictions
    // (e.g., local added X while remote removed X, or vice versa)
    const contradictions = [];
    localAdded.forEach(item => {
      if (remoteRemoved.includes(item)) {
        contradictions.push({
          item,
          localAction: 'added',
          remoteAction: 'removed'
        });
      }
    });
    remoteAdded.forEach(item => {
      if (localRemoved.includes(item)) {
        contradictions.push({
          item,
          localAction: 'removed',
          remoteAction: 'added'
        });
      }
    });

    if (contradictions.length > 0) {
      conflicts.push({
        type: `${fieldName}_array`,
        contradictions
      });
    }
  }

  mergeObject(
    fieldName,
    baseContent,
    localContent,
    remoteContent,
    merged,
    conflicts
  ) {
    const baseObj = baseContent[fieldName] || {};
    const localObj = localContent[fieldName] || {};
    const remoteObj = remoteContent[fieldName] || {};

    // Start with base object
    merged[fieldName] = JSON.parse(JSON.stringify(baseObj));

    // Get all keys from all three versions
    const allKeys = new Set([
      ...Object.keys(baseObj),
      ...Object.keys(localObj),
      ...Object.keys(remoteObj)
    ]);

    for (const key of allKeys) {
      const baseValue = baseObj[key];
      const localValue = localObj[key];
      const remoteValue = remoteObj[key];

      // 3-way merge for each field
      if (
        typeof localValue === 'object' &&
        typeof remoteValue === 'object' &&
        localValue !== null &&
        remoteValue !== null
      ) {
        // Both are objects - recursive merge
        const subConflicts = this.compareObjectsThreeWay(
          baseValue || {},
          localValue,
          remoteValue,
          `${fieldName}.${key}`
        );
        if (subConflicts.length > 0) {
          conflicts.push(...subConflicts);
        }
        // Merge the sub-objects
        merged[fieldName][key] = this.mergeObjectFields(
          baseValue || {},
          localValue,
          remoteValue
        );
      } else if (localValue === remoteValue) {
        // Both agree
        merged[fieldName][key] = localValue;
      } else if (localValue === baseValue) {
        // Local unchanged, remote changed
        merged[fieldName][key] = remoteValue;
      } else if (remoteValue === baseValue) {
        // Remote unchanged, local changed
        merged[fieldName][key] = localValue;
      } else {
        // Both changed differently - conflict
        conflicts.push({
          type: `${fieldName}.${key}`,
          localContent: localValue,
          remoteContent: remoteValue,
          baseContent: baseValue
        });
        // Default to remote value (newer)
        merged[fieldName][key] = remoteValue;
      }
    }
  }

  compareObjects(localObj, remoteObj, prefix) {
    const conflicts = [];
    const allKeys = new Set([
      ...Object.keys(localObj),
      ...Object.keys(remoteObj)
    ]);

    for (const key of allKeys) {
      const localValue = localObj[key];
      const remoteValue = remoteObj[key];

      if (
        typeof localValue === 'object' &&
        typeof remoteValue === 'object' &&
        localValue !== null &&
        remoteValue !== null
      ) {
        // Recursive comparison for nested objects
        const subConflicts = this.compareObjects(
          localValue,
          remoteValue,
          `${prefix}.${key}`
        );
        conflicts.push(...subConflicts);
      } else if (localValue !== remoteValue) {
        if (localValue !== undefined && remoteValue !== undefined) {
          conflicts.push({
            type: `${prefix}.${key}`,
            localContent: localValue,
            remoteContent: remoteValue
          });
        }
      }
    }

    return conflicts;
  }

  mergeRemainingFields(
    baseContent,
    localContent,
    remoteContent,
    merged,
    conflicts
  ) {
    const handledFields = new Set([
      'title',
      'author',
      'scenes',
      'characters',
      'chapters',
      'parts',
      'locations',
      'backgroundFolders',
      'frontMatter',
      'characterDetectionBlacklist',
      'template',
      'github',
      'metadata',
      'collaboration'
    ]);

    const allKeys = new Set([
      ...Object.keys(baseContent),
      ...Object.keys(localContent),
      ...Object.keys(remoteContent)
    ]);

    for (const key of allKeys) {
      if (!handledFields.has(key)) {
        // Handle unknown fields with simple merge
        this.mergeSimpleField(
          key,
          baseContent,
          localContent,
          remoteContent,
          merged,
          conflicts
        );
      }
    }
  }

  /**
   * 3-way comparison of objects
   */
  compareObjectsThreeWay(baseObj, localObj, remoteObj, prefix) {
    const conflicts = [];
    const allKeys = new Set([
      ...Object.keys(baseObj),
      ...Object.keys(localObj),
      ...Object.keys(remoteObj)
    ]);

    for (const key of allKeys) {
      const baseValue = baseObj[key];
      const localValue = localObj[key];
      const remoteValue = remoteObj[key];

      // Handle arrays with IDs by comparing items by ID, not position
      if (
        Array.isArray(localValue) &&
        Array.isArray(remoteValue) &&
        (localValue.length > 0 || remoteValue.length > 0) &&
        (localValue[0]?.id || remoteValue[0]?.id)
      ) {
        const baseArray = Array.isArray(baseValue) ? baseValue : [];
        const safeBase = baseArray.filter(item => item && item.id);
        const safeLocal = localValue.filter(item => item && item.id);
        const safeRemote = remoteValue.filter(item => item && item.id);

        const allIds = new Set([
          ...safeBase.map(item => item.id),
          ...safeLocal.map(item => item.id),
          ...safeRemote.map(item => item.id)
        ]);

        // Compare each item by ID
        for (const id of allIds) {
          const baseItem = safeBase.find(item => item.id === id);
          const localItem = safeLocal.find(item => item.id === id);
          const remoteItem = safeRemote.find(item => item.id === id);

          if (localItem && remoteItem) {
            // Both have this item - check for conflicts in its fields
            const itemConflicts = this.compareObjectsThreeWay(
              baseItem || {},
              localItem,
              remoteItem,
              `${prefix}.${key}.${id}`
            );
            conflicts.push(...itemConflicts);
          }
          // Additions/deletions aren't conflicts, they're handled in merge
        }
        continue;
      }

      if (
        typeof localValue === 'object' &&
        typeof remoteValue === 'object' &&
        localValue !== null &&
        remoteValue !== null
      ) {
        // Recursive comparison for nested objects
        const subConflicts = this.compareObjectsThreeWay(
          baseValue || {},
          localValue,
          remoteValue,
          `${prefix}.${key}`
        );
        conflicts.push(...subConflicts);
      } else if (
        localValue !== remoteValue &&
        localValue !== baseValue &&
        remoteValue !== baseValue
      ) {
        // All three differ - conflict
        conflicts.push({
          type: `${prefix}.${key}`,
          localContent: localValue,
          remoteContent: remoteValue,
          baseContent: baseValue
        });
      }
    }

    return conflicts;
  }

  /**
   * Merge individual item fields using 3-way logic
   */
  mergeItemFields(baseItem, localItem, remoteItem) {
    const merged = { ...baseItem };
    const allKeys = new Set([
      ...Object.keys(baseItem),
      ...Object.keys(localItem),
      ...Object.keys(remoteItem)
    ]);

    for (const key of allKeys) {
      const baseValue = baseItem[key];
      const localValue = localItem[key];
      const remoteValue = remoteItem[key];

      // Handle arrays with IDs (like scenes within chapters)
      if (
        Array.isArray(localValue) &&
        Array.isArray(remoteValue) &&
        (localValue.length > 0 || remoteValue.length > 0) &&
        (localValue[0]?.id || remoteValue[0]?.id)
      ) {
        // This is an array of items with IDs - merge recursively
        const baseArray = Array.isArray(baseValue) ? baseValue : [];
        merged[key] = this.mergeNestedArrayWithIds(
          baseArray,
          localValue,
          remoteValue
        );
      } else if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
        merged[key] = localValue;
      } else if (JSON.stringify(localValue) === JSON.stringify(baseValue)) {
        merged[key] = remoteValue;
      } else if (JSON.stringify(remoteValue) === JSON.stringify(baseValue)) {
        merged[key] = localValue;
      } else {
        // Both changed - prefer remote (newer)
        merged[key] = remoteValue;
      }
    }

    return merged;
  }

  /**
   * Merge nested arrays with IDs (like scenes within chapters)
   */
  mergeNestedArrayWithIds(baseArray, localArray, remoteArray) {
    // Ensure arrays are valid
    const safeBase = Array.isArray(baseArray) ? baseArray : [];
    const safeLocal = Array.isArray(localArray) ? localArray : [];
    const safeRemote = Array.isArray(remoteArray) ? remoteArray : [];

    const allIds = new Set([
      ...safeBase.filter(item => item && item.id).map(item => item.id),
      ...safeLocal.filter(item => item && item.id).map(item => item.id),
      ...safeRemote.filter(item => item && item.id).map(item => item.id)
    ]);

    const result = [];

    for (const id of allIds) {
      const baseItem = safeBase.find(item => item && item.id === id);
      const localItem = safeLocal.find(item => item && item.id === id);
      const remoteItem = safeRemote.find(item => item && item.id === id);

      if (localItem && remoteItem) {
        // Both have it
        if (JSON.stringify(localItem) === JSON.stringify(remoteItem)) {
          result.push({ ...localItem });
        } else if (
          baseItem &&
          JSON.stringify(localItem) === JSON.stringify(baseItem)
        ) {
          // Local unchanged, remote changed
          result.push({ ...remoteItem });
        } else if (
          baseItem &&
          JSON.stringify(remoteItem) === JSON.stringify(baseItem)
        ) {
          // Remote unchanged, local changed
          result.push({ ...localItem });
        } else {
          // Both changed - merge fields recursively (but not infinitely)
          // Use simpler field-level merge without recursing back into arrays
          const mergedItem = { ...baseItem, ...remoteItem, ...localItem };

          // For each key, do proper 3-way merge
          for (const key of Object.keys({
            ...baseItem,
            ...localItem,
            ...remoteItem
          })) {
            const baseVal = baseItem?.[key];
            const localVal = localItem?.[key];
            const remoteVal = remoteItem?.[key];

            if (JSON.stringify(localVal) === JSON.stringify(remoteVal)) {
              mergedItem[key] = localVal;
            } else if (JSON.stringify(localVal) === JSON.stringify(baseVal)) {
              mergedItem[key] = remoteVal;
            } else if (JSON.stringify(remoteVal) === JSON.stringify(baseVal)) {
              mergedItem[key] = localVal;
            } else {
              // Both changed - prefer remote (newer)
              mergedItem[key] = remoteVal;
            }
          }

          result.push(mergedItem);
        }
      } else if (localItem) {
        // Only local has it (new addition in local)
        result.push({ ...localItem });
      } else if (remoteItem) {
        // Only remote has it (new addition in remote)
        result.push({ ...remoteItem });
      }
    }

    return result;
  }

  /**
   * Merge object fields using 3-way logic
   */
  mergeObjectFields(baseObj, localObj, remoteObj) {
    const merged = { ...baseObj };
    const allKeys = new Set([
      ...Object.keys(baseObj),
      ...Object.keys(localObj),
      ...Object.keys(remoteObj)
    ]);

    for (const key of allKeys) {
      const baseValue = baseObj[key];
      const localValue = localObj[key];
      const remoteValue = remoteObj[key];

      if (
        typeof localValue === 'object' &&
        typeof remoteValue === 'object' &&
        localValue !== null &&
        remoteValue !== null
      ) {
        // Recursive merge
        merged[key] = this.mergeObjectFields(
          baseValue || {},
          localValue,
          remoteValue
        );
      } else if (localValue === remoteValue) {
        merged[key] = localValue;
      } else if (localValue === baseValue) {
        merged[key] = remoteValue;
      } else if (remoteValue === baseValue) {
        merged[key] = localValue;
      } else {
        // Both changed - prefer remote (newer)
        merged[key] = remoteValue;
      }
    }

    return merged;
  }

  /**
   * Apply user resolutions to conflicts
   * @param {Array} resolutions - Array of conflict resolutions
   * @param {Object} baseContent - Base content to apply resolutions to
   * @param {Array} conflicts - Original conflicts array
   * @returns {Object} - Merged content with resolutions applied
   */
  applyResolutions(resolutions, baseContent, conflicts) {
    const result = JSON.parse(JSON.stringify(baseContent)); // Deep clone

    resolutions.forEach(resolution => {
      const conflict = conflicts[resolution.conflictIndex];
      const conflictType = conflict.type;

      // Handle legacy specific conflict types for backwards compatibility
      if (conflictType === 'scene_content') {
        if (result.scenes) {
          const scene = result.scenes.find(s => s.id === conflict.sceneId);
          if (scene) {
            scene.content = resolution.resolvedContent;
          }
        }
        return;
      }

      if (conflictType === 'character') {
        if (result.characters) {
          const character = result.characters.find(
            c => c.id === conflict.characterId
          );
          if (character) {
            character[conflict.field] = resolution.resolvedContent;
          }
        }
        return;
      }

      // Handle array-level conflicts (e.g., "backMatter_array", "illustrations_array")
      if (conflictType.endsWith('_array')) {
        const arrayName = conflictType.replace('_array', '');
        // For array contradictions, just use the resolved content
        result[arrayName] = resolution.resolvedContent;
        return;
      }

      // Handle deleted array items (e.g., "backMatter_deleted", "chapters_deleted")
      if (conflictType.endsWith('_deleted')) {
        const arrayName = conflictType.replace('_deleted', '');
        // User has chosen to keep or remove the item
        // If resolution is to keep it, it's already in the result
        // If resolution is to remove it, remove it
        if (
          resolution.resolution === 'remote' &&
          conflict.remoteContent === null
        ) {
          // Remote deleted it, user chose remote, so delete it
          if (result[arrayName]) {
            result[arrayName] = result[arrayName].filter(
              item => item.id !== conflict.id
            );
          }
        } else if (
          resolution.resolution === 'local' &&
          conflict.localContent === null
        ) {
          // Local deleted it, user chose local, so delete it
          if (result[arrayName]) {
            result[arrayName] = result[arrayName].filter(
              item => item.id !== conflict.id
            );
          }
        }
        return;
      }

      // Handle nested path conflicts (e.g., "metadata.modified", "template.pageSize")
      if (conflictType.includes('.')) {
        const path = conflictType.split('.');
        let current = result;
        // Navigate to parent object
        for (let i = 0; i < path.length - 1; i++) {
          if (!current[path[i]]) {
            current[path[i]] = {};
          }
          current = current[path[i]];
        }
        // Set the final value
        current[path[path.length - 1]] = resolution.resolvedContent;
        return;
      }

      // Handle simple field conflicts (title, author, etc.)
      result[conflictType] = resolution.resolvedContent;
    });

    return result;
  }

  /**
   * Create a simple commit-like record for tracking changes
   * @param {Object} bookData - The book data to "commit"
   * @param {string} message - Commit message
   * @returns {Promise<string>} - Commit hash (timestamp-based for browser)
   */
  async createCommit(_bookData, _message) {
    // In browser, we can't use real git, so create a simple timestamp-based hash
    const timestamp = Date.now();
    const hash = `browser-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    // In a real implementation, you might store this in localStorage or IndexedDB
    // For now, just return the hash
    return hash;
  }

  /**
   * Initialize repository (no-op in browser, but kept for API compatibility)
   * @returns {Promise<void>}
   */
  async initializeRepository() {
    // No-op in browser - no real git repository needed
    return Promise.resolve();
  }
}
