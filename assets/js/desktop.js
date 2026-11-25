/* ══════════════════════════════════════════════
   desktop.js — bridge to the Electron PC layer
   In a plain browser every call reports that the
   desktop build is needed, so the skills stay honest.
   ══════════════════════════════════════════════ */

const bridge = () => (typeof window !== 'undefined' ? window.seasDesktop || null : null);

export function isDesktop() {
  return Boolean(bridge()?.pc);
}

/** Run one named desktop tool. Resolves to its result, throws a readable error. */
export async function pcRun(tool, args = {}) {
  const api = bridge()?.pc;
  if (!api) throw new Error('Desktop control needs the Seas AI PC app');
  const reply = await api.run(tool, args);
  if (!reply || !reply.ok) throw new Error(reply?.error || 'The desktop tool failed');
  return reply.result;
}

export async function pcNews(limit = 6) {
  const api = bridge()?.pc;
  if (!api) return [];
  const reply = await api.run('news', { limit });
  if (!reply?.ok) return [];
  return reply.result?.items || [];
}
