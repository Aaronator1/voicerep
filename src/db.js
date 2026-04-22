import Dexie from 'dexie';
import defaultPrompts from './data/prompts';

const db = new Dexie('VoiceRepDB');

db.version(1).stores({
  sessions: '++id, date, promptText',
  takes: '++id, sessionId, num, timestamp, durationMs, sizeKB',
});

export default db;

/**
 * Return the primary (oldest) session for a given prompt, creating one if none exist.
 * Sessions are keyed by promptText only — so takes accumulate across days.
 * Any pre-existing dated sessions for the same prompt are left intact (visible in
 * History, and their takes are still surfaced via getTakesForPrompt).
 */
export async function getOrCreateSession(promptText) {
  const matches = await db.sessions
    .where('promptText')
    .equals(promptText)
    .sortBy('createdAt');

  if (matches.length > 0) return matches[0];

  const today = new Date().toISOString().slice(0, 10);
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
    audio: blob,
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
 * Get every take ever recorded against a given prompt, across all sessions that
 * matched its text (handles historical dated sessions + the current one).
 * Sorted chronologically (oldest → newest).
 */
export async function getTakesForPrompt(promptText) {
  const sessions = await db.sessions
    .where('promptText')
    .equals(promptText)
    .toArray();

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const takes = await db.takes.where('sessionId').anyOf(sessionIds).toArray();
  return takes.sort((a, b) => a.timestamp - b.timestamp);
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

/* ───────── Prompts (unified list, fully CRUD) ───────── */

const PROMPTS_KEY = 'voicerep_prompts';
const LEGACY_CUSTOM_KEY = 'voicerep_custom_prompts';

/**
 * Get the full prompt list.
 * Seeds defaults on first load; also migrates any pre-existing custom prompts
 * from the legacy key so upgraders don't lose their entries.
 */
export async function getPrompts() {
  const stored = localStorage.getItem(PROMPTS_KEY);
  if (stored) {
    try {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {
      // fall through to re-seed
    }
  }

  // First load (or corrupted). Seed defaults, then append any legacy customs.
  const legacy = localStorage.getItem(LEGACY_CUSTOM_KEY);
  let legacyCustoms = [];
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) legacyCustoms = parsed;
    } catch {
      // ignore
    }
  }

  const seeded = [...defaultPrompts, ...legacyCustoms];
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(seeded));
  return seeded;
}

/**
 * Persist the full prompt list.
 */
export async function savePrompts(prompts) {
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts));
}
