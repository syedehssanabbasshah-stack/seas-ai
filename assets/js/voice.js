/* ════════════════════════════════════════════
   voice.js — speech out (TTS) + speech in (STT)
   ════════════════════════════════════════════ */

import { state } from './state.js';

const synth = window.speechSynthesis || null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

/* ───────────────────────── TTS ───────────────────────── */

const MALE = /(male|daniel|david|guy|ryan|alex|aaron|arthur|fred|oliver|george|james|mark|tom|microsoft (david|guy|mark|ryan|george)|google uk english male)/i;
const FEMALE = /(female|samantha|victoria|karen|moira|tessa|fiona|serena|zira|susan|ava|jenny|aria|libby|sonia|natasha|hazel|microsoft (zira|hazel|aria|jenny|sonia|libby|natasha)|google uk english female|google us english)/i;

let cachedVoices = [];

function refreshVoices() {
  if (!synth) return [];
  cachedVoices = synth.getVoices().filter((v) => /^en/i.test(v.lang) || /^ur/i.test(v.lang));
  if (!cachedVoices.length) cachedVoices = synth.getVoices();
  return cachedVoices;
}

if (synth) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

export function voices() {
  return cachedVoices.length ? cachedVoices : refreshVoices();
}

export function defaultVoice() {
  const all = voices();
  if (!all.length) return null;

  const exact = state.voiceURI && all.find((v) => v.voiceURI === state.voiceURI);
  if (exact) return exact;

  const wantFemale = state.gender === 'female';
  const match = wantFemale ? FEMALE : MALE;
  const mismatch = wantFemale ? MALE : FEMALE;

  return (
    all.find((v) => /^en/i.test(v.lang) && match.test(v.name) && !mismatch.test(v.name)) ||
    all.find((v) => match.test(v.name) && !mismatch.test(v.name)) ||
    all.find((v) => /^en/i.test(v.lang)) ||
    all[0]
  );
}

/* ElevenLabs studio voice: male Adam / female Rachel unless a custom ID is set */
const ELEVEN_MALE = 'pNInz6obpgDQGcFmaJgB';
const ELEVEN_FEMALE = '21m00Tcm4TlvDq8ikWAM';

let currentAudio = null;
let speakGen = 0;

export const tts = {
  supported: Boolean(synth),
  speaking: false,
  lastError: '',

  cancel() {
    speakGen++;
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.src = ''; } catch { /* noop */ }
      currentAudio = null;
    }
    if (!synth) return;
    synth.cancel();
    this.speaking = false;
  },

  /** speak(text) → Promise resolved when speech ends (or immediately if muted). */
  speak(text, { onStart, onEnd, onError } = {}) {
    const clean = String(text || '')
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/[*_#`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || !state.speak) return Promise.resolve();
    if (state.elevenKey) {
      return this.speakEleven(clean, { onStart, onEnd }).catch((err) => {
        this.speaking = false;
        this.lastError = `studio voice unavailable (${err?.message || 'request failed'}) — using system voice`;
        onError?.(this.lastError);
        return this.speakSystem(clean, { onStart, onEnd });
      });
    }
    return this.speakSystem(clean, { onStart, onEnd });
  },

  speakEleven(text, { onStart, onEnd } = {}) {
    const gen = speakGen;
    const voiceId =
      String(state.elevenVoice || '').trim() ||
      (state.gender === 'female' ? ELEVEN_FEMALE : ELEVEN_MALE);

    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': state.elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 900),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true },
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            if (gen !== speakGen) {
              resolve();
              return;
            }
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            currentAudio = audio;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              this.speaking = false;
              currentAudio = null;
              URL.revokeObjectURL(url);
              onEnd?.();
              resolve();
            };
            audio.onplay = () => {
              this.speaking = true;
              onStart?.();
            };
            audio.onended = finish;
            audio.onerror = () => {
              finish();
              reject(new Error('audio playback failed'));
            };
            audio.play().catch((err) => {
              finish();
              reject(err);
            });
          })
      );
  },

  speakSystem(text, { onStart, onEnd } = {}) {
    return new Promise((resolve) => {
      const clean = text;
      if (!synth || !clean || !state.speak) {
        resolve();
        return;
      }

      synth.cancel();
      const u = new SpeechSynthesisUtterance(clean.slice(0, 600));
      const v = defaultVoice();
      if (v) u.voice = v;
      u.rate = Number(state.rate) || 1;
      u.pitch = Number(state.pitch) || 1;
      u.volume = 1;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.speaking = false;
        onEnd?.();
        resolve();
      };

      u.onstart = () => {
        this.speaking = true;
        onStart?.();
      };
      u.onend = finish;
      u.onerror = finish;

      // Some browsers never fire onend without a nudge; guard with a timer.
      const guess = Math.max(2200, (clean.split(' ').length / 2.6) * 1000);
      setTimeout(() => { if (this.speaking) finish(); }, guess + 14000);

      synth.speak(u);
    });
  },
};

/* ───────────────────────── STT ───────────────────────── */

export const stt = {
  supported: Boolean(SR),
  active: false,
  _rec: null,
  _mode: 'command',
  _onResult: null,
  _onState: null,
  _manualStop: false,

  get mode() {
    return this._mode;
  },

  start({ mode = 'command', onResult, onState } = {}) {
    if (!SR) return false;
    tts.cancel();

    this._mode = mode;
    this._onResult = onResult || this._onResult;
    this._onState = onState || this._onState;
    this._manualStop = false;

    try { this._rec?.abort(); } catch { /* noop */ }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = mode === 'wake';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.active = true;
      this._onState?.('listening');
    };

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = (last?.[0]?.transcript || '').trim();
      if (!text) return;
      this._onResult?.(text, last.isFinal);
      if (mode === 'command') this.stop();
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this._onState?.('blocked', e.error);
      } else if (e.error === 'no-speech') {
        this._onState?.('silent', e.error);
      } else if (e.error !== 'aborted') {
        this._onState?.('error', e.error);
      }
    };

    rec.onend = () => {
      this.active = false;
      this._onState?.('ended');
      if (mode === 'wake' && !this._manualStop) {
        // keep the wake listener alive
        setTimeout(() => { if (this._mode === 'wake' && !this.active) this.start({ mode: 'wake' }); }, 600);
      }
    };

    this._rec = rec;
    try {
      rec.start();
      return true;
    } catch {
      return false;
    }
  },

  stop() {
    this._manualStop = true;
    try { this._rec?.stop(); } catch { /* noop */ }
    this.active = false;
  },
};
