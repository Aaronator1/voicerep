import { useState, useEffect } from 'react';
import { getAllSessions, getTakesForSession, deleteTake, deleteSession } from '../db';
import './SessionHistory.css';

export default function SessionHistory({ onClose }) {
  const [sessions, setSessions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [takes, setTakes] = useState([]);
  const [playingTakeId, setPlayingTakeId] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    const all = await getAllSessions();
    setSessions(all);
  }

  async function handleToggleSession(session) {
    if (expandedId === session.id) {
      setExpandedId(null);
      setTakes([]);
      return;
    }
    setExpandedId(session.id);
    const sessionTakes = await getTakesForSession(session.id);
    setTakes(sessionTakes);
  }

  function handlePlayTake(take) {
    if (!take.audio) return;
    const url = URL.createObjectURL(take.audio);
    const audio = new Audio(url);
    setPlayingTakeId(take.id);
    audio.onended = () => {
      setPlayingTakeId(null);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => setPlayingTakeId(null));
  }

  async function handleDeleteTake(takeId) {
    await deleteTake(takeId);
    // Reload takes for expanded session
    if (expandedId) {
      const sessionTakes = await getTakesForSession(expandedId);
      setTakes(sessionTakes);
    }
    loadSessions();
  }

  async function handleDeleteSession(sessionId) {
    await deleteSession(sessionId);
    if (expandedId === sessionId) {
      setExpandedId(null);
      setTakes([]);
    }
    loadSessions();
  }

  function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function truncatePrompt(text, maxLen = 60) {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }

  return (
    <div className="history-overlay">
      <div className="history-panel">
        <div className="history-header">
          <h2>Session History</h2>
          <button className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>

        {sessions.length === 0 && (
          <p className="history-empty">No sessions yet. Record your first take!</p>
        )}

        <div className="session-list">
          {sessions.map((session) => (
            <div key={session.id} className="session-item">
              <div
                className="session-row"
                onClick={() => handleToggleSession(session)}
              >
                <div className="session-info">
                  <span className="session-date">{formatDate(session.date)}</span>
                  <span className="session-prompt">
                    {truncatePrompt(session.promptText)}
                  </span>
                </div>
                <div className="session-actions">
                  <span className="session-expand">
                    {expandedId === session.id ? '▾' : '▸'}
                  </span>
                </div>
              </div>

              {expandedId === session.id && (
                <div className="session-takes">
                  {takes.length === 0 && (
                    <p className="takes-empty">No takes in this session.</p>
                  )}
                  {takes.map((take) => (
                    <div key={take.id} className="history-take-item">
                      <div className="take-info">
                        <span className="take-num">Take {take.num}</span>
                        <span className="take-meta">
                          {formatDuration(take.durationMs)} &middot; {take.sizeKB} KB
                        </span>
                      </div>
                      <div className="take-actions">
                        <button
                          className="btn-play-sm"
                          onClick={() => handlePlayTake(take)}
                          disabled={playingTakeId === take.id}
                        >
                          {playingTakeId === take.id ? '...' : '▶'}
                        </button>
                        <button
                          className="btn-delete-sm"
                          onClick={() => handleDeleteTake(take.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn-delete-session"
                    onClick={() => handleDeleteSession(session.id)}
                  >
                    Delete Session
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
