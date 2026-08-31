import { useState, useEffect, useRef } from 'react';
import './SceneEditor.css';

function SceneEditor({ scene, chapter, book, onSave, onBack, isLoading, error, hasConflict = false }) {
  const [content, setContent] = useState(scene.content);
  const lastSyncedExternalContent = useRef(scene.content);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setContent(scene.content);
    lastSyncedExternalContent.current = scene.content;
  }, [scene.id]);

  useEffect(() => {
    // The scene prop can be replaced with an updated version of the SAME
    // scene (same id, different content) after a background sync merges in
    // a remote edit while this scene is already open. Only adopt the new
    // content if the textarea still shows exactly what was last loaded --
    // otherwise the user has an unsaved edit in progress, and silently
    // overwriting it here would be its own data-loss bug.
    if (scene.content === lastSyncedExternalContent.current) return;
    setContent(currentContent => {
      if (currentContent !== lastSyncedExternalContent.current) return currentContent;
      lastSyncedExternalContent.current = scene.content;
      return scene.content;
    });
  }, [scene.content]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(content);
      lastSyncedExternalContent.current = content;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="scene-editor">
      <header className="editor-header">
        <button onClick={onBack} className="btn-back" disabled={isSaving}>
          ← Back
        </button>
        <div className="editor-title">
          <h1>{scene.title}</h1>
          <span className="chapter-info">{chapter.title}</span>
        </div>
        <button
          onClick={handleSave}
          className="btn-save"
          disabled={isSaving || isLoading}
        >
          {isSaving ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="spinner-small"></div>
              Saving...
            </span>
          ) : (
            'Save'
          )}
        </button>
      </header>

      <div className="editor-content">
        {error && <div className="error-message">{error}</div>}
        {saveSuccess && <div className="success-message">Saved successfully!</div>}
        {hasConflict && (
          <div className="conflict-notice">
            This scene has a merge conflict — resolve the &lt;&lt;&lt;&lt;&lt;&lt;&lt; markers below and save.
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing your scene..."
          className="scene-textarea"
          disabled={isSaving}
        />

        <div className="editor-footer">
          <span className="word-count">
            {content.split(/\s+/).filter(w => w.length > 0).length} words
          </span>
        </div>
      </div>
    </div>
  );
}

export default SceneEditor;
