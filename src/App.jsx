import { useState, useCallback } from 'react';
import useRecorder from './hooks/useRecorder';
import prompts from './data/prompts';
import './App.css';

export default function App() {
  const [promptIndex, setPromptIndex] = useState(0);
  const [takes, setTakes] = useState([]);
  const [playingTakeId, setPlayingTakeId] = useState(null);

  const handleRecordingComplete = useCallback((blob, durationMs) => {
    const url = URL.createObjectURL(blob);
    setTakes((prev) => [
      ...prev,
      {
        id: Date.now(),
        num: prev.length + 1,
        url,
        durationMs,
        sizeKB: (blob.size / 1024).toFixed(1),
      },
    ]);
  }, []);

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
    const audio = new Audio(take.url);
    setPlayingTakeId(take.id);
    audio.onended = () => setPlayingTakeId(null);
    audio.play().catch(() => setPlayingTakeId(null));
  };

  const handleNextPrompt = () => {
    setPromptIndex((i) => (i + 1) % prompts.length);
  };

  const handlePrevPrompt = () => {
    setPromptIndex((i) => (i - 1 + prompts.length) % prompts.length);
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
      </header>

      {/* Text prompt — visible throughout recording */}
      <div className="prompt-container">
        <p className="prompt-text">{prompts[promptIndex]}</p>
        <div className="prompt-nav">
          <button className="btn-nav" onClick={handlePrevPrompt} disabled={isRecording}>
            Prev
          </button>
          <span className="prompt-counter">
            {promptIndex + 1} / {prompts.length}
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

      {/* Take list — manual replay of any saved take */}
      {takes.length > 0 && (
        <div className="takes">
          <h2 className="takes-heading">Takes</h2>
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
    </div>
  );
}
