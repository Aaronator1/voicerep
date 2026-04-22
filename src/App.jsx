import { useState, useCallback, useEffect, useRef } from 'react';
import useRecorder from './hooks/useRecorder';
import {
  getOrCreateSession,
  saveTake,
  getTakesForSession,
  getPrompts,
  savePrompts,
} from './db';
import SessionHistory from './components/SessionHistory';
import PromptEditor from './components/PromptEditor';
import './App.css';

export default function App() {
  // Prompt list (single source of truth — fully editable)
  const [prompts, setPrompts] = useState([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptsLoaded, setPromptsLoaded] = useState(false);

  // Session & takes (persisted)
  const [currentSession, setCurrentSession] = useState(null);
  const [takes, setTakes] = useState([]);
  const [playingTakeId, setPlayingTakeId] = useState(null);

  // UI panels
  const [showHistory, setShowHistory] = useState(false);
  const [editorState, setEditorState] = useState(null); // null | { mode: 'add' | 'edit', index?: number }

  // Scroll the active pill into view
  const pillsRef = useRef(null);

  // Load prompts on mount
  useEffect(() => {
    (async () => {
      const loaded = await getPrompts();
      setPrompts(loaded);
      setPromptsLoaded(true);
    })();
  }, []);

  // Create/load session when prompt changes
  useEffect(() => {
    if (!promptsLoaded || prompts.length === 0) return;
    (async () => {
      const promptText = prompts[promptIndex];
      if (!promptText) return;
      const session = await getOrCreateSession(promptText);
      setCurrentSession(session);
      const sessionTakes = await getTakesForSession(session.id);
      setTakes(sessionTakes);
    })();
  }, [promptIndex, prompts, promptsLoaded]);

  // Keep active pill scrolled into view as index changes
  useEffect(() => {
    if (!pillsRef.current) return;
    const active = pillsRef.current.querySelector('.pill.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [promptIndex]);

  const handleRecordingComplete = useCallback(
    async (blob, durationMs) => {
      if (!currentSession) return;

      const num = takes.length + 1;
      await saveTake(currentSession.id, num, blob, durationMs);

      const sessionTakes = await getTakesForSession(currentSession.id);
      setTakes(sessionTakes);
    },
    [currentSession, takes.length]
  );

  const { isRecording, error, startRecording, stopRecording } = useRecorder({
    onRecordingComplete: handleRecordingComplete,
    autoPlayback: true,
  });

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handlePlayTake = (take) => {
    if (!take.audio) return;
    const url = URL.createObjectURL(take.audio);
    const audio = new Audio(url);
    setPlayingTakeId(take.id);
    audio.onended = () => {
      setPlayingTakeId(null);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => setPlayingTakeId(null));
  };

  /* ── Navigation ── */
  const goTo = (i) => {
    if (prompts.length === 0) return;
    const clamped = Math.max(0, Math.min(prompts.length - 1, i));
    setPromptIndex(clamped);
  };
  const handleFirst = () => goTo(0);
  const handleLast = () => goTo(prompts.length - 1);
  const handlePrev = () => goTo(promptIndex === 0 ? prompts.length - 1 : promptIndex - 1);
  const handleNext = () => goTo(promptIndex === prompts.length - 1 ? 0 : promptIndex + 1);

  /* ── CRUD ── */
  const openAdd = () => setEditorState({ mode: 'add' });
  const openEdit = () => setEditorState({ mode: 'edit', index: promptIndex });
  const closeEditor = () => setEditorState(null);

  const handleSavePrompt = async (text) => {
    if (!editorState) return;
    let next;
    let nextIndex = promptIndex;

    if (editorState.mode === 'add') {
      next = [...prompts, text];
      nextIndex = next.length - 1;
    } else {
      // edit
      const idx = editorState.index;
      next = prompts.map((p, i) => (i === idx ? text : p));
      nextIndex = idx;
    }

    setPrompts(next);
    setPromptIndex(nextIndex);
    await savePrompts(next);
    setEditorState(null);
  };

  const handleDeletePrompt = async () => {
    if (prompts.length <= 1) return; // guardrail: keep at least one
    const confirmMsg =
      'Delete this prompt?\n\nYour recorded takes will stay in Session History — only this prompt is removed from the list.';
    if (!window.confirm(confirmMsg)) return;

    const next = prompts.filter((_, i) => i !== promptIndex);
    const nextIndex = Math.min(promptIndex, next.length - 1);
    setPrompts(next);
    setPromptIndex(nextIndex);
    await savePrompts(next);
  };

  const formatDuration = (ms) => {
    const s = Math.round(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
  };

  const currentPrompt = prompts[promptIndex] ?? '';
  const atFirst = promptIndex === 0;
  const atLast = promptIndex === prompts.length - 1;
  const onlyOne = prompts.length <= 1;

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">VoiceRep</h1>
        <div className="header-actions">
          <button
            className="btn-header"
            onClick={openAdd}
            disabled={isRecording}
          >
            + Prompt
          </button>
          <button
            className="btn-header"
            onClick={() => setShowHistory(true)}
            disabled={isRecording}
          >
            History
          </button>
        </div>
      </header>

      {/* Prompt card — text to read */}
      <div className="prompt-container">
        <p className="prompt-text">{currentPrompt}</p>

        {/* Inline actions (edit / delete current prompt) */}
        <div className="prompt-actions">
          <button
            className="btn-action"
            onClick={openEdit}
            disabled={isRecording || prompts.length === 0}
            aria-label="Edit current prompt"
          >
            Edit
          </button>
          <button
            className="btn-action btn-action-danger"
            onClick={handleDeletePrompt}
            disabled={isRecording || onlyOne}
            aria-label="Delete current prompt"
            title={onlyOne ? 'Keep at least one prompt' : 'Delete this prompt'}
          >
            Delete
          </button>
        </div>

        {/* Jump nav: First / Prev / pills / Next / Last */}
        <div className="prompt-nav">
          <button
            className="btn-nav"
            onClick={handleFirst}
            disabled={isRecording || atFirst}
            aria-label="Jump to first prompt"
            title="First"
          >
            «
          </button>
          <button
            className="btn-nav"
            onClick={handlePrev}
            disabled={isRecording}
            aria-label="Previous prompt"
          >
            ‹ Prev
          </button>
          <span className="prompt-counter">
            {prompts.length === 0 ? '0 / 0' : `${promptIndex + 1} / ${prompts.length}`}
          </span>
          <button
            className="btn-nav"
            onClick={handleNext}
            disabled={isRecording}
            aria-label="Next prompt"
          >
            Next ›
          </button>
          <button
            className="btn-nav"
            onClick={handleLast}
            disabled={isRecording || atLast}
            aria-label="Jump to last prompt"
            title="Last"
          >
            »
          </button>
        </div>

        {/* Pill strip — click any to jump directly */}
        {prompts.length > 1 && (
          <div className="pill-strip" ref={pillsRef}>
            {prompts.map((_, i) => (
              <button
                key={i}
                className={`pill ${i === promptIndex ? 'active' : ''}`}
                onClick={() => goTo(i)}
                disabled={isRecording}
                aria-label={`Jump to prompt ${i + 1}`}
                aria-current={i === promptIndex ? 'true' : 'false'}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Single record/stop button — two-tap loop */}
      <div className="record-area">
        <button
          className={`btn-record ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordToggle}
          disabled={prompts.length === 0}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>
        {isRecording && <p className="recording-indicator">Recording</p>}
      </div>

      {error && <p className="error">{error}</p>}

      {/* Take list for current session */}
      {takes.length > 0 && (
        <div className="takes">
          <h2 className="takes-heading">
            Takes{currentSession ? ` — ${new Date().toLocaleDateString()}` : ''}
          </h2>
          <div className="take-list">
            {takes
              .slice()
              .reverse()
              .map((take) => (
                <div key={take.id} className="take-item">
                  <div className="take-info">
                    <span className="take-num">Take {take.num}</span>
                    <span className="take-meta">
                      {formatDuration(take.durationMs)} &middot; {take.sizeKB} KB
                    </span>
                  </div>
                  <button
                    className="btn-play"
                    onClick={() => handlePlayTake(take)}
                    disabled={playingTakeId === take.id}
                  >
                    {playingTakeId === take.id ? 'Playing...' : 'Play'}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Panels */}
      {showHistory && <SessionHistory onClose={() => setShowHistory(false)} />}
      {editorState && (
        <PromptEditor
          mode={editorState.mode}
          initialText={
            editorState.mode === 'edit' ? prompts[editorState.index] ?? '' : ''
          }
          onSave={handleSavePrompt}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
