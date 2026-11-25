/* ════════════════════════════════════════════
   memory.js — local, on-device memory core
   ════════════════════════════════════════════ */

const KEY = 'stonic.memory.v1';

let items = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-200)));
  } catch (err) {
    console.warn('[stonic] memory write failed', err);
  }
}

const uid = () => Math.random().toString(36).slice(2, 9);

export function listMemories() {
  return [...items].sort((a, b) => b.ts - a.ts);
}

export function addMemory(text, kind = 'note') {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const dupe = items.find((m) => m.text.toLowerCase() === clean.toLowerCase());
  if (dupe) return dupe;
  const entry = { id: uid(), text: clean, kind, ts: Date.now() };
  items.push(entry);
  persist();
  return entry;
}

export function removeMemory(id) {
  items = items.filter((m) => m.id !== id);
  persist();
}

export function wipeMemories() {
  items = [];
  persist();
}

const STOP = new Set([
  'the','a','an','is','are','was','were','my','me','i','you','your','and','or','to','of','in','on','for',
  'what','who','how','why','do','does','did','can','could','tell','about','that','this','it','be','with',
  'kya','hai','mujhe','mera','meri','batao','kaise','karo',
]);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Rank memories against a query — returns matching texts, best first. */
export function searchMemories(query) {
  const q = tokens(query);
  if (!q.length) return [];
  const scored = items.map((m) => {
    const text = m.text.toLowerCase();
    let score = 0;
    for (const w of q) if (text.includes(w)) score += w.length;
    return { text: m.text, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.text);
}

/** Pull a first-person fact out of a sentence, if one is there. */
export function extractMemory(text) {
  const t = String(text).trim();
  const rules = [
    { re: /\b(?:my name is|mera naam|i am called|call me)\s+([A-Za-z\u0600-\u06ff][\w\u0600-\u06ff .'-]{1,40})/i, fmt: (m) => `Name: ${cap(m[1])}` },
    { re: /\bi(?:'m| am)\s+(\d{1,2})\s*(?:years? old|y\/o)\b/i, fmt: (m) => `Age: ${m[1]}` },
    { re: /\bi (?:live|stay) in\s+([\w .'-]{2,40})/i, fmt: (m) => `Lives in: ${cap(m[1])}` },
    { re: /\bi (?:work|study) (?:at|in)\s+([\w .'-]{2,40})/i, fmt: (m) => `Works/studies at: ${cap(m[1])}` },
    { re: /\bi (?:like|love|enjoy)\s+([\w .'-]{2,50})/i, fmt: (m) => `Likes: ${m[1].trim()}` },
    { re: /\bi (?:hate|dislike|can't stand)\s+([\w .'-]{2,50})/i, fmt: (m) => `Dislikes: ${m[1].trim()}` },
    { re: /\bi(?:'m| am) (?:working on|building|learning)\s+([\w .'-]{2,60})/i, fmt: (m) => `Working on: ${m[1].trim()}` },
    { re: /\bmy (?:favourite|favorite) ([\w ]{2,25}) is\s+([\w .'-]{2,40})/i, fmt: (m) => `Favourite ${m[1].toLowerCase()}: ${m[2].trim()}` },
    { re: /\b(?:remember(?: that)?|yaad rakho|note that|keep in mind)\s+(.{3,140})/i, fmt: (m) => stripEnd(m[1]) },
  ];
  for (const r of rules) {
    const m = t.match(r.re);
    if (m) return { text: r.fmt(m), kind: 'auto' };
  }
  return null;
}

const cap = (s) => s.trim().replace(/^\w/, (c) => c.toUpperCase());
const stripEnd = (s) => s.trim().replace(/[.!]+$/, '');
