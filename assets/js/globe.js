/* ════════════════════════════════════════════
   globe.js — the dotted world in YOUR WORLD
   orthographic dot-matrix earth, slowly rotating
   ════════════════════════════════════════════ */

const TAU = Math.PI * 2;

/* coarse continent outlines: [lon, lat] */
const LAND = [
  /* north america */
  [[-168, 65], [-150, 70], [-132, 70], [-110, 70], [-92, 73], [-72, 70], [-58, 60], [-55, 48], [-66, 45], [-71, 41],
   [-76, 35], [-81, 25], [-92, 29], [-97, 26], [-105, 22], [-113, 29], [-123, 39], [-127, 49], [-135, 58], [-150, 60]],
  /* greenland */
  [[-45, 60], [-22, 68], [-26, 80], [-48, 82], [-58, 76], [-55, 66]],
  /* south america */
  [[-81, 8], [-70, 11], [-60, 8], [-50, 0], [-35, -6], [-38, -22], [-48, -33], [-58, -38], [-66, -45], [-73, -52],
   [-75, -42], [-72, -25], [-70, -18], [-78, -5], [-81, 8]],
  /* africa */
  [[-17, 15], [-10, 25], [0, 32], [10, 37], [20, 32], [32, 31], [40, 15], [43, 10], [51, 12], [41, -3], [40, -20],
   [32, -28], [25, -34], [18, -35], [12, -18], [8, 4], [-8, 5]],
  /* europe */
  [[-10, 36], [-9, 44], [-2, 50], [2, 52], [5, 58], [12, 57], [20, 60], [30, 60], [30, 50], [28, 45], [20, 40],
   [15, 38], [5, 43]],
  /* asia */
  [[30, 60], [40, 68], [60, 70], [80, 75], [100, 78], [120, 72], [140, 70], [160, 65], [170, 60], [142, 50],
   [130, 42], [122, 30], [110, 20], [100, 10], [95, 20], [88, 22], [80, 10], [72, 20], [62, 25], [55, 38], [45, 45],
   [35, 45], [30, 50]],
  /* australia */
  [[113, -22], [122, -18], [132, -12], [142, -11], [146, -19], [153, -27], [150, -38], [140, -38], [130, -32],
   [120, -34], [113, -22]],
  /* new zealand */
  [[172, -35], [178, -38], [174, -45], [168, -46], [167, -40]],
  /* japan */
  [[130, 32], [141, 40], [145, 44], [142, 36], [135, 33]],
  /* indonesia */
  [[95, 5], [120, 2], [135, -3], [128, -8], [110, -7], [98, 0]],
];

function inPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildDots() {
  const dots = [];
  for (let lat = -78; lat <= 82; lat += 3) {
    const squeeze = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += 3 / squeeze) {
      if (!LAND.some((poly) => inPoly(lon, lat, poly))) continue;
      dots.push({ lon, lat });
    }
  }
  return dots;
}

function project(lon, lat, rot, cx, cy, R) {
  const la = (lat * Math.PI) / 180;
  const lo = ((lon - rot) * Math.PI) / 180;
  return {
    x: cx + Math.cos(la) * Math.sin(lo) * R,
    y: cy - Math.sin(la) * R,
    z: Math.cos(la) * Math.cos(lo),
  };
}

const MARKERS = [
  { lon: 73.1, lat: 33.7 },
  { lon: -0.1, lat: 51.5 },
  { lon: -74, lat: 40.7 },
  { lon: 151.2, lat: -33.9 },
  { lon: 55.3, lat: 25.2 },
];

export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rot = -0.6;
    this.t = 0;
    this.dots = buildDots();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 220;
    const h = this.canvas.clientHeight || 180;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  _loop() {
    const ctx = this.ctx;
    const { w, h } = this;
    if (!w || !h) {
      requestAnimationFrame(this._loop);
      return;
    }

    this.t += 0.016;
    this.rot += 0.0055;

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;

    ctx.clearRect(0, 0, w, h);

    /* atmosphere */
    const glow = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R * 1.55);
    glow.addColorStop(0, 'rgba(42, 150, 190, 0.16)');
    glow.addColorStop(0.55, 'rgba(28, 104, 140, 0.09)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.55, 0, TAU);
    ctx.fill();

    /* sphere rim */
    ctx.strokeStyle = 'rgba(70, 200, 230, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    /* graticule */
    ctx.fillStyle = 'rgba(70, 190, 220, 0.20)';
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4) {
        const p = project(lon, lat, this.rot, cx, cy, R);
        if (p.z < 0.02) continue;
        ctx.globalAlpha = 0.12 + p.z * 0.16;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -78; lat <= 82; lat += 4) {
        const p = project(lon, lat, this.rot, cx, cy, R);
        if (p.z < 0.02) continue;
        ctx.globalAlpha = 0.1 + p.z * 0.14;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }

    /* land dots */
    for (const dot of this.dots) {
      const p = project(dot.lon, dot.lat, this.rot, cx, cy, R);
      if (p.z <= 0.02) continue;
      ctx.globalAlpha = 0.2 + p.z * 0.72;
      ctx.fillStyle = p.z > 0.55 ? '#8df4ff' : '#4ecbe8';
      const size = p.z > 0.8 ? 1.35 : 1.05;
      ctx.fillRect(p.x, p.y, size, size);
    }

    /* markers */
    for (const m of MARKERS) {
      const p = project(m.lon, m.lat, this.rot, cx, cy, R);
      if (p.z <= 0.05) continue;
      const pulse = (Math.sin(this.t * 1.6 + m.lon) * 0.5 + 0.5) * 0.5 + 0.5;
      ctx.globalAlpha = 0.25 * p.z;
      ctx.strokeStyle = '#7ff0ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 + pulse * 5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.95 * p.z;
      ctx.fillStyle = '#d8fbff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(this._loop);
  }
}
