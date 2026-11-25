/* ══════════════════════════════════════════════
   skills.js — on-device skill matrix
   Everything here runs in the browser, no backend.
   ══════════════════════════════════════════════ */

import { addMemory, searchMemories, listMemories, wipeMemories } from './memory.js';
import { state } from './state.js';
import { isDesktop, pcRun, pcNews } from './desktop.js';

const TODO_KEY = 'stonic.todos.v1';

/* ───────────── site directory ───────────── */
const SITES = {
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
  mail: 'https://mail.google.com',
  whatsapp: 'https://web.whatsapp.com',
  github: 'https://github.com',
  spotify: 'https://open.spotify.com',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  instagram: 'https://www.instagram.com',
  facebook: 'https://www.facebook.com',
  netflix: 'https://www.netflix.com',
  maps: 'https://maps.google.com',
  drive: 'https://drive.google.com',
  calendar: 'https://calendar.google.com',
  linkedin: 'https://www.linkedin.com',
  reddit: 'https://www.reddit.com',
  stackoverflow: 'https://stackoverflow.com',
  wikipedia: 'https://www.wikipedia.org',
  twitter: 'https://x.com',
  x: 'https://x.com',
  amazon: 'https://www.amazon.com',
  daraz: 'https://www.daraz.pk',
  telegram: 'https://web.telegram.org',
  discord: 'https://discord.com/app',
  notion: 'https://www.notion.so',
  figma: 'https://www.figma.com',
  canva: 'https://www.canva.com',
  twitch: 'https://www.twitch.tv',
  vscode: 'https://vscode.dev',
  zoom: 'https://zoom.us',
  dropbox: 'https://www.dropbox.com',
  weather: 'https://www.google.com/search?q=weather',
};

const openUrl = (url) => {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  return Boolean(w);
};

const findSite = (raw) => {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(the|my)/, '');
  if (!key) return null;
  const names = Object.keys(SITES);
  const exact = names.find((n) => n === key);
  if (exact) return { name: exact, url: SITES[exact] };
  const partial = names.find((n) => key.includes(n) || n.includes(key));
  return partial ? { name: partial, url: SITES[partial] } : null;
};

/* ───────────── todos ───────────── */
function readTodos() {
  try {
    const raw = localStorage.getItem(TODO_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function writeTodos(list) {
  try { localStorage.setItem(TODO_KEY, JSON.stringify(list.slice(0, 60))); } catch { /* noop */ }
}

export function getTodos() {
  return readTodos();
}
export function addTodo(text) {
  const list = readTodos();
  list.push({ id: Math.random().toString(36).slice(2, 8), text: String(text).trim(), done: false });
  writeTodos(list);
  return list;
}
export function toggleTodo(id) {
  const list = readTodos();
  const item = list.find((t) => t.id === id);
  if (item) item.done = !item.done;
  writeTodos(list);
  return list;
}
export function removeTodo(id) {
  writeTodos(readTodos().filter((t) => t.id !== id));
  return readTodos();
}

/* ───────────── helpers ───────────── */
const clock = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const longDate = () =>
  new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const JOKES = [
  'I told my computer I needed a break — now it will not stop sending me pop-ups about a holiday in the cloud.',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I asked the local AI for a joke. It returned null. Terrifying, honestly.',
  'There are two hard things in computing: cache invalidation, naming things, and off-by-one errors.',
];

const safeCalc = (expr) => {
  const cleaned = expr.replace(/[^0-9+\-*/().%\s]/g, '');
  if (!cleaned.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict";return (${cleaned})`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.round(value * 1e10) / 1e10;
  } catch {
    return null;
  }
};

async function batteryLine() {
  try {
    if (!navigator.getBattery) return null;
    const b = await navigator.getBattery();
    return `${Math.round(b.level * 100)}% ${b.charging ? '(charging)' : '(on battery)'}`;
  } catch {
    return null;
  }
}

/* ═══════════════════ SKILLS ═══════════════════ */

/* ───────────── desktop gateway ───────────── */

const DESKTOP_APPS = new Set([
  'notepad', 'calculator', 'calc', 'paint', 'chrome', 'edge', 'firefox', 'explorer', 'files',
  'file explorer', 'vscode', 'code', 'word', 'excel', 'powerpoint', 'spotify', 'whatsapp',
  'telegram', 'discord', 'vlc', 'cmd', 'terminal', 'settings', 'task manager', 'camera',
  'snipping tool', 'clock', 'store', 'control',
]);

const desktopOnly = () => ({
  reply: 'That needs the Seas AI PC app — this build is running in a browser, where the operating system is out of reach.',
});

async function useDesktop(tool, args, format) {
  if (!isDesktop()) return desktopOnly();
  const result = await pcRun(tool, args);
  return format(result);
}

export const SKILLS = [
  {
    id: 'greet',
    name: 'PRESENCE',
    desc: 'Greet the core',
    re: /^(hi|hey|hello|yo|sup|salam|assalam|aoa|hola)\b/i,
    run: () => ({
      reply: 'Online and listening. Voice, memory and the skill matrix are all warm. What do you need?',
    }),
  },
  {
    id: 'identity',
    name: 'IDENTITY',
    desc: 'Who am I?',
    re: /\b(who are you|what are you|tum (kon|kaun) ho|kaun ho|your name|tumhara naam)\b/i,
    run: () => ({
      reply:
        'I am Seas AI — a local-first desktop intelligence: a character with a voice, a memory of you, and a small skill matrix. I run in this browser window; my memory never leaves this device.',
    }),
  },
  {
    id: 'capabilities',
    name: 'CAPABILITIES',
    desc: 'What can you do?',
    re: /\b(what can you do|capabilit|help me|kya kar sakt|features)\b/i,
    run: () => ({
      reply:
        'I can open sites and play music, run web searches, do quick maths, set timers, keep notes and to-dos, remember things about you, report on your device, and talk it all through out loud. Open the SKILLS module to see the full matrix.',
    }),
  },
  {
    id: 'time',
    name: 'CLOCK',
    desc: 'Tell the time',
    re: /\b(what('| i)?s the time|current time|time (kya|batao|now)|what time is it)\b/i,
    run: () => ({ reply: `It is ${clock()} local time.` }),
  },
  {
    id: 'date',
    name: 'CALENDAR',
    desc: "Today's date",
    re: /\b(what('| i)?s the date|today'?s date|which day is it|date kya)\b/i,
    run: () => ({ reply: `Today is ${longDate()}.` }),
  },
  {
    id: 'play',
    name: 'MEDIA',
    desc: 'Play something on YouTube',
    re: /\b(play|bajao|chalao|sunao)\s+(?:some\s+|me\s+)?(.{2,80})$/i,
    run: (m) => {
      const q = m[2].replace(/\b(on youtube|music|song|please)\b/gi, '').trim() || m[2];
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      openUrl(url);
      return { reply: `Queuing ${q} on YouTube. The tab is open — press play and I will stay quiet.`, url };
    },
  },
  {
    id: 'open',
    name: 'LAUNCHER',
    desc: 'Open a site or app',
    re: /^(?:open|launch|khol(?:o|do)?)\s+(.+)$/i,
    run: async (m) => {
      const target = m[1].trim();
      if (/^(my )?(todos?|tasks?|list|memory|memories|chat|settings)$/i.test(target)) return null;
      const key = target.toLowerCase().replace(/\s+/g, ' ').trim();
      if (isDesktop()) {
        const folderMap = {
          files: '~/Documents',
          folder: '~/Documents',
          documents: '~/Documents',
          downloads: '~/Downloads',
          desktop: '~/Desktop',
          pictures: '~/Pictures',
          music: '~/Music',
          videos: '~/Videos',
        };
        const folder = folderMap[key] || folderMap[key.replace(/^my /, '')];
        try {
          if (DESKTOP_APPS.has(key) || /\.(exe|lnk)$/i.test(key)) {
            const result = await pcRun('open_app', { name: key });
            return { reply: `Opening ${result.app}.` };
          }
          if (folder) {
            await pcRun('open_path', { path: folder });
            return { reply: `Opened your ${key.replace(/^my /, '')} folder.` };
          }
        } catch (err) {
          return { reply: `The desktop refused that: ${err?.message || err}` };
        }
      }
      const site = findSite(target);
      if (site) {
        openUrl(site.url);
        return { reply: `Opening ${site.name}.`, url: site.url };
      }
      if (/^(my )?(files|documents|folder|desktop|downloads)$/i.test(target)) {
        return {
          reply:
            'A browser cannot reach your file system — that needs the desktop build of Seas AI. I can open a site or search for it instead.',
        };
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      openUrl(url);
      return {
        reply: `No local launcher in this sandbox, so I searched for “${target}” instead.`,
        url,
      };
    },
  },
  {
    id: 'youtube',
    name: 'YOUTUBE',
    desc: 'Search videos',
    re: /^(?:youtube|yt)\s+(.+)$/i,
    run: (m) => {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}`;
      openUrl(url);
      return { reply: `YouTube results for “${m[1]}” are up.`, url };
    },
  },
  {
    id: 'search',
    name: 'WEB SEARCH',
    desc: 'Look something up',
    re: /^(?:search|google|look up|find|dhundo|khojo)\s+(?:for\s+)?(.{2,120})$/i,
    run: async (m) => {
      const target = m[1].trim();
      if (isDesktop() && /\b(file|files|folder|document|documents|pdf|docx?|xlsx?|txt|desktop|downloads|pictures)\b/i.test(target)) {
        const words = target
          .replace(/\b(find|search|for|my|the|file|files|folder|document|documents|in|inside)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        try {
          const found = await pcRun('find_files', { query: words || target });
          if (found.paths.length) {
            const lines = found.paths.slice(0, 8).map((item) => `• ${item}`).join('\n');
            return { reply: `Found ${found.paths.length} match${found.paths.length === 1 ? '' : 'es'}:\n${lines}` };
          }
          const docs = await pcRun('doc_search', { query: words || target });
          if (docs.excerpt) return { reply: `Nothing by name, but these files mention it:\n${docs.excerpt.slice(0, 700)}` };
          return { reply: `I found nothing on this device for “${words || target}”.` };
        } catch (err) {
          return { reply: `File search failed: ${err?.message || err}` };
        }
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      openUrl(url);
      return { reply: `Searching the web for “${target}”.`, url };
    },
  },
  {
    id: 'calc',
    name: 'MATH',
    desc: 'Quick calculation',
    re: /^(?:calc(?:ulate)?|what is|whats|how much is|solve)\s+([-+0-9*/().%\s^]{1,60})$/i,
    run: (m) => {
      const value = safeCalc(m[1].replace(/\^/g, '**'));
      if (value === null) return null;
      return { reply: `${m[1].trim()} = ${value}` };
    },
  },
  {
    id: 'timer',
    name: 'TIMER',
    desc: 'Set a countdown',
    re: /\b(?:set (?:a )?timer|timer|remind me|alarm)\b[^\d]*(\d{1,3})\s*(seconds?|secs?|minutes?|mins?|hours?|ghant[ae]|minat)?/i,
    run: (m, _t, ctx) => {
      const n = parseInt(m[1], 10);
      const unit = (m[2] || 'minute').toLowerCase();
      const mult = /^(s|sec)/.test(unit) ? 1 : /^(h|ghant)/.test(unit) ? 3600 : 60;
      const ms = n * mult * 1000;
      if (!ms || ms > 86400000) return { reply: 'Give me a timer between one second and twenty four hours.' };
      ctx?.timer?.(ms, `${n} ${unit}`);
      return { reply: `Timer armed for ${n} ${unit}. I will call out when it fires.` };
    },
  },
  {
    id: 'remember',
    name: 'MEMORY',
    desc: 'Store a fact',
    re: /^(?:remember|please remember|note that|yaad rakho|keep in mind)\s+(?:that\s+)?(.{3,180})$/i,
    run: (m) => {
      const fact = m[1].replace(/[.!]+$/, '').trim();
      addMemory(fact, 'explicit');
      return { reply: `Stored: “${fact}”. Ask me about it any time.` };
    },
  },
  {
    id: 'my-name',
    name: 'MEMORY',
    desc: 'Learn your name',
    re: /\b(?:my name is|mera naam|call me|i am called)\s+([A-Za-z\u0600-\u06ff][\w\u0600-\u06ff .'-]{1,40})$/i,
    run: (m) => {
      const name = m[1].trim().replace(/[.!]+$/, '');
      addMemory(`Name: ${name}`, 'auto');
      return { reply: `Noted, ${name}. I will remember that across sessions.` };
    },
  },
  {
    id: 'memory-check',
    name: 'MEMORY',
    desc: 'Recall what is stored',
    re: /\b(what do you (remember|know) about me|do you remember me|my memories|what have you stored)\b/i,
    run: () => {
      const list = listMemories();
      if (!list.length) return { reply: 'My memory core is empty. Tell me something with “remember that …”.' };
      const top = list.slice(0, 6).map((m) => `• ${m.text}`).join('\n');
      return { reply: `Here is what I hold on this device:\n${top}` };
    },
  },
  {
    id: 'todo-add',
    name: 'NOTES',
    desc: 'Add a to-do',
    re: /^(?:add (?:a )?(?:todo|task)|todo|note down)\s*[:,-]?\s*(.{2,160})$/i,
    run: (m) => {
      addTodo(m[1]);
      return { reply: `Added to today: “${m[1]}”.` };
    },
  },
  {
    id: 'todo-list',
    name: 'NOTES',
    desc: 'List to-dos',
    re: /\b(show|list|what are|open) my (todos|tasks|list)|mere (task|todo)/i,
    run: () => {
      const list = getTodos();
      if (!list.length) return { reply: 'Your list is clear. Nothing pending.' };
      const lines = list
        .map((t, i) => `${i + 1}. ${t.done ? '✔' : '○'} ${t.text}`)
        .join('\n');
      return { reply: `Today:\n${lines}` };
    },
  },
  {
    id: 'device',
    name: 'SYSTEM',
    desc: 'Scan this device',
    re: /\b(system (scan|status|info)|how is my (pc|computer|laptop|device)|check (my )?(ram|cpu|battery)|device info)\b/i,
    run: async () => {
      if (isDesktop()) {
        try {
          const info = await pcRun('system_info');
          return {
            reply:
              `Scan complete.\n• System: ${info.os} (${info.arch})\n• CPU: ${info.cpu_model} · ${info.cpus} threads\n` +
              `• Memory: ${info.ram_used_percent}% used of ${info.ram_total_gb} GB\n` +
              (info.disk_free_gb != null ? `• Disk free: ${info.disk_free_gb} GB\n` : '') +
              `• Uptime: ${info.uptime_hours} h · user ${info.user}\n` +
              `• Engine: ${state.apiKey ? state.model : 'local core'}`,
          };
        } catch { /* fall through to the browser report */ }
      }
      const cores = navigator.hardwareConcurrency || 'unknown';
      const ram = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'not reported';
      const net = navigator.onLine ? 'online' : 'offline';
      const bat = await batteryLine();
      const res = `${window.screen.width}×${window.screen.height}`;
      return {
        reply:
          `Scan complete.\n• CPU threads: ${cores}\n• Memory: ${ram}\n• Screen: ${res}\n` +
          `• Network: ${net}${bat ? `\n• Battery: ${bat}` : ''}\n` +
          `• Engine: ${state.apiKey ? state.model : 'local core'}`,
      };
    },
  },
  {
    id: 'research',
    name: 'RESEARCH',
    desc: 'Search the web and read it',
    re: /^(?:research|web research|look up online|read about|search (?:the )?(?:web|internet) (?:for )?)\s*(.{2,160})$/i,
    run: async (m) => {
      if (!isDesktop()) return null;
      const result = await pcRun('research', { query: m[1] });
      if (!result.hits.length) return null;
      const lines = result.hits
        .slice(0, 4)
        .map((hit, i) => `${i + 1}. ${hit.title} — ${hit.snippet.slice(0, 160)} (${hit.url})`)
        .join('\n');
      const page = result.page ? `\n\nFrom the top result: ${result.page.slice(0, 500)}` : '';
      return { reply: `Research on “${result.query}”:\n${lines}${page}`, url: result.hits[0].url };
    },
  },
  {
    id: 'screenshot',
    name: 'SCREENSHOT',
    desc: 'Capture this screen',
    re: /\b(take (?:a )?screenshot|screenshot|capture (?:the )?screen|screen ?shot|snap (?:the )?screen)\b/i,
    run: () =>
      useDesktop('screenshot', {}, (shot) => ({
        reply: 'Screenshot captured from your screen — it is in the transcript and no file was left behind.',
        image: shot.image,
        mime: shot.mime || 'image/jpeg',
      })),
  },
  {
    id: 'volume',
    name: 'SOUND',
    desc: 'Set the volume',
    re: /^(?:set )?(?:the )?(?:volume|sound|awaaz)(?: (?:to|at))?\s*(\d{1,3})%?$|\bvolume (up|down)\b|\b(mute|unmute)\b|\bawaaz (?:kam|zyada|tez|dheemi)\b/i,
    run: (m, text) => {
      const t = text.toLowerCase();
      if (/unmute|awaaz (zyada|tez)/.test(t)) return useDesktop('media', { action: 'mute' }, () => ({ reply: 'Sound is back on.' }));
      if (/\bmute\b/.test(t)) return useDesktop('media', { action: 'mute' }, () => ({ reply: 'Muted.' }));
      if (/volume up|awaaz zyada|awaaz tez/.test(t)) {
        return useDesktop('media', { action: 'volume_up', amount: 6 }, () => ({ reply: 'Volume up.' }));
      }
      if (/volume down|awaaz kam|awaaz dheemi/.test(t)) {
        return useDesktop('media', { action: 'volume_down', amount: 6 }, () => ({ reply: 'Volume down.' }));
      }
      const level = Number(m[1]);
      if (!Number.isFinite(level)) return null;
      return useDesktop('set_volume', { level }, (result) => ({ reply: `Volume set to about ${result.level}%.` }));
    },
  },
  {
    id: 'media-keys',
    name: 'PLAYBACK',
    desc: 'Pause or skip the track',
    re: /^(?:pause|resume|toggle (?:play|playback))(?: (?:the )?(?:music|song|video|playback))?$|^(?:next|previous|skip)(?: (?:track|song|video))?$/i,
    run: (m, text) => {
      const t = text.toLowerCase();
      const action = /next|skip/.test(t) ? 'next' : /previous|prev/.test(t) ? 'previous' : 'play_pause';
      return useDesktop('media', { action }, () => ({
        reply: action === 'play_pause' ? 'Toggled playback.' : action === 'next' ? 'Skipped forward.' : 'Went back a track.',
      }));
    },
  },
  {
    id: 'lock',
    name: 'SECURITY',
    desc: 'Lock the screen',
    re: /\block (?:the |my )?(?:pc|computer|screen|windows|machine)\b|\block it\b/i,
    run: () => useDesktop('lock_screen', {}, () => ({ reply: 'Screen locked.' })),
  },
  {
    id: 'power',
    name: 'POWER',
    desc: 'Shut down, restart or sleep',
    re: /^(?:please )?(?:shut ?down|restart|reboot|hibernate|sleep|log ?off|sign ?out|cancel (?:the )?shutdown|turn off (?:the )?(?:monitors?|screen|display))\b/i,
    run: (m, text) => {
      const t = text.toLowerCase();
      const action = /cancel/.test(t)
        ? 'cancel'
        : /restart|reboot/.test(t)
          ? 'restart'
          : /hibernate/.test(t)
            ? 'hibernate'
            : /log ?off|sign ?out/.test(t)
              ? 'logoff'
              : /sleep/.test(t)
                ? 'sleep'
                : /monitor|screen|display/.test(t)
                  ? 'monitors_off'
                  : 'shutdown';
      const replies = {
        cancel: 'Shutdown cancelled.',
        restart: 'Restarting in 30 seconds. Say “cancel shutdown” to stop it.',
        hibernate: 'Hibernating now.',
        logoff: 'Logging out.',
        sleep: 'Going to sleep now.',
        monitors_off: 'Monitors off — move the mouse to wake them.',
        shutdown: 'Shutting down in 30 seconds. Say “cancel shutdown” to stop it.',
      };
      return useDesktop('power', { action }, () => ({ reply: replies[action] }));
    },
  },
  {
    id: 'windows',
    name: 'WINDOWS',
    desc: 'Arrange the desktop',
    re: /^(?:minimi[sz]e all|show desktop|switch window|close (?:this )?window|maximi[sz]e (?:this )?window|minimi[sz]e (?:this )?window|task view)$/i,
    run: (m, text) => {
      const t = text.toLowerCase();
      const action = /minimi[sz]e all/.test(t)
        ? 'minimize_all'
        : /show desktop/.test(t)
          ? 'show_desktop'
          : /switch/.test(t)
            ? 'switch_window'
            : /close/.test(t)
              ? 'close_window'
              : /maximi/.test(t)
                ? 'maximize'
                : /minimi/.test(t)
                  ? 'minimize'
                  : 'task_view';
      return useDesktop('window_control', { action }, () => ({ reply: `${action.replace(/_/g, ' ')} done.` }));
    },
  },
  {
    id: 'keys',
    name: 'KEYBOARD',
    desc: 'Copy, paste, save, undo',
    re: /^(?:press )?(copy|paste|cut|undo|redo|select all|save|find|new tab|close tab|reopen tab|next tab|refresh page|fullscreen|enter|escape|page down|page up|print|zoom in|zoom out)$/i,
    run: (m) => {
      const key = m[1].toLowerCase().replace(/\s+/g, '_').replace('refresh_page', 'refresh');
      return useDesktop('press_keys', { keys: key }, () => ({ reply: `${key.replace(/_/g, ' ')} sent to the active window.` }));
    },
  },
  {
    id: 'desktops',
    name: 'WORKSPACES',
    desc: 'Virtual desktops',
    re: /^(?:new desktop|next desktop|previous desktop|switch desktop|close desktop)$/i,
    run: (m, text) => {
      const t = text.toLowerCase();
      const action = /new/.test(t) ? 'new' : /close/.test(t) ? 'close' : /next|switch/.test(t) ? 'right' : 'left';
      return useDesktop('virtual_desktop', { action }, () => ({
        reply: action === 'left' ? 'Moved to the previous desktop.' : action === 'right' ? 'Moved to the next desktop.' : `${action} desktop done.`,
      }));
    },
  },
  {
    id: 'popup',
    name: 'ALERT',
    desc: 'Show a Windows popup',
    re: /^(?:show|display|pop up)\s+(?:a\s+)?(?:message|alert|popup|notification)\s*[:,-]?\s*(.{2,300})$/i,
    run: (m) => useDesktop('message_box', { text: m[1] }, () => ({ reply: 'Message shown on your desktop.' })),
  },
  {
    id: 'make-folder',
    name: 'FILES',
    desc: 'Create a folder',
    re: /^(?:make|create|new)\s+(?:a\s+)?(?:folder|directory)\s+(?:called\s+|named\s+)?(.{1,80})$/i,
    run: (m) => useDesktop('make_folder', { name: m[1] }, (result) => ({ reply: result.message })),
  },
  {
    id: 'create-file',
    name: 'FILES',
    desc: 'Create a text file',
    re: /^(?:make|create|new)\s+(?:a\s+)?(?:text\s+)?file\s+(?:called\s+|named\s+)?(.{1,80})$/i,
    run: (m) => useDesktop('create_file', { name: m[1], where: 'desktop' }, (result) => ({ reply: result.message })),
  },
  {
    id: 'type-text',
    name: 'KEYBOARD',
    desc: 'Type into the active app',
    re: /^(?:type|write|likho)\s*(?:this)?\s*[:,-]?\s*["“]?(.{2,240}?)["”]?$/i,
    run: (m) =>
      useDesktop('type_text', { text: m[1].replace(/^["“]|["”]$/g, '') }, (result) => ({
        reply: `Typed ${result.chars} characters into the active window.`,
      })),
  },
  {
    id: 'recycle',
    name: 'FILES',
    desc: 'Send a file to the Recycle Bin',
    re: /^(?:delete|recycle|trash)\s+(?:the\s+)?(?:file\s+)?(.{2,120})$/i,
    run: async (m) => {
      if (!isDesktop()) return desktopOnly();
      const found = await pcRun('find_files', { query: m[1] });
      if (!found.paths.length) return { reply: `I could not find “${m[1]}” in your Desktop, Documents, Downloads or Seas_Files folders.` };
      const exact = found.paths.find((item) => item.toLowerCase().endsWith(m[1].toLowerCase())) || found.paths[0];
      const result = await pcRun('delete_file', { path: exact });
      return { reply: `${result.message}${found.paths.length > 1 ? ` (${found.paths.length} matches, used the closest one)` : ''}` };
    },
  },
  {
    id: 'news',
    name: 'NEWS',
    desc: "Today's headlines",
    re: /\b(?:news|headlines|khabar(?:ein)?|akhbar)\b/i,
    run: async () => {
      if (!isDesktop()) return null;
      const items = await pcNews(6);
      if (!items.length) return null;
      return { reply: `Right now:\n${items.map((item, i) => `${i + 1}. ${item.title}`).join('\n')}` };
    },
  },
  {
    id: 'weather',
    name: 'WEATHER',
    desc: 'Check the weather',
    re: /\b(weather|mausam|temperature|forecast)\b(?:.*?\b(?:in|of|for)\s+([\w .'-]{2,40}))?/i,
    run: (m) => {
      const city = (m[1] || '').trim();
      const url = `https://www.google.com/search?q=weather+${encodeURIComponent(city)}`;
      openUrl(url);
      return {
        reply: city
          ? `Pulling live conditions for ${city} — the weather panel is open.`
          : 'Opening live weather for your region.',
        url,
      };
    },
  },
  {
    id: 'whatsapp',
    name: 'MESSAGING',
    desc: 'Draft a WhatsApp message',
    re: /\b(?:whatsapp|message)\s+(\+?\d[\d\s-]{6,16})\s*(?:saying|saying:|that|:)?\s*(.*)$/i,
    run: (m) => {
      const digits = m[1].replace(/\D/g, '');
      const text = (m[2] || 'Hey!').trim();
      const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      openUrl(url);
      return { reply: `Draft ready for +${digits}. Press send inside WhatsApp when you are happy with it.`, url };
    },
  },
  {
    id: 'joke',
    name: 'HUMOUR',
    desc: 'Tell a joke',
    re: /\b(joke|hasao|make me laugh|something funny)\b/i,
    run: () => ({ reply: JOKES[Math.floor(Math.random() * JOKES.length)] }),
  },
  {
    id: 'random',
    name: 'RANDOM',
    desc: 'Coin, dice, numbers',
    re: /\b(flip a coin|coin flip|toss a coin|roll (a )?(dice|die)|random number)\b/i,
    run: (m) => {
      const t = m[0].toLowerCase();
      if (t.includes('coin')) return { reply: `The coin lands on ${Math.random() < 0.5 ? 'heads' : 'tails'}.` };
      if (t.includes('dice') || t.includes('die')) return { reply: `You rolled a ${1 + Math.floor(Math.random() * 6)}.` };
      return { reply: `Random draw: ${1 + Math.floor(Math.random() * 100)}.` };
    },
  },
  {
    id: 'clear',
    name: 'CORE',
    desc: 'Reset the session',
    re: /^(?:clear (?:the )?(chat|conversation)|reset (?:the )?core|start over)$/i,
    run: (_m, _t, ctx) => {
      ctx?.clearChat?.();
      return { reply: 'Transcript cleared. Memory core untouched.' };
    },
  },
  {
    id: 'forget',
    name: 'CORE',
    desc: 'Wipe memory',
    re: /^(?:forget everything|wipe memory|clear memory|delete (?:all )?memories)$/i,
    run: (_m, _t, ctx) => {
      wipeMemories();
      ctx?.refreshMemory?.();
      return { reply: 'Memory core wiped. We start from a blank slate.' };
    },
  },
  {
    id: 'sleep',
    name: 'CORE',
    desc: 'Stand down',
    re: /^(?:goodbye|bye|good night|band ho jao)$/i,
    run: () => ({ reply: 'Standing by. Say my name when you need me.', sleep: true }),
  },
];

/* ───────────── dispatcher ───────────── */
export async function runSkill(text, ctx) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const skill of SKILLS) {
    const m = t.match(skill.re);
    if (!m) continue;
    try {
      const out = await skill.run(m, t, ctx);
      if (out && out.reply) return { ...out, skill: skill.id };
    } catch (err) {
      console.warn('[stonic] skill failed', skill.id, err);
    }
  }
  return null;
}

export { searchMemories };
