import { useState, useEffect } from 'react';
import './SceneEditor.css';

function SceneEditor({ scene, chapter, book, onSave, onBack, isLoading, error }) {
  const [content, setContent] = useState(scene.content);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setContent(scene.content);
  }, [scene.id]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(content);
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
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <div className="editor-content">
        {error && <div className="error-message">{error}</div>}
        {saveSuccess && <div className="success-message">Saved successfully!</div>}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing your scene..."
          className="scene-textarea"
          disabled={isSaving}
        />

        <div className="editor-footer">
          <span className="word-count">
            {content.split(/\s+/).filter(w => w.length > 0).length} words •{' '}
            {content.length} characters
          </span>
        </div>
      </div>
    </div>
  );
}

export default SceneEditor;
