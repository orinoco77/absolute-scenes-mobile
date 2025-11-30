/**
 * ConflictResolution Component
 * Mobile-friendly interface for resolving collaboration conflicts
 */

import { useState, useCallback } from 'react';
import './ConflictResolution.css';

function ConflictResolution({ conflicts, onResolve, onCancel }) {
  const [resolutions, setResolutions] = useState({});
  const [editingConflict, setEditingConflict] = useState(null);

  const handleResolutionChange = useCallback(
    (conflictIndex, resolution, content) => {
      setResolutions(prev => ({
        ...prev,
        [conflictIndex]: {
          resolution,
          resolvedContent: content
        }
      }));
    },
    []
  );

  const handleManualEdit = useCallback(
    (conflictIndex, content) => {
      handleResolutionChange(conflictIndex, 'manual', content);
    },
    [handleResolutionChange]
  );

  const handleResolveAll = useCallback(() => {
    if (!conflicts) return;
    const canResolve = conflicts.every((_, index) => resolutions[index]);
    if (!canResolve) return;

    const resolutionArray = conflicts.map((_, index) => ({
      conflictIndex: index,
      resolution: resolutions[index].resolution,
      resolvedContent: resolutions[index].resolvedContent
    }));

    onResolve(resolutionArray);
  }, [conflicts, resolutions, onResolve]);

  // Format conflict content for display
  const formatContent = useCallback(content => {
    if (content === null || content === undefined) {
      return '(deleted)';
    }
    if (typeof content === 'string') {
      return content || '(empty)';
    }
    if (typeof content === 'object') {
      return JSON.stringify(content, null, 2);
    }
    return String(content);
  }, []);

  // Get a user-friendly conflict title
  const getConflictTitle = useCallback(conflict => {
    if (conflict.type === 'scene_content') return 'Scene Content';
    if (conflict.type === 'title') return 'Book Title';
    if (conflict.type === 'character')
      return `Character ${conflict.field}`;
    if (conflict.type.endsWith('_deleted')) {
      const itemType = conflict.type.replace('_deleted', '');
      return `${itemType} Item Deleted`;
    }
    if (conflict.type.includes('.')) {
      return conflict.type;
    }
    // Capitalize first letter and add spaces before capitals
    const formatted = conflict.type
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
    return formatted;
  }, []);

  // Don't render if no conflicts
  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  const canResolve = conflicts.every((_, index) => resolutions[index]);

  const renderConflict = (conflict, index) => {
    const currentResolution = resolutions[index];
    const isTextConflict =
      typeof conflict.localContent === 'string' &&
      typeof conflict.remoteContent === 'string';
    const isEditing = editingConflict === index;

    return (
      <div key={index} className="conflict-item">
        <h3 className="conflict-title">
          Conflict {index + 1}: {getConflictTitle(conflict)}
        </h3>

        {!isEditing ? (
          <>
            <div className="conflict-versions">
              <div className="conflict-version local">
                <h4>Your Version (Local)</h4>
                <div className={`conflict-content ${isTextConflict ? 'text' : 'json'}`}>
                  {formatContent(conflict.localContent)}
                </div>
                <button
                  onClick={() =>
                    handleResolutionChange(index, 'local', conflict.localContent)
                  }
                  className={`btn-choice ${currentResolution?.resolution === 'local' ? 'selected' : ''}`}
                >
                  {currentResolution?.resolution === 'local' ? '✓ ' : ''}Use Your Version
                </button>
              </div>

              <div className="conflict-version remote">
                <h4>GitHub Version (Remote)</h4>
                <div className={`conflict-content ${isTextConflict ? 'text' : 'json'}`}>
                  {formatContent(conflict.remoteContent)}
                </div>
                <button
                  onClick={() =>
                    handleResolutionChange(index, 'remote', conflict.remoteContent)
                  }
                  className={`btn-choice ${currentResolution?.resolution === 'remote' ? 'selected' : ''}`}
                >
                  {currentResolution?.resolution === 'remote' ? '✓ ' : ''}Use GitHub Version
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                const defaultContent =
                  currentResolution?.resolvedContent || conflict.localContent;
                const editableContent =
                  typeof defaultContent === 'object'
                    ? JSON.stringify(defaultContent, null, 2)
                    : defaultContent;
                handleResolutionChange(index, 'manual', editableContent);
                setEditingConflict(index);
              }}
              className={`btn-manual ${currentResolution?.resolution === 'manual' ? 'selected' : ''}`}
            >
              {currentResolution?.resolution === 'manual' ? '✓ ' : ''}Edit Manually
            </button>
          </>
        ) : (
          <div className="manual-edit">
            <h4>Manual Edit</h4>
            <textarea
              value={
                typeof currentResolution.resolvedContent === 'string'
                  ? currentResolution.resolvedContent
                  : JSON.stringify(currentResolution.resolvedContent, null, 2)
              }
              onChange={e => {
                // Try to parse JSON if it looks like JSON, otherwise keep as string
                let value = e.target.value;
                if (
                  value.trim().startsWith('{') ||
                  value.trim().startsWith('[')
                ) {
                  try {
                    value = JSON.parse(value);
                  } catch {
                    // Keep as string if invalid JSON
                  }
                }
                handleManualEdit(index, value);
              }}
              className="manual-edit-textarea"
              spellCheck={false}
            />
            <button
              onClick={() => setEditingConflict(null)}
              className="btn-done"
            >
              Done Editing
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="conflict-resolution-overlay">
      <div className="conflict-resolution-container">
        <h2>Conflicts Detected</h2>
        <p className="conflict-description">
          The book was modified on GitHub while you were editing. Please resolve
          {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} to continue.
        </p>

        <div className="conflicts-list">
          {conflicts.map(renderConflict)}
        </div>

        <div className="conflict-actions">
          <button onClick={onCancel} className="btn-cancel">
            Cancel
          </button>
          <button
            onClick={handleResolveAll}
            disabled={!canResolve}
            className={`btn-resolve ${canResolve ? 'enabled' : 'disabled'}`}
          >
            {canResolve ? 'Resolve & Save' : `Resolve All Conflicts (${conflicts.filter((_, i) => !resolutions[i]).length} remaining)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolution;
