/* ════════════════════════════════════════════
   local-stt.js — on-device speech-to-text
   Used when the browser/Electron cloud recognizer
   is unavailable. Records with MediaRecorder and
   transcribes with Whisper tiny (transformers.js)
   inside this device; the model is cached after
   the first download.
   ════════════════════════════════════════════ */

const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm';
const MODEL = 'Xenova/whisper-tiny.en';

let pipePromise = null;
let progressCallback = null;

async function getPipeline(onProgress) {
  if (onProgress) progressCallback = onProgress;
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import(/* webpackIgnore: true */ CDN);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline('automatic-speech-recognition', MODEL, {
        dtype: 'q8',
        progress_callback: (p) => {
          if (!progressCallback) return;
          if (p?.status === 'progress' && p.progress != null) {
            progressCallback({ status: 'download', file: p.file || '', pct: Math.round(p.progress) });
          } else if (p?.status === 'ready') {
            progressCallback({ status: 'ready' });
          }
        },
      });
    })().catch((err) => {
      pipePromise = null;
      throw err;
    });
  }
  return pipePromise;
}

async function toMono16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1600, Math.ceil(buffer.duration * 16000));
    const offline = new OfflineAudioContext(1, frames, 16000);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ctx.close?.().catch(() => {});
  }
}

export const localStt = {
  get supported() {
    return Boolean(
      navigator.mediaDevices?.getUserMedia &&
        window.MediaRecorder &&
        (window.AudioContext || window.webkitAudioContext)
    );
  },

  get modelCached() {
    return Boolean(pipePromise);
  },

  recording: false,
  _rec: null,
  _stream: null,
  _chunks: [],

  async start() {
    if (this.recording) return true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const rec = new MediaRecorder(stream);
    this._chunks = [];
    this._stream = stream;
    this._rec = rec;
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size) this._chunks.push(event.data);
    };
    rec.start();
    this.recording = true;
    return true;
  },

  /** stop() → Blob with the recording (or null when it was too short). */
  async stop() {
    if (!this.recording) return null;
    const rec = this._rec;
    const blob = await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(new Blob(this._chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.onstop = finish;
      try {
        rec.stop();
      } catch {
        finish();
      }
      setTimeout(finish, 1500);
    });
    this._stream?.getTracks().forEach((track) => track.stop());
    this._rec = null;
    this._stream = null;
    this.recording = false;
    return blob && blob.size > 1200 ? blob : null;
  },

  async transcribe(blob, onProgress) {
    if (!blob) return '';
    const pipe = await getPipeline(onProgress);
    const audio = await toMono16k(blob);
    // whisper-tiny.en is English-only: passing language/task makes transformers.js throw.
    const result = await pipe(audio, { chunk_length_s: 30 });
    return String(result?.text || '').trim();
  },
};
