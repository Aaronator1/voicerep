import { useState, useCallback, useEffect } from 'react';
import useRecorder from './hooks/useRecorder';
import defaultPrompts from './data/prompts';
import {
  getOrCreateSession,
  saveTake,
  getTakesForSession,
  getCustomPrompts,
  saveCustomPrompts,
} from './db';
import SessionHistory from './components/SessionHistory';
import CustomPromptInput from './components/CustomPromptInput';
import './App.css';

export default function App() {
  // Prompts (default + custom)
  const [allPrompts, setAllPrompts] = useState(defaultPrompts);
  const [promptIndex, setPromptIndex] = useState(0);

  // Session & takes (persisted)
  const [currentSession, setCurrentSession] = useState(null);
  const [takes, setTakes] = useState([]);
  const [playingTakeId, setPlayingTakeId] = useState(null);

  // UI panels
  const [showHistory, setShowHistory] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Load custom prompts on mount
  useEffect(() => {
    (async () => {
      const custom = await getCustomPrompts();
      if (custom.length > 0) {
        setAllPrompts([...defaultPrompts, ...custom]);
      }
    })();
  }, []);

  // Create/load session when prompt changes
  useEffect(() => {
    (async () => {
      const promptText = allPrompts[promptIndex];
      if (!promptText) return;
      const session = await getOrCreateSession(promptText);
      setCurrentSession(session);
      const sessionTakes = await getTakesForSession(session.id);
      setTakes(sessionTakes);
    })();
  }, [promptIndex, allPrompts]);

  const handleRecordingComplete = useCallback(
    async (blob, durationMs) => {
      if (!currentSession) return;

      const num = takes.length + 1;
      await saveTake(currentSession.id, num, blob, durationMs);

      // Reload takes from DB to stay in sync
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

  const handleNextPrompt = () => {
    setPromptIndex((i) => (i + 1) % allPrompts.length);
  };

  const handlePrevPrompt = () => {
    setPromptIndex((i) => (i - 1 + allPrompts.length) % allPrompts.length);
  };

  const handleAddCustomPrompt = async (text) => {
    const custom = await getCustomPrompts();
    const updated = [...custom, text];
    await saveCustomPrompts(updated);
    const newAll = [...defaultPrompts, ...updated];
    setAllPrompts(newAll);
    setPromptIndex(newAll.length - 1);
    setShowCustomInput(false);
  };

  const formatDuration = (ms) => {
    const s = Math.round(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">VoiceRep</h1>
        <div className="header-actions">
          <button
            className="btn-header"
            onClick={() => setShowCustomInput(true)}
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

      {/* Text prompt — visible throughout recording */}
      <div className="prompt-container">
        <p className="prompt-text">{allPrompts[promptIndex]}</p>
        <div className="prompt-nav">
          <button className="btn-nav" onClick={handlePrevPrompt} disabled={isRecording}>
            Prev
          </button>
          <span className="prompt-counter">
            {promptIndex + 1} / {allPrompts.length}
          </span>
          <button className="btn-nav" onClick={handleNextPrompt} disabled={isRecording}>
            Next
          </button>
        </div>
      </div>

      {/* Single record/stop button — two-tap loop */}
      <div className="record-area">
        <button
          className={`btn-record ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordToggle}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>
        {isRecording && <p className="recording-indicator">Recording</p>}
      </div>

      {/* Error display */}
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
      {showCustomInput && (
        <CustomPromptInput
          onSave={handleAddCustomPrompt}
          onClose={() => setShowCustomInput(false)}
        />
      )}
    </div>
  );
}
