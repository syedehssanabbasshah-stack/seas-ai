/* ══════════════════════════════════════════════
   brain.js — reasoning layer
   1. deterministic skills
   2. remote engine (any OpenAI-compatible endpoint)
   3. local core fallback (always available)
   ══════════════════════════════════════════════ */

import { state, persona } from './state.js';
import { runSkill } from './skills.js';
import { searchMemories, listMemories } from './memory.js';
import { isDesktop } from './desktop.js';

let engineNoteShown = false;

/* ───────────────────────── system prompt ───────────────────────── */

function systemPrompt() {
  const p = persona();
  const mems = listMemories().slice(0, 12).map((m) => `- ${m.text}`).join('\n');
  return [
    `You are SEAS AI, a sci-fi desktop intelligence living inside the user's desktop.`,
    `Personality: ${p.style}`,
    `Voice: your words are spoken aloud by a speech engine, so write natural sentences — no markdown, no bullet symbols, no code fences unless explicitly asked.`,
    `Keep most answers to one to three sentences. Be specific and useful; skip filler and disclaimers.`,
    isDesktop()
      ? `You run inside the Seas AI PC app on ${navigator.platform || 'this computer'} and can really act on it: open and close apps, set the volume and send media keys, take screenshots (they appear in the transcript), find and read files, create folders and files, type into the active window, press shortcuts, arrange windows and virtual desktops, show a message box, lock, sleep or shut down. The skill matrix performs these actions, so never claim a result you did not get back.`
      : `You already have working local skills: opening sites, YouTube playback, web search, maths, timers, notes and to-dos, memory storage and device reports. Never claim to control the operating system, files, or installed apps — this build runs in a browser.`,
    `If the user writes in Urdu or Roman Urdu, answer in the same language.`,
    `Current local time: ${new Date().toLocaleString()}.`,
    mems ? `Things you remember about the user:\n${mems}` : `You have no stored memories about the user yet.`,
  ].join('\n');
}

/* ───────────────────────── remote engine ───────────────────────── */

async function remoteReply(text, history) {
  const base = (state.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('no endpoint');
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history
      .slice(-14)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: text },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({
        model: state.model || 'gpt-4o-mini',
        messages,
        temperature: 0.85,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} ${detail.slice(0, 160)}`.trim());
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('empty completion');
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── local core ───────────────────────── */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TOPICS = [
  {
    re: /\b(code|coding|program|bug|javascript|python|react|css|html|api|developer)\b/i,
    lines: [
      'Break it into the smallest failing case first — a bug you can reproduce in ten lines is already half solved.',
      'Read the error from the bottom up: the last frame is almost always the truth, everything above it is context.',
      'Name things for what they do, not how they work; future-you reads the names before the code.',
    ],
  },
  {
    re: /\b(study|exam|learn|school|college|university|test|assignment)\b/i,
    lines: [
      'Short, active recall beats long passive reading — close the notes and say it out loud instead.',
      'One topic per sitting, then a five-minute gap. The gap is where it actually sticks.',
      'Write the summary you would want to read tomorrow; if you cannot, that is the part to revisit.',
    ],
  },
  {
    re: /\b(business|startup|client|customer|money|pricing|sell|product)\b/i,
    lines: [
      'Talk to five real users before writing a sixth feature. Their words are the spec.',
      'Price on the value delivered, not the hours spent. Hours are a cost; value is a number the buyer repeats.',
      'Ship the smallest version someone would pay for, then let complaints choose your roadmap.',
    ],
  },
  {
    re: /\b(design|ui|ux|visual|colour|font|layout)\b/i,
    lines: [
      'Hierarchy first: one thing loud, two things quiet, everything else silent.',
      'Pick two typefaces and one accent colour, then refuse to add a third.',
      'Spacing separates; boxes only decorate. Try removing the border before adding one.',
    ],
  },
  {
    re: /\b(health|sleep|tired|stress|anxiety|gym|workout|diet)\b/i,
    lines: [
      'The boring interventions win: sleep on a fixed schedule, walk after eating, drink water before coffee.',
      'If your head is loud, lower the input — screens, noise, caffeine — before you try to think harder.',
      'Small and daily beats heroic and rare. Aim for the version you can repeat on a bad day.',
    ],
  },
  {
    re: /\b(ai|model|llm|prompt|machine learning|neural|gpt|claude)\b/i,
    lines: [
      'Context beats cleverness. A model with the right three facts outperforms a smarter model guessing.',
      'Put the instruction last and the data first; most prompt failures are retrieval failures.',
      'Measure on your own ten examples before trusting anyone’s benchmark.',
    ],
  },
  {
    re: /\b(music|song|guitar|piano|beat|produce)\b/i,
    lines: [
      'Learn the song you love end to end — finish one thing and the technique follows.',
      'Slow it down until it is boringly accurate, then bring the tempo back. Speed is a side effect.',
      'Record everything. The take you almost deleted is usually the one.',
    ],
  },
  {
    re: /\b(travel|trip|flight|visa|tour|holiday)\b/i,
    lines: [
      'Book the first night and the last night; everything in the middle is negotiable.',
      'Put one unplanned day in every three. That is where the trip actually happens.',
      'Carry half of what you first laid out. You will not miss it.',
    ],
  },
  {
    re: /\b(friend|family|love|relationship|marriage|rishta)\b/i,
    lines: [
      'Say the thing plainly and early. Most distance is built from small, unpractised honesty.',
      'Ask one more question than feels polite; that is usually where people actually are.',
      'You cannot optimise another person. You can only choose what you keep showing up for.',
    ],
  },
];

function localCore(text) {
  const p = persona();
  const t = text.trim();
  const lower = t.toLowerCase();
  const opener = pick(p.openers);

  if (/\b(who am i|what do you know about me)\b/.test(lower)) {
    const mems = listMemories();
    if (!mems.length) {
      return 'Nothing yet — the memory core is empty. Say “remember that …” and I will keep it on this device.';
    }
    return `Here is what I hold:\n${mems.slice(0, 6).map((m) => `• ${m.text}`).join('\n')}`;
  }

  const remembered = searchMemories(t);
  if (remembered.length && /\b(remember|recall|you know|kya yaad)\b/.test(lower)) {
    return `I do. ${remembered[0]}.`;
  }

  const topic = TOPICS.find((x) => x.re.test(lower));
  if (topic) {
    return `${opener} ${pick(topic.lines)}`;
  }

  if (/^(why|how|what|who|when|where|which|should|can|could|would|is|are|do|does)\b/.test(lower) || /\?$/.test(t)) {
    const notes = [
      'I can reason this through properly once an AI engine is connected in SYSTEM — right now I am running on the local core, which is fast, private and a little blunt.',
      'That one deserves a better answer than my offline rules can give. Add an engine endpoint in SYSTEM and ask me again.',
      'Locally I cannot research that. My skills are deterministic — open, play, search, calculate, remember. Point me at an AI endpoint and I will actually think.',
    ];
    if (!engineNoteShown) engineNoteShown = true;
    return `${opener} ${pick(notes)}`;
  }

  const generic = [
    'I am listening. Give me a little more and I will work with it.',
    'Noted. What would you like me to do with that?',
    'Understood. Want me to open something, note it, or just keep talking?',
  ];
  return `${opener} ${pick(generic)}`;
}

/* ───────────────────────── entry point ───────────────────────── */

/**
 * respond(userText, ctx) → { reply, say, skill?, url?, meta? }
 * ctx: { history, timer, clearChat, refreshMemory, notify }
 */
export async function respond(text, ctx = {}) {
  const t0 = performance.now();

  const skill = await runSkill(text, ctx);
  if (skill) {
    return { ...skill, ms: Math.round(performance.now() - t0), source: 'skill' };
  }

  if (state.apiKey) {
    try {
      const reply = await remoteReply(text, ctx.history || []);
      return { reply, ms: Math.round(performance.now() - t0), source: 'engine' };
    } catch (err) {
      const msg = String(err?.message || err);
      const blocked = /Failed to fetch|NetworkError|aborted|CORS/i.test(msg);
      return {
        reply: blocked
          ? `${localCore(text)}\n\n(Engine unreachable — the endpoint may block browser requests. Try a provider that allows CORS, or check the key and endpoint in SYSTEM.)`
          : `${localCore(text)}\n\n(Engine error: ${msg.slice(0, 140)})`,
        ms: Math.round(performance.now() - t0),
        source: 'local',
        error: msg,
      };
    }
  }

  return { reply: localCore(text), ms: Math.round(performance.now() - t0), source: 'local' };
}
