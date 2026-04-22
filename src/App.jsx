import { useState, useCallback, useEffect, useRef } from 'react';
import useRecorder from './hooks/useRecorder';
import {
  getOrCreateSession,
  saveTake,
  getTakesForPrompt,
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

  // Playback state — lifted so play / pause / resume can target any take
  // (including auto-played takes right after recording).
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);

  // UI panels
  const [showHistory, setShowHistory] = useState(false);
  const [editorState, setEditorState] = useState(null); // null | { mode: 'add' | 'edit', index?: number }

  // Scroll the active pill into view
  const pillsRef = useRef(null);

  /* ── Playback helpers ── */
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlayingTakeId(null);
    setIsPaused(false);
  }, []);

  const playTake = useCallback(
    (take) => {
      if (!take?.audio) return;
      // Tear down anything currently playing.
      stopPlayback();

      const url = URL.createObjectURL(take.audio);
      const audio = new Audio(url);
      audioRef.current = audio;
      objectUrlRef.current = url;

      audio.onended = () => stopPlayback();
      setPlayingTakeId(take.id);
      setIsPaused(false);
      audio.play().catch(() => stopPlayback());
    },
    [stopPlayback]
  );

  const handleTakeButton = useCallback(
    (take) => {
      // Not the currently-loaded take → start fresh.
      if (playingTakeId !== take.id) {
        playTake(take);
        return;
      }
      // Same take → toggle pause/resume.
      const audio = audioRef.current;
      if (!audio) {
        playTake(take);
        return;
      }
      if (isPaused) {
        audio.play().catch(() => stopPlayback());
        setIsPaused(false);
      } else {
        audio.pause();
        setIsPaused(true);
      }
    },
    [playingTakeId, isPaused, playTake, stopPlayback]
  );

  /* ── Load prompts on mount ── */
  useEffect(() => {
    (async () => {
      const loaded = await getPrompts();
      setPrompts(loaded);
      setPromptsLoaded(true);
    })();
  }, []);

  /* ── Load session + takes when prompt changes (and stop any playback) ── */
  useEffect(() => {
    if (!promptsLoaded || prompts.length === 0) return;
    stopPlayback();
    (async () => {
      const promptText = prompts[promptIndex];
      if (!promptText) return;
      const session = await getOrCreateSession(promptText);
      setCurrentSession(session);
      const allTakes = await getTakesForPrompt(promptText);
      setTakes(allTakes);
    })();
  }, [promptIndex, prompts, promptsLoaded, stopPlayback]);

  /* ── Keep the active pill visible ── */
  useEffect(() => {
    if (!pillsRef.current) return;
    const active = pillsRef.current.querySelector('.pill.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [promptIndex]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const handleRecordingComplete = useCallback(
    async (blob, durationMs) => {
      if (!currentSession) return;
      const promptText = prompts[promptIndex];

      // Number within the session (existing behavior), based on that session's takes.
      const sessionTakeCount = takes.filter((t) => t.sessionId === currentSession.id).length;
      const num = sessionTakeCount + 1;

      const newTake = await saveTake(currentSession.id, num, blob, durationMs);

      // Refresh full list across all sessions for this prompt.
      const allTakes = await getTakesForPrompt(promptText);
      setTakes(allTakes);

      // Auto-play the new take via the tracked mechanism (so it can be paused).
      playTake(newTake);
    },
    [currentSession, prompts, promptIndex, takes, playTake]
  );

  const { isRecording, error, startRecording, stopRecording } = useRecorder({
    onRecordingComplete: handleRecordingComplete,
  });

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      // If audio is playing while the user hits record, stop it first.
      stopPlayback();
      startRecording();
    }
  };

  /* ── Navigation (pills only) ── */
  const goTo = (i) => {
    if (prompts.length === 0) return;
    const clamped = Math.max(0, Math.min(prompts.length - 1, i));
    setPromptIndex(clamped);
  };

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
  const onlyOne = prompts.length <= 1;

  // Chronological order (oldest → newest) = takes as loaded; display newest first.
  const takesNewestFirst = takes.slice().reverse();

  const takeButtonLabel = (takeId) => {
    if (playingTakeId !== takeId) return 'Play';
    return isPaused ? 'Resume' : 'Pause';
  };

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

        {/* Pill strip — one button per prompt */}
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

      {/* Take list — all takes across sessions for the current prompt */}
      {takesNewestFirst.length > 0 && (
        <div className="takes">
          <h2 className="takes-heading">Takes</h2>
          <div className="take-list">
            {takesNewestFirst.map((take, idx) => {
              // Display number = chronological position (1 = oldest).
              const displayNum = takes.length - idx;
              const label = takeButtonLabel(take.id);
              const isActive = playingTakeId === take.id;
              return (
                <div key={take.id} className="take-item">
                  <div className="take-info">
                    <span className="take-num">Take {displayNum}</span>
                    <span className="take-meta">
                      {formatDuration(take.durationMs)} &middot; {take.sizeKB} KB
                    </span>
                  </div>
                  <button
                    className={`btn-play ${isActive && !isPaused ? 'is-playing' : ''}`}
                    onClick={() => handleTakeButton(take)}
                  >
                    {label}
                  </button>
                </div>
              );
            })}
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
