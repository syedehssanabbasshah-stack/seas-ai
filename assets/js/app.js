/* ══════════════════════════════════════════════
   app.js — the console that binds it all together
   ══════════════════════════════════════════════ */

import { state, saveState, persona, DEFAULTS } from './state.js';
import { respond } from './brain.js';
import { SKILLS, getTodos, toggleTodo, removeTodo, addTodo } from './skills.js';
import {
  addMemory,
  listMemories,
  removeMemory,
  wipeMemories,
  extractMemory,
} from './memory.js';
import { tts, stt, defaultVoice } from './voice.js';
import { Nebula, Starfield, createWave } from './character.js';
import { AgentTown } from './agents.js';
import { Globe } from './globe.js';
import { createTelemetry } from './telemetry.js';
import { localStt } from './local-stt.js?v=2';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────── globals ───────────────────── */

let orb;
let wave;
let town;
let currentView = 'chat';
const ctx = {};
let lastActivity = Date.now();
let nudged = false;
let studioWarned = false;

/* ───────────────────── chat ───────────────────── */

const chatEl = () => $('#chat');

function scrollChat() {
  const el = chatEl();
  el.scrollTop = el.scrollHeight;
}

function addMsg(role, text, { reveal = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;

  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = role === 'me' ? 'YOU' : role === 'ai' ? persona().label : 'SYSTEM';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  wrapper.append(who, bubble);
  chatEl().appendChild(wrapper);
  $('#voiceBody')?.classList.add('has-chat');
  scrollChat();

  if (reveal && text.length < 620 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    typeOut(bubble, text);
  } else {
    bubble.textContent = text;
  }
  return wrapper;
}

function typeOut(node, text) {
  const words = text.split(/(\s+)/);
  let i = 0;
  node.textContent = '';
  const step = () => {
    if (i >= words.length) {
      scrollChat();
      return;
    }
    node.textContent += words[i++];
    scrollChat();
    setTimeout(step, 22);
  };
  step();
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.id = 'typingMsg';
  wrap.innerHTML = `<div class="who">${persona().label}</div><div class="typing"><i></i><i></i><i></i></div>`;
  chatEl().appendChild(wrap);
  scrollChat();
  return wrap;
}

/* ───────────────────── core state helpers ───────────────────── */

function setOrb(mode, label) {
  orb?.setMode(mode);
  const map = { idle: 'IDLE', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING', sleep: 'STANDBY' };
  $('#orbState').textContent = map[mode] || 'IDLE';
  if (label) $('#orbLabel').textContent = label;
  const levels = { idle: 0.15, listening: 0.62, thinking: 0.38, speaking: 0.95, sleep: 0.05 };
  wave?.set(levels[mode] ?? 0.2, mode === 'listening' ? '#4dffa8' : mode === 'thinking' ? '#b58cff' : '#35f0ff');
  $('#micChip').classList.toggle('on', mode === 'listening');
  $('#micChip').classList.toggle('warn', mode === 'thinking');
}

async function say(text, { ms = 0 } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return;
  setOrb('speaking');
  const channel = $('#channel');
  channel?.classList.remove('is-off');
  channel?.classList.add('live');
  $('#caption').textContent = clean.replace(/\s+/g, ' ').slice(0, 210);
  await tts.speak(clean, {
    onError: (message) => {
      if (studioWarned) return;
      studioWarned = true;
      addMsg('sys', `Studio voice: ${message}`);
    },
  });
  channel?.classList.remove('live');
  setOrb('idle');
  if (ms) $('#latency').textContent = `${ms} ms`;
}

function remember(text) {
  const found = extractMemory(text);
  if (!found) return null;
  const entry = addMemory(found.text, found.kind);
  if (entry) refreshMemory();
  return entry;
}

/* ───────────────────── send pipeline ───────────────────── */

async function send(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;

  lastActivity = Date.now();
  tts.cancel();

  addMsg('me', text);
  state.history.push({ role: 'user', text });
  $('#input').value = '';
  autosize($('#input'));

  // silent memory capture
  const learned = remember(text);

  const typing = addTyping();
  setOrb('thinking');
  $('#statusLine').textContent = `SYS · ${state.apiKey ? 'engine' : 'local core'} · processing`;

  let result;
  try {
    result = await respond(text, ctx);
  } catch (err) {
    result = { reply: `Core fault: ${err?.message || err}`, source: 'local', ms: 0 };
  }

  typing.remove();
  setOrb('idle');

  addMsg('ai', result.reply, { reveal: true });
  state.history.push({ role: 'assistant', text: result.reply });
  saveState();

  $('#latency').textContent = `${result.ms ?? 0} ms`;
  $('#statusLine').textContent = `SYS · ${result.source === 'engine' ? state.model : result.source === 'skill' ? 'skill matrix' : 'local core'}`;
  $('#netChip').classList.toggle('on', Boolean(state.apiKey));
  $('#netChip').querySelector('span').textContent = state.apiKey ? 'REMOTE ENGINE' : 'LOCAL BRAIN';

  if (learned) addMsg('sys', `Memory stored — “${learned.text}”`);

  say(result.reply, { ms: result.ms });

  if (result.sleep) setOrb('sleep');
}

/* ───────────────────── views ───────────────────── */

const DRAWER_VIEWS = {
  skills: 'SKILLS',
  agents: 'CHARACTER · AGENT TOWN',
  settings: 'SETTING',
};

function setTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
}

function showView(name) {
  currentView = name;
  const inDrawer = name in DRAWER_VIEWS;
  $$('.node[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
  $('#drawer').classList.toggle('is-open', inDrawer);
  $('#drawer').setAttribute('aria-hidden', String(!inDrawer));
  if (inDrawer) $('#drawerTitle').textContent = DRAWER_VIEWS[name];
  if (!inDrawer) setTab(name === 'memory' ? 'notes' : 'voice');
  if (name === 'memory') refreshMemory();
  if (name === 'skills') renderSkills();
  if (name === 'agents') town.deploy();
  if (name === 'chat') $('#input').focus();
  if (name === 'settings') telemetry.start(paintDiag);
  else telemetry.stop();
}

/* ───────────────────── memory view ───────────────────── */

function refreshMemory() {
  const list = $('#memoryList');
  const items = listMemories();
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li class="empty">NO ENTRIES · say “remember that …”</li>';
    return;
  }
  for (const m of items) {
    const li = document.createElement('li');
    li.className = 'memory-item';
    const span = document.createElement('span');
    span.textContent = m.text;
    const time = document.createElement('time');
    time.textContent = new Date(m.ts).toLocaleDateString([], { day: '2-digit', month: 'short' });
    const btn = document.createElement('button');
    btn.innerHTML = '×';
    btn.title = 'Forget';
    btn.addEventListener('click', () => {
      removeMemory(m.id);
      refreshMemory();
    });
    li.append(span, time, btn);
    list.appendChild(li);
  }
}

/* ───────────────────── skills view ───────────────────── */

const SKILL_PROMPTS = {
  greet: 'hello',
  identity: 'who are you',
  capabilities: 'what can you do',
  time: 'what is the time',
  date: "what's the date",
  play: 'play lo-fi beats',
  open: 'open youtube',
  youtube: 'youtube seas ai',
  search: 'search weather today',
  calc: 'calculate 128 * 4',
  timer: 'set a timer 1 minute',
  remember: 'remember that I prefer dark interfaces',
  'my-name': 'my name is Ali',
  'memory-check': 'what do you remember about me',
  'todo-add': 'add todo review the design',
  'todo-list': 'show my todos',
  device: 'system scan',
  weather: 'weather',
  whatsapp: 'whatsapp 923001234567 saying hello',
  joke: 'tell me a joke',
  random: 'flip a coin',
  clear: 'clear the chat',
  forget: 'forget everything',
  sleep: 'good night',
};

function renderSkills() {
  const grid = $('#skillGrid');
  grid.innerHTML = '';
  for (const s of SKILLS) {
    const card = document.createElement('button');
    card.className = 'skill-card';
    card.type = 'button';
    const b = document.createElement('b');
    b.textContent = s.name;
    const span = document.createElement('span');
    span.textContent = s.desc;
    card.append(b, span);
    card.addEventListener('click', () => {
      showView('chat');
      send(SKILL_PROMPTS[s.id] || s.desc);
    });
    grid.appendChild(card);
  }
  renderTodos();
}

function renderTodos() {
  const list = $('#todoList');
  const todos = getTodos();
  list.innerHTML = '';
  if (!todos.length) {
    list.innerHTML = '<li class="empty">Nothing scheduled</li>';
    return;
  }
  for (const t of todos) {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = t.done;
    box.addEventListener('change', () => {
      toggleTodo(t.id);
      renderTodos();
    });
    const span = document.createElement('span');
    span.textContent = t.text;
    const del = document.createElement('button');
    del.className = 'ghost-btn';
    del.textContent = '×';
    del.addEventListener('click', () => {
      removeTodo(t.id);
      renderTodos();
    });
    li.append(box, span, del);
    list.appendChild(li);
  }
}

/* ───────────────────── voice ───────────────────── */

let localMode = false;

function channelSay(text, live = true) {
  const channel = $('#channel');
  if (!channel) return;
  channel.classList.remove('is-off');
  channel.classList.toggle('live', live);
  $('#caption').textContent = text;
}

async function startLocalMic(auto = false) {
  const btn = $('#micBtn');
  if (!localStt.supported) {
    addMsg('sys', 'On-device speech needs a microphone and WebAssembly — typing still works.');
    return;
  }
  try {
    tts.cancel();
    await localStt.start();
    localMode = true;
    btn.classList.add('is-live');
    setOrb('listening');
    channelSay('Recording on this device — tap the mic again to stop');
    $('#micChip').querySelector('span').textContent = 'LOCAL MIC';
    if (auto) addMsg('sys', 'Cloud recognition is unavailable here — switched to the on-device speech model.');
  } catch (err) {
    addMsg('sys', `Microphone: ${err?.message || err}`);
    setOrb('idle');
  }
}

async function stopLocalMic() {
  const btn = $('#micBtn');
  const blob = await localStt.stop();
  localMode = false;
  btn.classList.remove('is-live');
  $('#micChip').querySelector('span').textContent = 'MIC IDLE';
  if (!blob) {
    channelSay('Nothing captured — hold a little longer.', false);
    setOrb('idle');
    return;
  }
  setOrb('thinking');
  channelSay('Transcribing on this device…');
  try {
    const text = await localStt.transcribe(blob, (p) => {
      if (p.status === 'download') channelSay(`Loading the speech model ${p.pct}%…`);
      else if (p.status === 'ready') channelSay('Transcribing on this device…');
    });
    if (text) {
      channelSay('Heard you.');
      if (currentView !== 'chat') showView('chat');
      send(text);
    } else {
      channelSay('No speech detected.', false);
      addMsg('sys', 'No speech detected — try again a little closer to the mic.');
    }
  } catch (err) {
    channelSay('On-device speech failed.', false);
    addMsg('sys', `On-device speech failed: ${err?.message || err}`);
  } finally {
    setOrb('idle');
  }
}

function initMic() {
  const btn = $('#micBtn');

  const onResult = (text) => {
    if (!text) return;
    if (currentView !== 'chat') showView('chat');
    send(text);
  };

  btn.addEventListener('click', () => {
    if (localMode) {
      stopLocalMic();
      return;
    }
    if (stt.active) {
      stt.stop();
      btn.classList.remove('is-live');
      setOrb('idle');
      return;
    }
    if (!stt.supported) {
      startLocalMic();
      return;
    }
    tts.cancel();
    btn.classList.add('is-live');
    const ok = stt.start({
      mode: 'command',
      onResult,
      onState: (s, code) => {
        if (s === 'listening') {
          setOrb('listening');
          $('#channel').classList.remove('is-off');
          $('#caption').textContent = 'Listening…';
          $('#channel').classList.add('live');
          $('#micChip').querySelector('span').textContent = 'MIC LIVE';
          return;
        }
        btn.classList.remove('is-live');
        if (s === 'blocked') addMsg('sys', 'Microphone permission was denied for this page.');
        if (s === 'ended' || s === 'error' || s === 'silent' || s === 'blocked') setOrb('idle');
        if (s === 'error' && (code === 'network' || code === 'service-not-allowed')) {
          startLocalMic(true);
        }
      },
    });
    if (!ok) {
      btn.classList.remove('is-live');
      addMsg('sys', 'Could not open the microphone on this page.');
    }
  });

  if (!stt.supported) btn.title = 'Cloud recognition unavailable — tap for on-device speech';
}

let wakeActive = false;

function syncWake() {
  if (!stt.supported) return;
  if (state.wake && !wakeActive) {
    wakeActive = true;
    stt.start({
      mode: 'wake',
      onResult: (text) => {
        const m = text.toLowerCase().match(/\b(hey\s+)?(seas|seez|seaz)\b(.*)/);
        if (!m) return;
        const rest = (m[3] || '').replace(/^[,.\s]+/, '').trim();
        if (rest.length > 2) {
          if (currentView !== 'chat') showView('chat');
          send(rest);
        } else {
          setOrb('listening');
          addMsg('sys', 'Wake word detected — listening.');
          tts.speak('I am here.');
        }
      },
      onState: (s) => {
        if (s === 'listening') $('#micChip').querySelector('span').textContent = 'WAKE ARMED';
      },
    });
  } else if (!state.wake && wakeActive) {
    wakeActive = false;
    stt.stop();
  }
}

/* ───────────────────── settings ───────────────────── */

function bindSettings() {
  $('#speakToggle').checked = state.speak;
  $('#listenToggle').checked = state.wake;
  $('#rate').value = state.rate;
  $('#pitch').value = state.pitch;
  $('#rateVal').textContent = Number(state.rate).toFixed(1);
  $('#pitchVal').textContent = Number(state.pitch).toFixed(1);
  $('#baseUrl').value = state.baseUrl;
  $('#model').value = state.model;
  $('#apiKey').value = state.apiKey;
  $('#elevenKey').value = state.elevenKey;
  $('#elevenVoice').value = state.elevenVoice;

  const engineLine = () => {
    $('#engineState').textContent = state.apiKey
      ? `Engine linked → ${state.model} @ ${state.baseUrl}`
      : 'Running on the local core. No key needed, no data leaves this device.';
  };
  engineLine();

  const seg = $('#genderSeg');
  const paintGender = () => {
    [...seg.children].forEach((b) => b.classList.toggle('is-active', b.dataset.gender === state.gender));
    const v = defaultVoice();
    $('#voiceInfo').textContent = v ? `engine voice · ${v.name} (${v.lang})` : 'engine voice · system default';
  };
  paintGender();
  setTimeout(paintGender, 600);

  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-gender]');
    if (!btn || btn.dataset.gender === state.gender) return;
    state.gender = btn.dataset.gender;
    state.voiceURI = '';
    saveState();
    paintGender();
    addMsg('sys', `Voice set to ${state.gender.toUpperCase()}`);
    tts.speak(`Voice calibrated. ${state.gender} voice online.`);
  });

  $('#speakToggle').addEventListener('change', (e) => {
    state.speak = e.target.checked;
    saveState();
    if (!state.speak) tts.cancel();
  });

  $('#listenToggle').addEventListener('change', (e) => {
    state.wake = e.target.checked;
    saveState();
    syncWake();
    paintAware();
  });

  const awareSwitch = $('#awernessSwitch');
  awareSwitch?.addEventListener('click', () => {
    state.wake = !state.wake;
    saveState();
    $('#listenToggle').checked = state.wake;
    paintAware();
    syncWake();
    addMsg('sys', state.wake ? 'Awerness armed — say “Hey Seas”.' : 'Awerness paused.');
  });

  $('#rate').addEventListener('input', (e) => {
    state.rate = Number(e.target.value);
    $('#rateVal').textContent = state.rate.toFixed(1);
  });
  $('#pitch').addEventListener('input', (e) => {
    state.pitch = Number(e.target.value);
    $('#pitchVal').textContent = state.pitch.toFixed(1);
  });
  $('#rate').addEventListener('change', saveState);
  $('#pitch').addEventListener('change', saveState);

  $('#saveSettings').addEventListener('click', () => {
    state.baseUrl = $('#baseUrl').value.trim() || DEFAULTS.baseUrl;
    state.model = $('#model').value.trim() || DEFAULTS.model;
    state.apiKey = $('#apiKey').value.trim();
    state.elevenKey = $('#elevenKey').value.trim();
    state.elevenVoice = $('#elevenVoice').value.trim();
    saveState();
    tts.lastError = '';
    engineLine();
    $('#netChip').classList.toggle('on', Boolean(state.apiKey));
    $('#netChip').querySelector('span').textContent = state.apiKey ? 'REMOTE ENGINE' : 'LOCAL BRAIN';
    addMsg('sys', state.apiKey ? `Engine saved · ${state.model}` : 'Engine cleared · local core active');
    if (state.elevenKey) addMsg('sys', 'Studio voice linked · ElevenLabs');
  });

  $('#resetSettings').addEventListener('click', () => {
    state.apiKey = '';
    state.baseUrl = DEFAULTS.baseUrl;
    state.model = DEFAULTS.model;
    state.elevenKey = '';
    state.elevenVoice = '';
    saveState();
    $('#apiKey').value = '';
    $('#baseUrl').value = DEFAULTS.baseUrl;
    $('#model').value = DEFAULTS.model;
    $('#elevenKey').value = '';
    $('#elevenVoice').value = '';
    tts.lastError = '';
    engineLine();
    $('#netChip').classList.remove('on');
    $('#netChip').querySelector('span').textContent = 'LOCAL BRAIN';
  });
}

/* ───────────────────── awerness switch ───────────────────── */

function paintAware() {
  const sw = $('#awernessSwitch');
  if (!sw) return;
  sw.classList.toggle('is-on', Boolean(state.wake));
  sw.setAttribute('aria-pressed', String(Boolean(state.wake)));
}

/* ───────────────────── diagnostics ───────────────────── */

const telemetry = createTelemetry({ pingUrl: 'assets/favicon.svg' });

function paintDiag(s) {
  const diag = $('#diag');
  if (!diag) return;
  const rows = {
    load: { text: `${s.load}%`, pct: s.load, warn: s.load > 55 },
    mem: { text: s.memLabel, pct: s.memRatio, warn: s.memRatio != null && s.memRatio > 82 },
    net: {
      text: s.rtt != null ? `${s.rtt} ms` : 'offline',
      pct: s.rtt != null ? Math.max(8, 100 - Math.min(100, s.rtt / 2.5)) : 4,
      warn: s.rtt == null || s.rtt > 260,
    },
    fps: { text: `${s.fps} fps`, pct: Math.min(100, (s.fps / 60) * 100), warn: s.fps < 20 },
  };
  for (const [k, r] of Object.entries(rows)) {
    const row = diag.querySelector(`[data-k="${k}"]`);
    if (!row) continue;
    row.querySelector('strong').textContent = r.text;
    const bar = row.querySelector('.meter > b');
    bar.style.width = `${r.pct == null ? 0 : Math.max(r.pct > 0 ? 3 : 0, Math.round(r.pct))}%`;
    bar.classList.toggle('is-warn', Boolean(r.warn));
  }
  const note = $('#diagNote');
  if (note) {
    note.textContent = `${s.cores || '?'} threads · ${
      s.deviceMemory ? `${s.deviceMemory} GB device` : 'device memory n/a'
    } · session ${s.uptimeLabel}`;
  }
}

/* ───────────────────── command console ───────────────────── */

let paletteItems = [];
let paletteIndex = 0;
let paletteOpen = false;

function paletteCommands() {
  const list = [
    {
      label: 'Start listening',
      hint: 'MIC',
      run: () => {
        showView('chat');
        $('#micBtn').click();
      },
    },
    { label: 'System diagnostics', hint: 'SETTING', run: () => showView('settings') },
    { label: 'Notes & memories', hint: 'NOTES', run: () => showView('memory') },
    { label: 'Skill matrix', hint: 'SKILLS', run: () => showView('skills') },
    { label: 'Agent town', hint: 'CHARACTER', run: () => showView('agents') },
    { label: 'Clear transcript', hint: 'CHAT', run: () => $('#clearChat').click() },
    {
      label: state.gender === 'female' ? 'Switch to male voice' : 'Switch to female voice',
      hint: 'VOICE',
      run: () => {
        const next = state.gender === 'female' ? 'male' : 'female';
        $('#genderSeg').querySelector(`[data-gender="${next}"]`)?.click();
      },
    },
    {
      label: state.speak ? 'Mute spoken replies' : 'Unmute spoken replies',
      hint: 'VOICE',
      run: () => {
        state.speak = !state.speak;
        saveState();
        $('#speakToggle').checked = state.speak;
        if (!state.speak) tts.cancel();
        addMsg('sys', state.speak ? 'Voice output on.' : 'Voice output muted.');
      },
    },
    {
      label: state.wake ? 'Pause awerness' : 'Arm awerness — hey Seas',
      hint: 'WAKE',
      run: () => $('#awernessSwitch').click(),
    },
  ];

  for (const prompt of $$('.hub-list button').map((b) => b.dataset.prompt).filter(Boolean)) {
    list.push({
      label: prompt,
      hint: 'HUB',
      run: () => {
        showView('chat');
        send(prompt);
      },
    });
  }
  return list;
}

function setPaletteIndex(i) {
  const items = $$('#paletteList li');
  if (!items.length) return;
  paletteIndex = (i + items.length) % items.length;
  items.forEach((li, idx) => li.classList.toggle('is-active', idx === paletteIndex));
  items[paletteIndex].scrollIntoView({ block: 'nearest' });
}

function runPalette(i) {
  const cmd = paletteItems[i];
  closePalette();
  cmd?.run();
}

function renderPalette(query = '') {
  const q = query.trim().toLowerCase();
  paletteItems = paletteCommands().filter(
    (c) => !q || c.label.toLowerCase().includes(q) || String(c.hint).toLowerCase().includes(q)
  );
  paletteIndex = 0;
  const list = $('#paletteList');
  list.innerHTML = '';
  if (!paletteItems.length) {
    list.innerHTML = '<li class="palette-empty">No command matches that.</li>';
    return;
  }
  paletteItems.forEach((cmd, i) => {
    const li = document.createElement('li');
    if (i === 0) li.className = 'is-active';
    const btn = document.createElement('button');
    btn.type = 'button';
    const label = document.createElement('span');
    label.textContent = cmd.label;
    const hint = document.createElement('em');
    hint.className = 'p-hint';
    hint.textContent = cmd.hint || '';
    btn.append(label, hint);
    btn.addEventListener('mouseenter', () => setPaletteIndex(i));
    btn.addEventListener('click', () => runPalette(i));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function openPalette() {
  paletteOpen = true;
  const box = $('#palette');
  box.classList.add('is-open');
  box.setAttribute('aria-hidden', 'false');
  const input = $('#paletteInput');
  input.value = '';
  renderPalette('');
  input.focus();
}

function closePalette() {
  paletteOpen = false;
  const box = $('#palette');
  box.classList.remove('is-open');
  box.setAttribute('aria-hidden', 'true');
}

$('#exploreBtn')?.addEventListener('click', openPalette);
$$('[data-palette-close]').forEach((el) => el.addEventListener('click', closePalette));

$('#paletteInput').addEventListener('input', (e) => renderPalette(e.target.value));
$('#paletteInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setPaletteIndex(paletteIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setPaletteIndex(paletteIndex - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    runPalette(paletteIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
});

/* ───────────────────── misc UI ───────────────────── */

function bindWindowControls() {
  const api = window.seasDesktop?.win;
  if (!api) return;
  document.body.classList.add('is-desktop');
  const [min, max, close] = $$('.win-btns button');
  min?.addEventListener('click', () => api.minimize());
  max?.addEventListener('click', () => api.maximize());
  close?.addEventListener('click', () => api.close());
  api.onMaximized?.((value) => max?.classList.toggle('is-max', value));
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

function tickClock() {
  const now = new Date();
  const worldDate = $('#worldDate');
  if (worldDate) {
    worldDate.textContent = now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  const clock = $('#clock');
  if (clock) clock.textContent = now.toLocaleTimeString([], { hour12: false });
}

function bindComposer() {
  const input = $('#input');
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });

  $('#clearChat').addEventListener('click', () => {
    chatEl().innerHTML = '';
    $('#voiceBody')?.classList.remove('has-chat');
    state.history = [];
    saveState();
    addMsg('sys', 'Transcript cleared.');
  });

  $('#memoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('#memoryInput').value;
    if (!val.trim()) return;
    addMemory(val, 'manual');
    $('#memoryInput').value = '';
    refreshMemory();
  });

  $('#wipeMemory').addEventListener('click', () => {
    wipeMemories();
    refreshMemory();
    addMsg('sys', 'Memory core wiped.');
  });

  $$('.quick button').forEach((b) => {
    b.addEventListener('click', () => {
      showView('chat');
      send(b.dataset.quick);
    });
  });

  $$('.node[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => showView(t.dataset.tab === 'notes' ? 'memory' : 'chat'))
  );

  $$('[data-close]').forEach((b) => b.addEventListener('click', () => showView('chat')));

  $('#channelX').addEventListener('click', () => $('#channel').classList.add('is-off'));

  $$('.wcard').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.wcard-arrow') && card.classList.contains('is-collapsed')) {
        card.classList.remove('is-collapsed');
        return;
      }
      showView('chat');
      send(card.dataset.prompt);
    });
  });

  $$('.hub-list button').forEach((b) =>
    b.addEventListener('click', () => {
      showView('chat');
      send(b.dataset.prompt);
    })
  );

  window.addEventListener('resize', drawWires);

  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('#taskInput').value;
    if (!val.trim()) return;
    $('#taskInput').value = '';
    town.assign(val);
  });

  $('#deployTeam').addEventListener('click', () => {
    town.deploy();
    town.log('Command', 'team redeployed');
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (paletteOpen) closePalette();
      else openPalette();
      return;
    }
    if (paletteOpen) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      $('#micBtn').click();
    }
    if (e.key === '/' && document.activeElement !== $('#input')) {
      e.preventDefault();
      showView('chat');
      $('#input').focus();
    }
  });
}

/* ───────────────────── start ───────────────────── */

function drawWires() {
  const row = $('.core-row');
  const svg = $('#wires');
  const orbPanel = $('.orb-panel');
  const nodes = $$('#nodes .node');
  if (!row || !svg || !orbPanel || !nodes.length) return;
  if (window.matchMedia('(max-width: 940px)').matches) {
    svg.innerHTML = '';
    return;
  }

  const r = row.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const b = orbPanel.getBoundingClientRect();
  const px = b.left - r.left;
  const py = r.height / 2;
  const colors = ['#2f9bff', '#35e08d', '#ff4d6d', '#a9b7c6'];
  let out = '';

  nodes.forEach((n, i) => {
    const nb = n.getBoundingClientRect();
    const y = nb.top - r.top + nb.height / 2;
    const x1 = nb.right - r.left + 3;
    const xm = x1 + (px - x1) * 0.58;
    const c = colors[i] || '#2f9bff';
    const path = `M${x1} ${y} H${xm} L${px - 1} ${py}`;
    out += `<path d="${path}" fill="none" stroke="${c}" stroke-width="4" stroke-opacity=".07" stroke-linejoin="round"/>`;
    out += `<path d="${path}" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity=".55" stroke-linejoin="round"/>`;
    out += `<circle cx="${x1}" cy="${y}" r="1.7" fill="${c}"/>`;
  });

  out += `<circle cx="${px}" cy="${py}" r="20" fill="#2bd7f0" opacity=".07"/>`;
  out += `<circle cx="${px}" cy="${py}" r="9" fill="#2bd7f0" opacity=".14"/>`;
  out += `<circle cx="${px}" cy="${py}" r="3.2" fill="#7ff0ff"/>`;
  out += `<circle cx="${px}" cy="${py}" r="1" fill="#ffffff"/>`;

  svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
  svg.innerHTML = out;
}

function start() {
  orb = new Nebula($('#orb'));
  new Starfield($('#starfield'));
  new Globe($('#globe'));
  wave = createWave($('#wave'));
  town = new AgentTown({ stage: $('#townAgents'), logEl: $('#townLog') });

  ctx.history = state.history;
  ctx.clearChat = () => {
    chatEl().innerHTML = '';
    state.history = [];
    saveState();
  };
  ctx.refreshMemory = refreshMemory;
  ctx.notify = (text) => {
    addMsg('sys', text);
    say(text);
  };
  ctx.timer = (ms, label) => {
    setTimeout(() => {
      addMsg('sys', `Timer finished — ${label}`);
      say(`Timer finished. ${label} is up.`);
      $('#caption').textContent = `TIMER · ${label} complete`;
    }, ms);
  };

  bindWindowControls();
  bindComposer();
  bindSettings();
  initMic();
  tickClock();
  setInterval(tickClock, 1000);
  setOrb('idle');

  // restore transcript
  const history = state.history.filter((m) => m.role === 'user' || m.role === 'assistant');
  if (history.length) {
    for (const m of history.slice(-14)) addMsg(m.role === 'user' ? 'me' : 'ai', m.text);
    addMsg('sys', 'Session restored from local archive.');
  } else {
    $('#voiceBody').classList.remove('has-chat');
  }

  const greetName = listMemories().find((m) => m.text.startsWith('Name:'));
  if (greetName) $('#orbLabel').textContent = 'SEAS';
  $('#statusLine').textContent = `SYS · ${state.apiKey ? state.model : 'local core'}`;
  $('#netChip').classList.toggle('on', Boolean(state.apiKey));
  $('#netChip').querySelector('span').textContent = state.apiKey ? 'REMOTE ENGINE' : 'LOCAL BRAIN';

  if (state.wake) syncWake();
  paintAware();
  paintDiag(telemetry.snapshot());

  drawWires();
  setTimeout(drawWires, 120);
  window.addEventListener('load', drawWires);

  // awareness — speaks once after a long silence
  setInterval(() => {
    if (nudged || tts.speaking || stt.active) return;
    if (Date.now() - lastActivity < 1000 * 60 * 3) return;
    nudged = true;
    const p = persona();
    const lines = {
      jarvis: 'Still here. Diagnostics idle, memory intact. Say the word.',
      mentor: 'You have been quiet for a while — no rush. I am here when you want to pick it back up.',
      friend: 'You went quiet on me. Everything good?',
    };
    const line = lines[state.persona] || lines.jarvis;
    addMsg('ai', line);
    say(line);
  }, 30000);
}

/* go */
start();
