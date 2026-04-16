import { useState } from 'react';
import './CustomPromptInput.css';

export default function CustomPromptInput({ onSave, onClose }) {
  const [text, setText] = useState('');

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setText('');
  }

  return (
    <div className="custom-prompt-overlay">
      <div className="custom-prompt-panel">
        <div className="custom-prompt-header">
          <h2>Add Custom Prompt</h2>
          <button className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="custom-prompt-hint">
          Paste or type a coaching passage from your coach.
        </p>
        <textarea
          className="custom-prompt-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter your coaching text here..."
          rows={6}
          autoFocus
        />
        <button
          className="btn-save-prompt"
          onClick={handleSave}
          disabled={!text.trim()}
        >
          Add Prompt
        </button>
      </div>
    </div>
  );
}
