// SEAS-AI-AGENT on Cloudflare Pages (one file, "Advanced mode"). Streaming brain on Workers AI + tools + fair-use limits for many users.
// Needs a Workers AI binding named AI (Pages > Settings > Bindings). Everything else is optional.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const FAST = ['@cf/qwen/qwen3-30b-a3b-fp8', '@cf/meta/llama-3.1-8b-instruct-fp8-fast', '@cf/meta/llama-3.3-70b-instruct-fp8-fast']
const SMART = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/qwen/qwen3-30b-a3b-fp8']
const rid = () => Math.random().toString(36).slice(2, 8)
const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => p && p.text ? p.text : p && p.type === 'image_url' ? '[image attached - this brain cannot see images]' : '').filter(Boolean).join('\n') : c == null ? '' : JSON.stringify(c)
const argStr = a => typeof a === 'string' ? a : JSON.stringify(a || {})
const clean = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

/* ---------- CORS / replies ---------- */
const FIXED = /^(app:\/\/nexa|https?:\/\/localhost(:\d+)?|https?:\/\/127\.0\.0\.1(:\d+)?)$/i
function cors(req, env) {
  const o = req.headers.get('origin') || '', extra = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  return o && (FIXED.test(o) || o === new URL(req.url).origin || extra.includes(o)) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Nexa-Code, X-Nexa-Sid', Vary: 'Origin' } : {}
}
const json = (req, env, body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req, env), ...extra } })

/* ---------- fair use: per-user speed limit, daily limit, simultaneous requests, global safety valve ---------- */
const M = { hits: new Map(), day: new Map(), dayKey: '', inflight: new Map(), global: 0, gDay: 0 }
function admit(req, env, cost) {
  const ip = req.headers.get('cf-connecting-ip') || 'local', now = Date.now(), min = Math.floor(now / 60000), day = new Date(now).toISOString().slice(0, 10)
  const perMin = +env.RATE_PER_MIN || 24, perDay = +env.DAILY_PER_IP || 400, gDay = +env.GLOBAL_DAILY || 0, maxIp = +env.MAX_INFLIGHT_PER_IP || 2, maxG = +env.MAX_INFLIGHT_GLOBAL || 60
  if (M.dayKey !== day) { M.dayKey = day; M.day.clear(); M.gDay = 0 }
  if (M.hits.size > 4000) M.hits.clear()
  const k = ip + ':' + min, used = (M.hits.get(k) || 0) + cost
  if (used > perMin) return { ok: false, retry: 60 - Math.floor(now / 1000) % 60, msg: 'You are sending messages very fast. Wait a few seconds and try again.' }
  if ((M.day.get(ip) || 0) + cost > perDay) return { ok: false, retry: 3600, msg: 'Daily fair-use limit reached for your connection. It resets tomorrow.' }
  if (gDay && M.gDay >= gDay) return { ok: false, retry: 3600, msg: "SEAS's free daily capacity is used up. It resets tomorrow." }
  if ((M.inflight.get(ip) || 0) >= maxIp) return { ok: false, retry: 3, msg: 'SEAS is still answering your previous message. Wait a moment.' }
  if (M.global >= maxG) return { ok: false, retry: 5, msg: 'SEAS is busy right now (many users). Try again in a few seconds.' }
  M.hits.set(k, used); M.day.set(ip, (M.day.get(ip) || 0) + cost); M.gDay += cost; M.inflight.set(ip, (M.inflight.get(ip) || 0) + 1); M.global++
  return { ok: true, done: () => { M.inflight.set(ip, Math.max(0, (M.inflight.get(ip) || 1) - 1)); M.global = Math.max(0, M.global - 1) } }
}
const denied = (req, env, a) => json(req, env, { error: a.msg }, 429, { 'Retry-After': String(a.retry) })

/* ---------- web tools (edge-cached) ---------- */
const PRIVATE = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\[?f[cd]|\[?fe80)/i
async function readPage(url) {
  const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) URLs'); if (PRIVATE.test(u.hostname)) throw new Error('local addresses are blocked')
  const r = await fetch(u.href, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('page returned HTTP ' + r.status)
  if (!/text|json|xml|html/i.test(r.headers.get('content-type') || '')) throw new Error('not a text page')
  let t = (await r.text()).slice(0, 1_500_000); const title = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
  t = t.replace(/<(script|style|noscript|svg|header|footer|nav|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, ' '); return ((title ? 'Title: ' + clean(title) + '\n' : '') + clean(t)).slice(0, 8000)
}
async function ddg(q, n = 6) {
  const r = await fetch('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body: 'q=' + encodeURIComponent(q), signal: AbortSignal.timeout(8000) }), h = await r.text(), out = []
  for (const m of h.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) { let u = m[1]; const mm = u.match(/uddg=([^&]+)/); if (mm) u = decodeURIComponent(mm[1]); out.push({ title: clean(m[2]), url: u, snippet: clean(m[3]) }); if (out.length >= n) break }
  return out
}
async function wiki(q) { const j = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=' + encodeURIComponent(q), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })).json(); return ((j.query || {}).search || []).map(s => ({ title: s.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(s.title).replace(/ /g, '_')), snippet: clean(s.snippet || '') })) }
async function cached(key, ttl, fn) {
  const c = typeof caches !== 'undefined' ? caches.default : null, req = new Request('https://nexa-cache.invalid/' + encodeURIComponent(key))
  if (c) { const hit = await c.match(req); if (hit) return hit.json() }
  const v = await fn(); if (c) await c.put(req, new Response(JSON.stringify(v), { headers: { 'Cache-Control': 'public, max-age=' + ttl, 'Content-Type': 'application/json' } })).catch(() => {}); return v
}
async function search(env, query) {
  const q = String(query || '').trim().slice(0, 300); if (!q) throw new Error('empty query')
  return cached('s:' + q.toLowerCase(), 300, async () => {
    if (env.GEMINI_API_KEY) try { return await gemSearch(env, q) } catch {}
    let hits = [], answer = ''
    if (env.TAVILY_API_KEY) try { const j = await (await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: q, max_results: 6, include_answer: true }), signal: AbortSignal.timeout(9000) })).json(); answer = j.answer || ''; hits = (j.results || []).map(x => ({ title: x.title, url: x.url, snippet: String(x.content || '').slice(0, 300) })) } catch {}
    if (!hits.length) try { hits = await ddg(q) } catch {}
    if (!hits.length) try { hits = await wiki(q) } catch {}
    if (!hits.length) throw new Error('no results found')
    let page = ''; try { page = (await readPage(hits[0].url)).slice(0, 1500) } catch {}
    return { result: 'Today is ' + new Date().toUTCString() + '.\n' + (answer ? 'Answer: ' + answer + '\n' : '') + hits.map((h, i) => `${i + 1}. ${h.title} - ${h.snippet} (${h.url})`).join('\n') + (page ? '\n\nTop page excerpt:\n' + page : ''), sources: hits.map(h => ({ title: h.title, url: h.url })) }
  })
}
const FEEDS = ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.aljazeera.com/xml/rss/all.xml', 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', 'https://www.dawn.com/feeds/home', 'https://feeds.npr.org/1004/rss.xml']
async function rss(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' }, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error('feed ' + r.status)
  const x = await r.text(), out = []
  for (const m of x.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g)) { const t = (m[0].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]; if (!t) continue; const c = clean(t.replace(/<!\[CDATA\[|\]\]>/g, '')).replace(/\s+-\s+[^-]{2,40}$/, '').trim(); if (c.length > 15 && !out.includes(c)) out.push(c) }
  return out
}
async function headlines(env) {
  return cached('news2', 900, async () => {
    const got = (await Promise.allSettled(FEEDS.map(rss))).map(r => r.status === 'fulfilled' ? r.value : []), items = []
    for (let k = 0; items.length < 10 && k < 6; k++) for (const g of got) { const t = g[k]; if (t && !items.includes(t) && items.length < 10) items.push(t) } // mix the sources
    if (items.length) return items
    if (env && env.GEMINI_API_KEY) try { const r = await gemSearch(env, 'List the 8 most important world news headlines right now, one per line, plain text, no numbering, no source names.'); const l = String(r.result || '').split('\n').map(x => x.replace(/^[\s*\-\u2022\d.)]+/, '').trim()).filter(x => x.length > 15 && !/^sources?:/i.test(x)).slice(0, 8); if (l.length) return l } catch {}
    const d = await ddg('top world news today', 8); if (!d.length) throw new Error('no news source reachable'); return d.map(h => h.title)
  })
}
async function image(env, prompt) {
  const p = String(prompt || '').trim().slice(0, 1500); if (!p) throw new Error('empty prompt')
  if (env.GEMINI_API_KEY) try { return await gemImage(env, p) } catch (e) { if (!env.AI) throw e }
  const r = await env.AI.run(env.IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell', { prompt: p, steps: 4 }); const b = r && (r.image || (r.result && r.result.image)); if (!b) throw new Error('no image returned, try describing it differently'); return { image: b, mime: 'image/jpeg' }
}

/* ---------- Google Gemini: OFFICIAL API, free key from aistudio.google.com (set GEMINI_API_KEY as a secret). Falls back to Workers AI. ---------- */
const GB = env => (env.GEMINI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
const G = { list: null, t: 0, cool: 0, cool2: 0, pref: {} }
async function gemList(env) { if (G.list && Date.now() - G.t < 3600e3) return G.list; try { const j = await (await fetch(GB(env) + '/v1beta/models?pageSize=200&key=' + env.GEMINI_API_KEY, { signal: AbortSignal.timeout(6000) })).json(); G.list = (j.models || []).map(m => String(m.name).replace('models/', '')); G.t = Date.now() } catch { G.list = G.list || [] } return G.list }
async function gemPick(env, kind) { const own = env['GEMINI_MODEL_' + kind.toUpperCase()]; if (own) return own; const l = await gemList(env), pref = { fast: ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'], smart: ['gemini-2.5-pro', 'gemini-pro-latest', 'gemini-2.5-flash', 'gemini-flash-latest'], image: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-2.0-flash-preview-image-generation'] }[kind]; return pref.find(m => !l.length || l.includes(m)) || pref[0] }
function gemMsgs(ms) { const names = {}; return ms.map(m => { if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) { m.tool_calls.forEach(t => names[t.id] = t.function && t.function.name); return { role: 'assistant', content: text(m.content), tool_calls: m.tool_calls.map(t => ({ id: t.id, type: 'function', function: { name: t.function.name, arguments: argStr(t.function.arguments) } })) } }
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, name: names[m.tool_call_id] || m.name || 'tool', content: text(m.content) }; return m.role === 'system' ? { role: 'system', content: text(m.content) } : { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content } }) }
async function gemStream(env, model, messages, tools, onD, extra, mx, ep) {
  const r = await fetch(ep ? ep.url : GB(env) + '/v1beta/openai/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (ep ? ep.key : env.GEMINI_API_KEY) }, body: JSON.stringify({ model, messages, stream: true, max_tokens: mx, ...(tools.length ? { tools } : {}), ...extra }), signal: AbortSignal.timeout(50000) })
  if (!r.ok) { const e = new Error((ep ? 'LLM provider HTTP ' : 'Gemini HTTP ') + r.status + ' ' + (await r.text()).slice(0, 200)); e.status = r.status; throw e }
  const rd = r.body.getReader(), dec = new TextDecoder(), idx = []; let buf = '', content = ''
  for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop()
    for (const l0 of ls) { const l = l0.trim(); if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (d === '[DONE]') continue; let j; try { j = JSON.parse(d) } catch { continue } const dl = j.choices && j.choices[0] && j.choices[0].delta; if (!dl) continue
      if (dl.content) { content += dl.content; onD(dl.content) }
      for (const t of dl.tool_calls || []) { const i = t.index || 0, c = idx[i] || (idx[i] = { id: '', type: 'function', function: { name: '', arguments: '' } }); if (t.id) c.id = t.id; if (t.function) { if (t.function.name) c.function.name += t.function.name; if (t.function.arguments) c.function.arguments += argStr(t.function.arguments) } } } }
  return { content, tool_calls: idx.filter(c => c && c.function.name).map((c, i) => ({ ...c, id: c.id || 'call_' + i + '_' + rid() })) }
}
async function gemini(env, b, messages, tools, onD) {
  const smart = b.mode === 'smart', model = await gemPick(env, smart ? 'smart' : 'fast'); let sent = 0; const tap = d => { sent += d.length; onD(d) }, mx = smart ? 1500 : 900
  for (const extra of G.pref[model] === 1 ? [{}] : smart ? [{}] : [{ reasoning_effort: 'none' }, {}]) {
    try { const r = await gemStream(env, model, gemMsgs(messages), tools, tap, extra, mx); if (!r.content && !r.tool_calls.length) throw new Error('Gemini returned an empty answer'); G.pref[model] = Object.keys(extra).length ? 0 : 1; return { message: { role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined }, model: 'gemini:' + model } }
    catch (e) { if (e.status === 400 && Object.keys(extra).length && !sent) continue; e.sent = sent; throw e }
  }
}
async function llmCompat(env, b, messages, tools, onD) {
  const smart = b.mode === 'smart', model = (smart ? env.LLM_MODEL_SMART : env.LLM_MODEL_FAST) || env.LLM_MODEL; if (!model) throw new Error('LLM_MODEL is not set')
  const ep = { url: String(env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '') + '/chat/completions', key: env.LLM_API_KEY }; let sent = 0; const tap = d => { sent += d.length; onD(d) }
  try { const r = await gemStream(env, model, gemMsgs(messages), tools, tap, {}, smart ? 1500 : 900, ep); if (!r.content && !r.tool_calls.length) throw new Error('empty answer'); return { message: { role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined }, model: 'llm:' + model } }
  catch (e) { e.sent = sent; throw e }
}
async function gemSearch(env, q) {
  const model = await gemPick(env, 'fast'), r = await fetch(GB(env) + '/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: 'You are a web research assistant with live Google Search. Today is ' + new Date().toUTCString() + '. Search, then answer with the key facts, numbers and dates. Be concise (max 200 words). Reply in the language of the question.' }] }, contents: [{ role: 'user', parts: [{ text: q }] }], tools: [{ google_search: {} }] }) })
  if (!r.ok) throw new Error('gemini search ' + r.status); const j = await r.json(), c = j.candidates && j.candidates[0], t = ((c && c.content && c.content.parts) || []).map(p => p.text || '').join('').trim(); if (!t) throw new Error('empty')
  const ch = (c.groundingMetadata && c.groundingMetadata.groundingChunks) || [], sources = [...new Map(ch.filter(x => x.web && x.web.uri).map(x => [x.web.title || x.web.uri, { title: x.web.title || '', url: x.web.uri }])).values()].slice(0, 6)
  return { result: t + (sources.length ? '\nSources: ' + sources.map(s => s.title).join(', ') : ''), sources }
}
async function gemImage(env, p) {
  const model = await gemPick(env, 'image'), r = await fetch(GB(env) + '/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: p }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) })
  if (!r.ok) throw new Error('gemini image ' + r.status); const j = await r.json()
  for (const x of (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []) { const d = x.inlineData || x.inline_data; if (d && d.data) return { image: d.data, mime: d.mimeType || d.mime_type || 'image/png' } }
  throw new Error('no image')
}

/* ---------- YouTube (finds a video that can be played inside SEAS) and Gemini voice (proper Urdu etc.) ---------- */
async function ytScrape(q) { // YouTube's own results page
  const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%3D%3D', { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' }, signal: AbortSignal.timeout(7000) }), t = await r.text(), out = []
  for (const m of t.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1200}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) { if (out.find(x => x.id === m[1])) continue; let ti = m[2]; try { ti = JSON.parse('"' + m[2] + '"') } catch {} out.push({ id: m[1], title: ti }); if (out.length >= 6) break }
  return out
}
async function ytPiped(q) { // public Piped mirrors, tried in turn
  for (const b of ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee']) { try { const r = await fetch(b + '/search?q=' + encodeURIComponent(q) + '&filter=videos', { signal: AbortSignal.timeout(5000) }); if (!r.ok) continue; const j = await r.json(), it = (j.items || []).filter(x => x.url && /watch\?v=/.test(x.url)).map(x => ({ id: x.url.split('v=')[1].slice(0, 11), title: x.title })); if (it.length) return it.slice(0, 6) } catch {} }
  return []
}
async function youtube(env, query) {
  const q = String(query || '').trim().slice(0, 200); if (!q) throw new Error('empty query')
  return cached('yt:' + q.toLowerCase(), 1800, async () => {
    let ids = []
    if (env.YOUTUBE_API_KEY) try { const j = await (await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&q=' + encodeURIComponent(q) + '&key=' + env.YOUTUBE_API_KEY, { signal: AbortSignal.timeout(8000) })).json(); ids = (j.items || []).map(x => ({ id: x.id.videoId, title: x.snippet.title })) } catch {}
    if (!ids.length) try { ids = await ytScrape(q) } catch {}
    if (!ids.length) try { ids = await ytPiped(q) } catch {}
    if (!ids.length) { let hits = []; try { hits = await ddg(q + ' site:youtube.com', 10) } catch {} for (const h of hits) { const m = String(h.url).match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/)([\w-]{11})/); if (m && !ids.find(x => x.id === m[1])) ids.push({ id: m[1], title: String(h.title).replace(/ - YouTube$/, '') }) } }
    if (!ids.length) throw new Error('no video found for that search')
    for (const v of ids.slice(0, 5)) { try { const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.id), { signal: AbortSignal.timeout(5000) }); if (r.ok) { const o = await r.json(); return { id: v.id, title: o.title || v.title, channel: o.author_name || '', alternatives: ids.filter(x => x.id !== v.id).slice(0, 3) } } } catch {} } // oEmbed fails for videos that cannot be embedded
    return { id: ids[0].id, title: ids[0].title, channel: '', alternatives: ids.slice(1, 4) }
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
// how the voice should speak: same language as the user, native accent
const LANGNAME = { urdu: 'Urdu', hindi: 'Hindi', arabic: 'Arabic', punjabi: 'Punjabi', pashto: 'Pashto', persian: 'Persian', french: 'French', german: 'German', spanish: 'Spanish', turkish: 'Turkish', russian: 'Russian', chinese: 'Mandarin Chinese', japanese: 'Japanese', korean: 'Korean' }
function langStyle(lang) {
  const k = String(lang || '').toLowerCase()
  if (k === 'urdu' || k === 'ur' || k === 'ur-pk') return 'Say in fluent, natural native Urdu with an authentic Pakistani accent, reading every single word: '
  if (k === 'roman') return 'The text is Urdu written in English letters. Say it in fluent, natural native Urdu with an authentic Pakistani accent, reading every single word: '
  if (LANGNAME[k]) return 'Say in fluent, natural native ' + LANGNAME[k] + ' with an authentic native accent, reading every single word: '
  return 'Say in clear, natural, friendly English, reading every single word: '
}
function withTone(st, tone) { const k = String(tone || '').replace(/[^a-z, ]/gi, '').slice(0, 60).trim(); return k ? st.replace(/^Say in /, 'Say in a ' + k + ' tone, in ') : st }
async function tts(env, text, male, lang, tone) {
  if (!env.GEMINI_API_KEY) throw Object.assign(new Error('Cloud voice needs GEMINI_API_KEY'), { code: 503 })
  const t = String(text || '').trim().slice(0, 1500); if (!t) throw new Error('empty text')
  const l = await gemList(env), want = [env.GEMINI_MODEL_TTS, 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts', 'gemini-2.5-pro-preview-tts'].filter(Boolean)
  let models = [...new Set(want)].filter(m => m === env.GEMINI_MODEL_TTS || l.includes(m)); if (!models.length) models = ['gemini-2.5-flash-preview-tts']
  let err = null
  for (const model of models.slice(0, 3)) {
    for (let a = 0; a < 2; a++) { // 1st try with the accent instruction, 2nd try with the plain text (some texts make the model answer in text instead of audio)
      try {
        const r = await fetch(GB(env) + '/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ contents: [{ parts: [{ text: a === 0 ? withTone(langStyle(lang), tone) + t : t }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: male ? 'Charon' : 'Kore' } } } } }) })
        if (r.status === 429) { err = Object.assign(new Error('voice quota is busy (429)'), { code: 429 }); break }
        if (!r.ok) { err = new Error('voice service busy (' + r.status + ')'); await sleep(350); continue }
        const j = await r.json(), p = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).find(x => x.inlineData || x.inline_data), d = p && (p.inlineData || p.inline_data)
        if (!d || !d.data) { err = new Error('no audio returned'); continue }
        return { audio: d.data, mime: d.mimeType || d.mime_type || 'audio/L16;codec=pcm;rate=24000', chars: t.length }
      } catch (e) { err = e }
    }
  }
  throw err || new Error('voice failed')
}

const NOSPEECH = /^[\s\[\(]*(silence|no speech|no audio|music|noise|inaudible|blank audio|\.{2,}|-+)[\s\]\)\.]*$/i
async function stt(env, audio, mime, hint, ctx, style) {
  const a = String(audio || ''); if (!a || a.length > 4_000_000) throw new Error('audio is empty or too long')
  const h = String(hint || '').toLowerCase(), who = h === 'english' || h === 'en' ? 'The speaker is speaking English.' : h === 'urdu' || h === 'ur' ? 'The speaker is speaking Urdu (possibly with some English words).' : 'The speaker is most likely Pakistani and may speak Urdu, English, or a mix of both (Urdu with English words is very common). Decide the language from the audio itself; do not assume. The speaker NEVER speaks Punjabi, Hindi, Pashto or Arabic: Punjabi-sounding Pakistani speech must be written as Urdu.'
  if (env.GEMINI_API_KEY) try {
    const gl = await gemList(env), model = env.GEMINI_MODEL_STT || ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'].find(x => gl.includes(x)) || await gemPick(env, 'fast'), cx = String(ctx || '').replace(/[\r\n]+/g, ' ').slice(0, 240), r = await fetch(GB(env) + '/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: (cx ? 'Context only, to help with names and topics (never copy it into the answer): the speaker recently said: ' + cx + '. ' : '') + 'You are a careful speech-to-text engine. Listen to the audio and write down ONLY the words that were really spoken, in the language they were spoken. ' + who + ' ' + (style === 'roman' ? 'Urdu / Hindustani words go in Roman Urdu (Urdu written with English letters, the way people text it), never in Urdu script, Devanagari or Gurmukhi; English words stay in English.' : 'Urdu / Hindustani / Punjabi speech goes in Urdu script (اردو), NEVER in Devanagari, NEVER in Gurmukhi and NEVER in Roman letters; English words go in English letters.') + ' NEVER guess, complete, correct or invent words. If a word is unclear, leave it out and lower your confidence. If there is no clear human speech (silence, noise, music, a TV or another room), return an empty text. Reply with JSON only: {"text": "...", "confidence": 0.0-1.0 (how sure you are that every word is exactly what was spoken), "language": "ur" | "en" | "mixed" | "other"}.' }, { inlineData: { mimeType: mime || 'audio/wav', data: a } }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) })
    if (r.ok) {
      const j = await r.json(), raw = (((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('')).trim()
      let o = null; try { o = JSON.parse(raw.replace(/^```json|```$/g, '').trim()) } catch {}
      const t = String((o && o.text) != null ? o.text : raw).trim().replace(/^["“]+|["”]+$/g, '').trim(), conf = o && typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.7
      return { text: NOSPEECH.test(t) ? '' : t, conf, lang: (o && o.language) || '' }
    }
  } catch {}
  if (!env.AI) throw new Error('no speech service is connected (add the Workers AI binding or GEMINI_API_KEY)')
  const lg = h === 'english' || h === 'en' ? 'en' : h === 'urdu' || h === 'ur' ? 'ur' : undefined
  const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', lg ? { audio: a, language: lg } : { audio: a }); const t = String((r && r.text) || '').trim(); return { text: NOSPEECH.test(t) ? '' : t, conf: 0.6, lang: '' }
}

/* ---------- personal browser helpers: can a page be shown inside SEAS? plain web search results ---------- */
async function frameCheck(url) {
  const u = new URL(String(url || '')); if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) pages'); if (PRIVATE.test(u.hostname)) throw new Error('local addresses are blocked')
  return cached('fc:' + u.origin, 600, async () => {
    let r; try { r = await fetch(u.href, { method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(7000) }) } catch (e) { return { embeddable: false, reason: 'unreachable' } }
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase(), csp = (r.headers.get('content-security-policy') || '').toLowerCase(), fa = (csp.match(/frame-ancestors([^;]*)/) || [])[1] || ''
    let ok = r.ok || r.status < 500; let reason = ''
    if (/deny|sameorigin/.test(xfo)) { ok = false; reason = 'x-frame-options' } else if (fa && !/\*/.test(fa)) { ok = false; reason = 'frame-ancestors' }
    return { embeddable: ok, reason, status: r.status, final: r.url }
  })
}
async function webSearch(q) {
  q = String(q || '').trim().slice(0, 200); if (!q) throw new Error('empty query')
  return cached('ws:' + q.toLowerCase(), 300, async () => {
    let hits = []; try { hits = await ddg(q, 10) } catch {}
    if (!hits.length) try { hits = await wiki(q) } catch {}
    if (!hits.length) throw new Error('no results')
    return { hits: hits.slice(0, 10).map(h => ({ title: h.title, url: h.url, snippet: h.snippet || '' })) }
  })
}

/* ---------- brain ---------- */
const CHAT = /^\s*(hi|hello|hey|salam|assalam\S*|thanks?|thank you|shukriya|ok(ay)?|acha|theek hai|bye|good (morning|night|evening)|how are you|who are you|kaise ho|kya haal|tum kaun)\b/i
function prepare(b) {
  const all = Array.isArray(b.messages) ? b.messages : [], sys = all.find(m => m.role === 'system')
  let rest = all.filter(m => m.role !== 'system').slice(-14); while (rest.length && rest[0].role !== 'user') rest.shift()
  rest = rest.map(m => m.role === 'tool' ? { ...m, content: text(m.content).slice(0, 2500) } : m)
  const lu = rest.map(m => m.role).lastIndexOf('user'), ut = lu >= 0 ? text(rest[lu].content) : '', rounds = rest.slice(lu + 1).filter(m => m.role === 'tool').length
  let tools = Array.isArray(b.tools) ? b.tools.slice(0, 30) : []
  if ((CHAT.test(ut) && ut.split(/\s+/).length <= 7) || rounds >= 2) tools = [] // small talk or already researched: answer directly (faster, and no tool loops)
  return { messages: [...(sys ? [{ ...sys, content: text(sys.content).slice(0, 7000) }] : []), ...rest], tools }
}
const structured = ms => ms.map(m => m.role === 'assistant' ? { role: 'assistant', content: text(m.content), ...(m.tool_calls && m.tool_calls.length ? { tool_calls: m.tool_calls.map(t => ({ id: t.id, type: 'function', function: { name: t.function && t.function.name, arguments: argStr(t.function && t.function.arguments) } })) } : {}) } : m.role === 'tool' ? { role: 'tool', tool_call_id: m.tool_call_id, name: m.name, content: text(m.content) } : { role: m.role === 'system' ? 'system' : 'user', content: text(m.content) })
const flat = ms => ms.map(m => m.role === 'assistant' && m.tool_calls && m.tool_calls.length ? { role: 'assistant', content: (text(m.content) + ' ' + m.tool_calls.map(t => `[calling ${t.function && t.function.name}(${argStr(t.function && t.function.arguments)})]`).join(' ')).trim() } : m.role === 'tool' ? { role: 'user', content: `[Result of ${m.name || 'tool'}]: ${text(m.content)}\nNow answer the user using this result.` } : { role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: text(m.content) })
const native = ts => ts.map(t => t.function ? { name: t.function.name, description: t.function.description, parameters: t.function.parameters } : t)
const PLANS = [
  (ms, ts, mx) => ({ messages: structured(ms), ...(ts.length ? { tools: native(ts) } : {}), max_tokens: mx, temperature: 0.5, stream: true }),
  (ms, ts, mx) => ({ messages: flat(ms), ...(ts.length ? { tools: native(ts) } : {}), max_tokens: mx, temperature: 0.5 }),
  (ms, ts, mx) => ({ messages: flat(ms), ...(ts.length ? { tools: ts } : {}), max_tokens: mx }),
]
const PREF = {} // remembers which request shape worked for each model, so later requests skip the failed attempts
const thinkFilter = () => { let th = false, buf = ''; return s => { let out = ''; buf += s; for (;;) { if (th) { const i = buf.indexOf('</think>'); if (i < 0) { buf = ''; return out } buf = buf.slice(i + 8); th = false } else { const i = buf.indexOf(' thinking'); if (i < 0) { const k = buf.lastIndexOf('<'); if (k >= 0 && ' thinking'.startsWith(buf.slice(k))) { out += buf.slice(0, k); buf = buf.slice(k) } else { out += buf; buf = '' } return out } out += buf.slice(0, i); buf = buf.slice(i + 7); th = true } } } }
async function pump(env, model, input, tools, sid, onD) {
  const opts = sid ? { headers: { 'x-session-affinity': 'ses_' + sid }, extraHeaders: { 'x-session-affinity': 'ses_' + sid } } : undefined
  const r = await env.AI.run(model, input, opts), tf = thinkFilter(), names = new Set(tools.map(t => (t.function || t).name))
  let content = '', full = [], gate = '', open = !tools.length; const idx = []
  const emit = s => { if (!s) return; content += s; if (open) onD(s); else { gate += s; const f = gate.trimStart()[0]; if (f) { if (f !== '{' && f !== '[') { open = true; onD(gate); gate = '' } } } }
  if (r && typeof r.getReader === 'function') {
    const rd = r.getReader(), dec = new TextDecoder(); let buf = ''
    for (;;) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop()
      for (const l0 of ls) { const l = l0.trim(); if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (d === '[DONE]') continue; let j; try { j = JSON.parse(d) } catch { continue }
        const dl = j.choices && j.choices[0] && j.choices[0].delta, tok = typeof j.response === 'string' ? j.response : (dl && dl.content) || ''; if (tok) emit(tf(tok))
        const tc = j.tool_calls || (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.tool_calls); if (Array.isArray(tc) && tc.length) full = tc
        if (dl && dl.tool_calls) for (const t of dl.tool_calls) { const i = t.index || 0, s = idx[i] || (idx[i] = { id: '', type: 'function', function: { name: '', arguments: '' } }); if (t.id) s.id = t.id; if (t.function) { if (t.function.name) s.function.name += t.function.name; if (t.function.arguments) s.function.arguments += argStr(t.function.arguments) } } }
    }
  } else {
    const m = r && r.choices && r.choices[0] && r.choices[0].message; if (m) { emit(m.content || ''); full = m.tool_calls || [] } else { emit(typeof r.response === 'string' ? r.response : r.response ? JSON.stringify(r.response) : ''); full = r.tool_calls || [] }
  }
  let calls = (idx.filter(s => s && s.function.name).length ? idx.filter(s => s && s.function.name) : full).map((t, i) => { const f = t.function || t; return { id: t.id || 'call_' + i + '_' + rid(), type: 'function', function: { name: f.name, arguments: argStr(f.arguments) } } }).filter(t => t.function.name)
  if (!calls.length && content.trim().startsWith('{')) { try { const o = JSON.parse(content), n = o.name || (o.function && o.function.name); if (n && names.has(n)) { calls = [{ id: 'call_0_' + rid(), type: 'function', function: { name: n, arguments: argStr(o.arguments || o.parameters || {}) } }]; content = '' } } catch {} }
  if (!open && content && !calls.length) onD(gate) // it started with "{" but was an ordinary answer
  return { content, tool_calls: calls }
}
async function thinkOne(env, b, sid, onD) {
  const { messages, tools } = prepare(b); if (!messages.length) throw Object.assign(new Error('no messages'), { code: 400 })
  const smart = b.mode === 'smart', models = [...new Set([smart ? env.BRAIN_SMART : env.BRAIN_FAST, ...(smart ? SMART : FAST)].filter(Boolean))], mx = smart ? 1200 : 700
  let last = ''
  if (env.GEMINI_API_KEY && (Date.now() > G.cool || !env.AI)) {
    try { return await gemini(env, b, messages, tools, onD) }
    catch (e) { last = String((e && e.message) || e); if (e.sent) return { message: { role: 'assistant', content: '' }, model: 'gemini', partial: true }; G.cool = Date.now() + (e.status === 429 ? (/PerDay|daily/i.test(last) ? 600e3 : 30e3) : 10e3) } // free key busy: use Workers AI for a while
  }
  if (env.LLM_API_KEY && (Date.now() > G.cool2 || !env.AI)) {
    try { return await llmCompat(env, b, messages, tools, onD) }
    catch (e) { last = String((e && e.message) || e); if (e.sent) return { message: { role: 'assistant', content: '' }, model: 'llm', partial: true }; G.cool2 = Date.now() + (e.status === 429 ? 30e3 : 10e3) }
  }
  if (!env.AI) throw Object.assign(new Error('The AI providers are unavailable right now (' + last.slice(0, 120) + ') and Workers AI is not connected.'), { code: 502 })
  for (const model of models) for (let p = PREF[model] || 0; p < PLANS.length; p++) {
    let sent = 0; const tap = d => { sent += d.length; onD(d) }
    try { const r = await pump(env, model, PLANS[p](messages, tools, mx), tools, sid, tap); if (r.content || r.tool_calls.length) { PREF[model] = p; return { message: { role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined }, model } } last = 'empty reply' }
    catch (e) { last = String((e && e.message) || e); if (/daily free allocation|neurons|4006/i.test(last)) throw Object.assign(new Error('SEAS free daily AI capacity is used up. It resets every day.'), { code: 429 }); if (sent) return { message: { role: 'assistant', content: '' }, model, partial: true }; if (/rate|429|capacity|busy/i.test(last)) break }
  }
  throw Object.assign(new Error('SEAS Cloud error: ' + last.slice(0, 180)), { code: 502 })
}
/* ---------- ALL BRAINS TOGETHER: every connected brain answers, then the best one merges them into one answer ---------- */
const hasLLM = env => !!(env.LLM_API_KEY && (env.LLM_MODEL || env.LLM_MODEL_FAST || env.LLM_MODEL_SMART))
function councilMembers(env) { // each member = one independent brain
  const m = []
  if (env.GEMINI_API_KEY) m.push({ id: 'gemini', name: 'Gemini' })
  if (hasLLM(env)) m.push({ id: 'llm', name: 'LLM (' + (env.LLM_MODEL_FAST || env.LLM_MODEL || env.LLM_MODEL_SMART) + ')' })
  if (env.AI) { m.push({ id: 'w:' + SMART[0], name: 'Llama 70B' }); m.push({ id: 'w:' + FAST[0], name: 'Qwen 30B' }) }
  return m
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
async function runMember(env, id, b, messages, tools, sid, onD) {
  if (id === 'gemini') return gemini(env, b, messages, tools, onD)
  if (id === 'llm') return llmCompat(env, b, messages, tools, onD)
  return workersChat(env, b, messages, tools, sid, onD, id.slice(2))
}
async function workersChat(env, b, messages, tools, sid, onD, only) {
  if (!env.AI) throw new Error('Workers AI is not connected')
  const smart = b.mode === 'smart', mx = smart ? 1200 : 700, models = only ? [only] : [...new Set([smart ? env.BRAIN_SMART : env.BRAIN_FAST, ...(smart ? SMART : FAST)].filter(Boolean))]
  let last = ''
  for (const model of models) for (let p = PREF[model] || 0; p < PLANS.length; p++) {
    let sent = 0; const tap = d => { sent += d.length; onD(d) }
    try { const r = await pump(env, model, PLANS[p](messages, tools, mx), tools, sid, tap); if (r.content || r.tool_calls.length) { PREF[model] = p; return { message: { role: 'assistant', content: r.content, tool_calls: r.tool_calls.length ? r.tool_calls : undefined }, model } } last = 'empty reply' }
    catch (e) { last = String((e && e.message) || e); if (sent) { const x = new Error(last); x.sent = sent; throw x } if (/rate|429|capacity|busy/i.test(last)) break }
  }
  throw new Error('Workers AI: ' + last.slice(0, 150))
}
const lastUser = ms => { const i = ms.map(m => m.role).lastIndexOf('user'); return i >= 0 ? text(ms[i].content) : '' }
const transcript = ms => ms.filter(m => m.role !== 'system').slice(-8).map(m => m.role === 'tool' ? 'TOOL RESULT: ' + text(m.content).slice(0, 1800) : (m.role === 'assistant' ? 'ASSISTANT: ' : 'USER: ') + text(m.content).slice(0, 2500) + (m.tool_calls && m.tool_calls.length ? ' [used tools: ' + m.tool_calls.map(t => t.function && t.function.name).join(', ') + ']' : '')).join('\n')
async function council(env, b, sid, onD) {
  const members = councilMembers(env); if (members.length < 2) return null
  const { messages, tools } = prepare(b); if (!messages.length) return null
  const ut = lastUser(messages); if (CHAT.test(ut) && ut.split(/\s+/).length <= 7) return null // small talk: one brain is enough
  // step 1: the normal brain decides. If it wants tools, those run as usual (single brain); the council answers once the facts are in.
  let buf = ''; const first = await thinkOne(env, { ...b, ensemble: false }, sid, d => { buf += d })
  const fm = first.message || {}; if (fm.tool_calls && fm.tool_calls.length) { if (!fm.content && buf) fm.content = buf; return first }
  const d0 = String(fm.content || buf || '').trim(), fid = String(first.model || '')
  const mine = members.find(m => fid.startsWith(m.id === 'gemini' ? 'gemini' : m.id === 'llm' ? 'llm' : m.id.slice(2))) || null
  // step 2: the other brains answer on their own, at the same time (no tools: the facts are already in the conversation)
  const others = members.filter(m => m !== mine).slice(0, 3), nb = { ...b, mode: 'fast', tools: [] }
  const got = await Promise.all(others.map(m => withTimeout(runMember(env, m.id, nb, messages, [], sid, () => {}), 16000).then(r => ({ m, t: String((r.message && r.message.content) || '').trim() })).catch(() => null)))
  const drafts = [{ m: mine || { name: 'Main brain' }, t: d0 }, ...got.filter(x => x && x.t)].filter(x => x.t)
  const emit = t => { for (let i = 0; i < t.length; i += 60) onD(t.slice(i, i + 60)) }
  if (drafts.length < 2) { emit(d0); return { message: { role: 'assistant', content: d0 }, model: fid || 'single' } }
  // step 3: the strongest connected brain merges the drafts into the single best answer and streams it
  const sys = messages.find(m => m.role === 'system'), judgeSys = (sys ? text(sys.content).slice(0, 5500) + '\n\n' : '') + 'COUNCIL MODE: several AI brains drafted answers to the same request. You are the chair. Write ONE final answer for the user: take the correct, complete and most useful parts of every draft, fix mistakes, drop contradictions and repetition, and use facts from the TOOL RESULTS in the conversation as the source of truth. Keep exactly the language, script, accent style and tone the system instructions and the user require. Do not mention the drafts, the council or the brains. Output only the final answer.'
  const jm = [{ role: 'system', content: judgeSys }, { role: 'user', content: 'CONVERSATION SO FAR:\n' + transcript(messages) + '\n\n' + drafts.map((d, i) => '=== DRAFT ' + (i + 1) + ' (' + d.m.name + ') ===\n' + d.t.slice(0, 3500)).join('\n\n') + '\n\n(If a draft looks at an attached image, trust it for questions about the image. Now write the single best final answer.)' }]
  const order = ['gemini', 'llm', 'w:' + SMART[0], 'w:' + FAST[0]].filter(id => members.some(m => m.id === id))
  let sent = 0; const tap = d => { sent += d.length; onD(d) }
  for (const id of order) {
    try { const r = await runMember(env, id, { ...b, mode: 'smart' }, jm, [], sid, tap); const c = String((r.message && r.message.content) || '').trim(); if (c) return { message: { role: 'assistant', content: c }, model: 'council:' + drafts.length }; throw new Error('empty') }
    catch (e) { if (sent) return { message: { role: 'assistant', content: '' }, model: 'council', partial: true } }
  }
  emit(d0); return { message: { role: 'assistant', content: d0 }, model: fid || 'single' } // judge failed: give the main brain's answer
}
async function think(env, b, sid, onD) {
  if (b.ensemble) { try { const o = await council(env, b, sid, onD); if (o) return o } catch (e) { if (e && e.sent) throw e } }
  return thinkOne(env, b, sid, onD)
}
async function brain(req, env, ctx) {
  const a = admit(req, env, 1); if (!a.ok) return denied(req, env, a)
  let raw; try { raw = await req.text(); if (raw.length > 2_000_000) { a.done(); return json(req, env, { error: 'Message too large.' }, 413) } } catch { a.done(); return json(req, env, { error: 'bad request' }, 400) }
  let b; try { b = JSON.parse(raw) } catch { a.done(); return json(req, env, { error: 'bad JSON' }, 400) }
  const sid = String(req.headers.get('x-nexa-sid') || '').replace(/[^a-z0-9]/gi, '').slice(0, 24)
  if (!b.stream) { try { const o = await think(env, b, sid, () => {}); return json(req, env, o) } catch (e) { return json(req, env, { error: e.message }, e.code || 502) } finally { a.done() } }
  const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(), put = o => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {})
  const job = (async () => { let acc = ''; try { const o = await think(env, b, sid, d => { acc += d; put({ d }) }); if (o.partial) o.message.content = acc; await put({ done: true, ...o }) } catch (e) { await put({ error: e.message }) } finally { a.done(); await w.close().catch(() => {}) } })()
  if (ctx && ctx.waitUntil) ctx.waitUntil(job)
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', ...cors(req, env) } })
}

/* ---------- "Download the PC app": the zip is built on the fly, already pointing at THIS website ---------- */
const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (~c) >>> 0 }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), n = f.data.length, lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nm.length, true)
    parts.push(new Uint8Array(lh.buffer), nm, f.data)
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true)
    cd.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + n
  }
  const size = cd.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true)
  return new Blob([...parts, ...cd, new Uint8Array(end.buffer)])
}
async function appZip(req, env) {
  const origin = new URL(req.url).origin, enc = new TextEncoder(), files = []
  const get = async path => { const r = await env.ASSETS.fetch(new Request(origin + path, { redirect: 'follow' })); if (!r.ok) throw new Error('missing ' + path); return new Uint8Array(await r.arrayBuffer()) }
  for (const [n, path] of [['server.js', '/appfiles/server.js'], ['START_SEAS-AI-AGENT.bat', '/appfiles/START_SEAS-AI-AGENT.bat'], ['start.sh', '/appfiles/start.sh'], ['README.txt', '/appfiles/README.txt'], ['seas.ico', '/appfiles/seas.ico'], ['favicon.ico', '/favicon.ico'], ['icon-192.png', '/icon-192.png'], ['icon-512.png', '/icon-512.png'], ['apple-touch-icon.png', '/apple-touch-icon.png'], ['manifest.webmanifest', '/manifest.webmanifest'], ['index.html', '/']]) {
    let d = await get(path); if (n.endsWith('.bat')) d = enc.encode(new TextDecoder().decode(d).replace(/\r?\n/g, '\r\n')); files.push({ name: 'SEAS-AI-AGENT/' + n, data: d })
  }
  files.push({ name: 'SEAS-AI-AGENT/config.json', data: enc.encode(JSON.stringify({ cloud_url: origin, access_code: '', openai_api_key: '', openai_base_url: '', openai_model_fast: '', openai_model_smart: '', ollama_model: '' }, null, 1) + '\n') })
  return new Response(makeZip(files), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename=""SEAS-AI-AGENT-App.zip"', 'Cache-Control': 'public, max-age=300' } })
}

/* ---------- router ---------- */
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url), p = u.pathname
    if (p === '/SEAS-AI-AGENT-App.zip') { try { return await appZip(req, env) } catch (e) { return new Response('Could not build the app download: ' + e.message, { status: 500 }) } }
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) })
    if (env.ACCESS_CODE && req.headers.get('x-nexa-code') !== env.ACCESS_CODE && p !== '/api/status') return json(req, env, { error: 'This SEAS needs an access code.', need_code: true }, 401)
    try {
      if (p === '/api/status') return json(req, env, { ok: true, ai: !!env.AI, gemini: !!env.GEMINI_API_KEY, tts: !!env.GEMINI_API_KEY, stt: !!(env.GEMINI_API_KEY || env.AI), youtube: true, llm: !!env.LLM_API_KEY, brains: councilMembers(env).map(x => x.name), council: councilMembers(env).length > 1, app_url: env.APP_DOWNLOAD_URL || '', needs_code: !!env.ACCESS_CODE, fast: FAST[0], limits: { per_min: +env.RATE_PER_MIN || 24, per_day: +env.DAILY_PER_IP || 400 } })
      if (!env.AI && !env.GEMINI_API_KEY && !env.LLM_API_KEY && (p === '/api/brain' || p === '/api/tool/image')) return json(req, env, { error: 'Workers AI is not connected yet. In Cloudflare Pages open Settings > Bindings > Add > Workers AI, name it AI, then redeploy.' }, 503)
      if (p === '/api/brain' && req.method === 'POST') return await brain(req, env, ctx)
      const m = p.match(/^\/api\/tool\/([a-z_]+)$/); if (!m) return json(req, env, { error: 'not found' }, 404)
      const a = admit(req, env, m[1] === 'image' ? 4 : m[1] === 'tts' ? 0.6 : m[1] === 'stt' ? 1.5 : 0.3); if (!a.ok) return denied(req, env, a)
      try {
        if (m[1] === 'news') return json(req, env, { items: await headlines(env) }, 200, { 'Cache-Control': 'public, max-age=300' })
        if (req.method !== 'POST') return json(req, env, { error: 'POST only' }, 405)
        const b = await req.json().catch(() => ({}))
        if (m[1] === 'search') return json(req, env, await search(env, b.query))
        if (m[1] === 'read_page') return json(req, env, { result: await readPage(String(b.url || '')) })
        if (m[1] === 'image') return json(req, env, await image(env, b.prompt))
        if (m[1] === 'youtube') return json(req, env, await youtube(env, b.query))
        if (m[1] === 'tts') return json(req, env, await tts(env, b.text, !!b.male, b.lang, b.tone))
        if (m[1] === 'stt') return json(req, env, await stt(env, b.audio, b.mime, b.hint, b.ctx, b.style))
        if (m[1] === 'frame_check') return json(req, env, await frameCheck(b.url))
        if (m[1] === 'websearch') return json(req, env, await webSearch(b.query))
        return json(req, env, { error: 'unknown tool' }, 404)
      } finally { a.done() }
    } catch (e) { return json(req, env, { error: String((e && e.message) || e).slice(0, 300) }, 502) }
  },
}
