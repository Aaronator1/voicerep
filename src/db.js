import Dexie from 'dexie';

const db = new Dexie('VoiceRepDB');

db.version(1).stores({
  sessions: '++id, date, promptText',
  takes: '++id, sessionId, num, timestamp, durationMs, sizeKB',
});

export default db;

/**
 * Create a new session for today, or return the existing one for the given prompt.
 */
export async function getOrCreateSession(promptText) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Look for an existing session today with the same prompt
  const existing = await db.sessions
    .where('date')
    .equals(today)
    .filter((s) => s.promptText === promptText)
    .first();

  if (existing) return existing;

  const id = await db.sessions.add({
    date: today,
    promptText,
    createdAt: Date.now(),
  });

  return db.sessions.get(id);
}

/**
 * Save a take (audio blob + metadata) linked to a session.
 */
export async function saveTake(sessionId, num, blob, durationMs) {
  const id = await db.takes.add({
    sessionId,
    num,
    timestamp: Date.now(),
    durationMs,
    sizeKB: parseFloat((blob.size / 1024).toFixed(1)),
    audio: blob, // stored as Blob in IndexedDB
  });

  return db.takes.get(id);
}

/**
 * Get all takes for a session, ordered by num.
 */
export async function getTakesForSession(sessionId) {
  return db.takes.where('sessionId').equals(sessionId).sortBy('num');
}

/**
 * Get all sessions, newest first.
 */
export async function getAllSessions() {
  const sessions = await db.sessions.toArray();
  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a single take by ID.
 */
export async function deleteTake(takeId) {
  return db.takes.delete(takeId);
}

/**
 * Delete a session and all its takes.
 */
export async function deleteSession(sessionId) {
  await db.takes.where('sessionId').equals(sessionId).delete();
  return db.sessions.delete(sessionId);
}

/**
 * Get or create a custom prompt list stored in a special table.
 * We store custom prompts as a session with a sentinel date.
 */
export async function getCustomPrompts() {
  const stored = localStorage.getItem('voicerep_custom_prompts');
  return stored ? JSON.parse(stored) : [];
}

export async function saveCustomPrompts(prompts) {
  localStorage.setItem('voicerep_custom_prompts', JSON.stringify(prompts));
}
