/* ════════════════════════════════════════════
   character.js — the visual core
   orb / starfield / waveform, all canvas
   ════════════════════════════════════════════ */

const TAU = Math.PI * 2;

const PALETTE = {
  idle: { a: '#35f0ff', b: '#7c5cff', glow: 'rgba(53,240,255,0.55)' },
  listening: { a: '#4dffa8', b: '#35f0ff', glow: 'rgba(77,255,168,0.6)' },
  thinking: { a: '#b58cff', b: '#35f0ff', glow: 'rgba(181,140,255,0.6)' },
  speaking: { a: '#8ff8ff', b: '#35f0ff', glow: 'rgba(143,248,255,0.75)' },
  sleep: { a: '#2a5366', b: '#22374d', glow: 'rgba(42,83,102,0.4)' },
};

/* ═══════════════ ORB ═══════════════ */

export class Orb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'idle';
    this.amp = 0.18;
    this.target = 0.18;
    this.t = 0;
    this.rotation = 0;
    this.particles = Array.from({ length: 46 }, () => ({
      a: Math.random() * TAU,
      r: 0.52 + Math.random() * 0.44,
      s: 0.0012 + Math.random() * 0.0032,
      size: 0.6 + Math.random() * 1.8,
      o: 0.25 + Math.random() * 0.6,
    }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = this.canvas.clientWidth || 420;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  setMode(mode) {
    this.mode = mode in PALETTE ? mode : 'idle';
    this.target =
      mode === 'speaking' ? 1 : mode === 'listening' ? 0.72 : mode === 'thinking' ? 0.45 : mode === 'sleep' ? 0.06 : 0.18;
  }

  _loop() {
    const ctx = this.ctx;
    const s = this.size;
    if (!s) {
      requestAnimationFrame(this._loop);
      return;
    }
    this.t += 0.016;
    this.amp += (this.target - this.amp) * 0.08;
    const talking = this.mode === 'speaking';
    const wobble = talking ? Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 7.3) * 0.07 : 0;
    const amp = Math.max(0.05, this.amp + wobble);
    const pal = PALETTE[this.mode];
    const cx = s / 2;
    const cy = s / 2;
    const baseR = s * 0.26;

    ctx.clearRect(0, 0, s, s);

    /* ambient halo */
    const halo = ctx.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, s * 0.5);
    halo.addColorStop(0, pal.glow.replace('0.55', '0.18').replace('0.6', '0.18').replace('0.75', '0.2').replace('0.4', '0.1'));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, s, s);

    ctx.save();
    ctx.translate(cx, cy);

    /* outer rotating arcs */
    this.rotation += 0.0022 + amp * 0.006;
    for (let ring = 0; ring < 3; ring++) {
      const r = baseR * (1.55 + ring * 0.26);
      const segments = 5 + ring * 3;
      ctx.save();
      ctx.rotate(this.rotation * (ring % 2 ? -1.4 : 1) + ring * 0.7);
      ctx.strokeStyle = ring === 1 ? pal.b : pal.a;
      ctx.globalAlpha = 0.32 - ring * 0.06;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < segments; i++) {
        const start = (i / segments) * TAU;
        const len = (TAU / segments) * (0.22 + amp * 0.25);
        ctx.beginPath();
        ctx.arc(0, 0, r, start, start + len);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* tick ring */
    ctx.save();
    ctx.rotate(-this.rotation * 0.9);
    ctx.strokeStyle = pal.a;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const inner = baseR * 1.28;
      const outer = inner + (i % 6 === 0 ? 7 : 3) + amp * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();

    /* particles */
    for (const p of this.particles) {
      p.a += p.s * (1 + amp * 3);
      const r = baseR * p.r * (1 + Math.sin(this.t * 1.6 + p.a) * 0.02);
      const x = Math.cos(p.a) * r;
      const y = Math.sin(p.a) * r;
      ctx.globalAlpha = p.o * (0.5 + amp * 0.9);
      ctx.fillStyle = pal.a;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* reactive spokes */
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU + this.t * 0.16;
      const bar = (Math.sin(this.t * 4 + i * 0.55) * 0.5 + 0.5) * amp;
      const inner = baseR * 0.94;
      const outer = inner + 4 + bar * 26;
      ctx.strokeStyle = i % 2 ? pal.a : pal.b;
      ctx.globalAlpha = 0.14 + bar * 0.55;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* core body */
    const coreR = baseR * (0.86 + amp * 0.1);
    const grad = ctx.createRadialGradient(-coreR * 0.3, -coreR * 0.35, coreR * 0.1, 0, 0, coreR);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.22, pal.a);
    grad.addColorStop(0.62, pal.b);
    grad.addColorStop(1, 'rgba(3,10,20,0.92)');
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    /* inner shell */
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.72, 0, TAU);
    ctx.stroke();

    /* energy lines inside the core */
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      const y = Math.sin(this.t * (0.8 + i * 0.24) + i * 1.7) * coreR * 0.55;
      ctx.globalAlpha = 0.16 + amp * 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 + amp;
      ctx.beginPath();
      for (let x = -coreR; x <= coreR; x += 6) {
        const yy = y + Math.sin((x / coreR) * 3 + this.t * 3 + i) * (3 + amp * 9);
        x === -coreR ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    /* scanning sweep */
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    const sweep = this.t * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.9, sweep, sweep + 0.5);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
    requestAnimationFrame(this._loop);
  }
}

/* ═══════════════ STARFIELD ═══════════════ */

export class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(220, Math.round((this.w * this.h) / 9000));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      z: 0.2 + Math.random() * 1.1,
      tw: Math.random() * TAU,
    }));
  }

  _loop() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const s of this.stars) {
      s.tw += 0.014 * s.z;
      s.y += 0.055 * s.z;
      if (s.y > h) {
        s.y = -2;
        s.x = Math.random() * w;
      }
      const alpha = 0.16 + (Math.sin(s.tw) * 0.5 + 0.5) * 0.55;
      ctx.globalAlpha = alpha * s.z;
      ctx.fillStyle = s.z > 0.95 ? '#bdf9ff' : '#7fbfd6';
      ctx.fillRect(s.x, s.y, s.z > 0.95 ? 1.6 : 1, s.z > 0.95 ? 1.6 : 1);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(this._loop);
  }
}

/* ═══════════════ WAVEFORM ═══════════════ */

export function createWave(canvas) {
  const ctx = canvas.getContext('2d');
  let t = 0;
  let amp = 0.12;
  let target = 0.12;
  let color = '#35f0ff';

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 44;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size.w = w;
    size.h = h;
  }
  const size = { w: 800, h: 44 };
  fit();
  window.addEventListener('resize', fit);

  function frame() {
    t += 0.03;
    amp += (target - amp) * 0.06;
    const { w, h } = size;
    ctx.clearRect(0, 0, w, h);

    // baseline
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // three layered waves
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      ctx.globalAlpha = 0.55 - layer * 0.14;
      ctx.strokeStyle = layer === 1 ? '#7c5cff' : color;
      ctx.lineWidth = 1.4;
      const phase = layer * 1.9;
      for (let x = 0; x <= w; x += 3) {
        const norm = x / w;
        const envelope = Math.sin(norm * Math.PI);
        const y =
          h / 2 +
          Math.sin(norm * 22 + t * 2.4 + phase) * amp * 15 * envelope +
          Math.sin(norm * 61 - t * 3.6 + phase) * amp * 5 * envelope;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // bars
    const bars = Math.floor(w / 9);
    for (let i = 0; i < bars; i++) {
      const n = Math.sin(i * 0.7 + t * 2) * 0.5 + 0.5;
      const bh = 2 + n * amp * (h * 0.8);
      ctx.globalAlpha = 0.1 + n * 0.34;
      ctx.fillStyle = color;
      ctx.fillRect(i * 9, h / 2 - bh / 2, 2, bh);
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    set(value, hex) {
      target = Math.max(0.05, value);
      if (hex) color = hex;
    },
  };
}

/* ═══════════════ NEBULA ═══════════════ */

const NEBULA_TINT = {
  idle: { a: '233,250,255', b: '96,190,230', c: '38,96,140', glow: 0.55, speed: 1 },
  listening: { a: '226,255,242', b: '96,235,178', c: '30,120,96', glow: 0.62, speed: 1.25 },
  thinking: { a: '240,235,255', b: '158,132,240', c: '66,46,130', glow: 0.6, speed: 1.1 },
  speaking: { a: '245,254,255', b: '120,225,255', c: '44,120,170', glow: 0.9, speed: 1.8 },
  sleep: { a: '180,205,220', b: '58,104,132', c: '20,44,60', glow: 0.3, speed: 0.5 },
};

/** soft swirling energy cloud used inside the core panel */
export class Nebula {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'idle';
    this.t = 0;
    this.energy = 0.45;
    this.target = 0.45;
    this.speed = 1;
    this.puffs = Array.from({ length: 150 }, () => ({
      u: Math.random(),
      spread: (Math.random() - 0.5) * 2,
      size: 0.045 + Math.random() * 0.11,
      o: 0.022 + Math.random() * 0.05,
      sp: 0.0005 + Math.random() * 0.0024,
      tone: Math.floor(Math.random() * 4),
    }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 240;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  setMode(mode) {
    this.mode = mode in NEBULA_TINT ? mode : 'idle';
    this.target =
      mode === 'speaking' ? 1 : mode === 'listening' ? 0.78 : mode === 'thinking' ? 0.6 : mode === 'sleep' ? 0.12 : 0.45;
    this.speed = NEBULA_TINT[this.mode].speed;
  }

  _loop() {
    const ctx = this.ctx;
    const { w, h } = this;
    if (!w || !h) {
      requestAnimationFrame(this._loop);
      return;
    }

    const tint = NEBULA_TINT[this.mode];
    this.t += 0.016 * this.speed;
    this.energy += (this.target - this.energy) * 0.045;

    const e = this.energy;
    const cx = w * 0.5;
    const cy = h * 0.46;
    const base = Math.min(w, h);

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    /* ambient cloud */
    const amb = ctx.createRadialGradient(cx, cy, base * 0.05, cx, cy, base * 0.72);
    amb.addColorStop(0, `rgba(${tint.b},${0.13 + e * 0.1})`);
    amb.addColorStop(0.4, `rgba(${tint.c},${0.12 + e * 0.1})`);
    amb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, w, h);

    /* rising smoke puffs */
    for (const p of this.puffs) {
      p.u += p.sp * (0.3 + e);
      if (p.u > 1) p.u -= 1;
      const u = p.u;
      const x =
        cx +
        p.spread * base * (0.06 + u * 0.24) +
        Math.sin(u * 4 + p.spread * 4 + this.t * 0.5) * base * 0.05;
      const y =
        cy + base * 0.3 - u * base * 0.58 + Math.sin(u * 5.2 + this.t * 0.7) * base * 0.07;
      const r = base * p.size * (0.7 + e * 0.6);
      const color = p.tone === 0 ? tint.a : p.tone === 1 ? tint.b : p.tone === 2 ? tint.c : '255,255,255';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${p.o * (0.45 + e)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    /* blurred wisps */
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.shadowColor = `rgba(${tint.b},0.5)`;
    for (let i = 0; i < 5; i++) {
      const ph = this.t * (0.3 + i * 0.05) + i * 1.9;
      const len = base * (0.26 + (i % 3) * 0.08);
      const x0 = cx + Math.cos(ph) * base * 0.04;
      const y0 = cy - base * 0.02 + Math.sin(ph * 0.7) * base * 0.04;
      ctx.shadowBlur = 14 + e * 12;
      ctx.strokeStyle = `rgba(${i % 2 ? tint.b : tint.a},${0.03 + e * 0.05})`;
      ctx.lineWidth = 3 + (i % 3) * 2 + e * 2.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + base * 0.28);
      ctx.bezierCurveTo(
        x0 - len * 0.45, y0 + base * 0.08,
        x0 + len * 0.5, y0 - base * 0.1,
        x0 + Math.sin(ph * 0.5) * base * 0.12, y0 - base * 0.24
      );
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    /* hot core */
    const coreR = base * (0.11 + e * 0.05);
    const core = ctx.createRadialGradient(cx, cy - base * 0.03, 0, cx, cy - base * 0.03, coreR * 2.6);
    core.addColorStop(0, `rgba(255,255,255,${tint.glow * (0.26 + e * 0.34)})`);
    core.addColorStop(0.2, `rgba(${tint.a},${0.26 * tint.glow * (0.4 + e)})`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy - base * 0.03, coreR * 2.4, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(this._loop);
  }
}
