import { useState } from 'react';
import './PromptEditor.css';

/**
 * PromptEditor
 * Handles both Add and Edit flows for a prompt.
 *
 * Props:
 *  - initialText?: string   — prefills the textarea when editing; empty for add.
 *  - mode: 'add' | 'edit'   — controls heading/button labels.
 *  - onSave(text): called with the trimmed text when the user commits.
 *  - onClose(): called to dismiss the modal without saving.
 */
export default function PromptEditor({ initialText = '', mode = 'add', onSave, onClose }) {
  const [text, setText] = useState(initialText);

  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Prompt' : 'Add Custom Prompt';
  const saveLabel = isEdit ? 'Save Changes' : 'Add Prompt';
  const disabled = !text.trim() || (isEdit && text.trim() === initialText.trim());

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isEdit && trimmed === initialText.trim()) return;
    onSave(trimmed);
  }

  return (
    <div className="prompt-editor-overlay">
      <div className="prompt-editor-panel">
        <div className="prompt-editor-header">
          <h2>{title}</h2>
          <button className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="prompt-editor-hint">
          {isEdit
            ? 'Update the text you want to read.'
            : 'Paste or type a coaching passage from your coach.'}
        </p>
        <textarea
          className="prompt-editor-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter your coaching text here..."
          rows={6}
          autoFocus
        />
        <button
          className="btn-save-prompt"
          onClick={handleSave}
          disabled={disabled}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
