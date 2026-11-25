/* ════════════════════════════════════════════
   telemetry.js — real device telemetry for the HUD
   frame pacing · js heap · network round trip
   ════════════════════════════════════════════ */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const MB = 1024 * 1024;

export function createTelemetry({ pingUrl = 'assets/favicon.svg', pingEvery = 4000 } = {}) {
  let raf = 0;
  let timer = 0;
  let last = 0;
  let frameMs = 16.7;
  let frames = 0;
  let fps = 60;
  let lagMs = 0;
  let expectedAt = 0;
  let started = 0;
  let bootAt = 0;
  let rtt = null;
  let pingedAt = 0;
  let busy = false;

  const loop = (t) => {
    if (last) {
      const delta = t - last;
      frameMs = frameMs * 0.88 + delta * 0.12;
      frames++;
    }
    last = t;
    raf = requestAnimationFrame(loop);
  };

  async function ping() {
    if (busy) return;
    busy = true;
    const t0 = performance.now();
    try {
      await fetch(`${pingUrl}?t=${Date.now()}`, { cache: 'no-store' });
      rtt = Math.max(1, Math.round(performance.now() - t0));
    } catch {
      rtt = null;
    }
    pingedAt = Date.now();
    busy = false;
  }

  function heap() {
    const mem = performance.memory;
    if (!mem || !mem.jsHeapSizeLimit) return null;
    return {
      used: mem.usedJSHeapSize / MB,
      total: mem.totalJSHeapSize / MB,
      limit: mem.jsHeapSizeLimit / MB,
      ratio: clamp((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100, 0, 100),
    };
  }

  function snapshot() {
    const uptime = bootAt ? (Date.now() - bootAt) / 1000 : 0;
    const h = heap();
    const online = navigator.onLine;
    return {
      load: clamp(Math.round(lagMs * 12), 0, 100),
      lagMs: Number(lagMs.toFixed(1)),
      frameMs: Number(frameMs.toFixed(1)),
      fps: Math.round(fps),
      heap: h,
      memLabel: h
        ? `${h.used.toFixed(0)} MB`
        : navigator.deviceMemory
          ? `${navigator.deviceMemory} GB device`
          : 'n/a',
      memRatio: h ? h.ratio : null,
      rtt: online ? rtt : null,
      online,
      cores: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      uptime,
      uptimeLabel: `${String(Math.floor(uptime / 60)).padStart(2, '0')}:${String(Math.floor(uptime % 60)).padStart(2, '0')}`,
      pingedAt,
    };
  }

  function sample() {
    if (started) {
      fps = (frames * 1000) / Math.max(1, Date.now() - started);
      frames = 0;
      started = Date.now();
    }
    return snapshot();
  }

  return {
    start(onTick) {
      if (started) {
        if (onTick) onTick(snapshot());
        return;
      }
      started = Date.now();
      bootAt = started;
      frames = 0;
      raf = requestAnimationFrame(loop);
      clearInterval(timer);
      expectedAt = Date.now() + 1000;
      timer = setInterval(() => {
        const now = Date.now();
        lagMs = lagMs * 0.55 + Math.max(0, now - expectedAt) * 0.45;
        expectedAt = now + 1000;
        const s = sample();
        if (Date.now() - pingedAt > pingEvery) ping();
        onTick?.(s);
      }, 1000);
      ping();
      onTick?.(snapshot());
    },
    stop() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      raf = 0;
      timer = 0;
      started = 0;
    },
    snapshot,
    ping,
  };
}
