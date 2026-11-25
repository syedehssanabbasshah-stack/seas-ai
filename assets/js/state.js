/* ════════════════════════════════════════════
   state.js — settings, personality, persistence
   ════════════════════════════════════════════ */

const KEY = 'stonic.state.v2';

export const PERSONAS = {
  jarvis: {
    id: 'jarvis',
    label: 'STONIC',
    style: 'Precise, composed, quietly witty. Occasional dry remark. Sentences stay short and surgical.',
    openers: ['Very well.', 'Understood.', 'As you wish.', 'Consider it done.'],
    greeting:
      'Core online. Diagnostics clean, memory index loaded. What are we doing today?',
    sign: '— STONIC',
  },
  mentor: {
    id: 'mentor',
    label: 'MENTOR',
    style: 'Patient, warm and guiding. Explains the why, not just the what. Encourages without flattery.',
    openers: ['Good question.', 'Let us think it through.', 'Here is the useful part.', 'Noted.'],
    greeting:
      'I am here. Take your time and tell me what you are working on — we will break it down together.',
    sign: '— STONIC',
  },
  friend: {
    id: 'friend',
    label: 'BEST FRIEND',
    style: 'Casual, playful, honest. Speaks like a close friend, no corporate tone, mild humour allowed.',
    openers: ['Okay okay, I hear you.', 'Right.', 'Ha — fair.', 'Got it.'],
    greeting:
      'Ayy, core is up. What is the plan, or are we just vibing today?',
    sign: '— STONIC',
  },
};

export const DEFAULTS = {
  persona: 'jarvis',
  speak: true,
  wake: false,
  rate: 1,
  pitch: 1,
  gender: 'male',
  voiceURI: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  elevenKey: '',
  elevenVoice: '',
  history: [],
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, history: [] };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS, history: [] };
  }
}

export const state = read();

export function saveState() {
  try {
    const { ...persist } = state;
    persist.history = state.history.slice(-40);
    localStorage.setItem(KEY, JSON.stringify(persist));
  } catch (err) {
    console.warn('[stonic] could not persist state', err);
  }
}

export function persona() {
  return PERSONAS[state.persona] || PERSONAS.jarvis;
}

export function engineName() {
  return state.apiKey ? state.model || 'remote engine' : 'local core';
}
