/* ════════════════════════════════════════════
   agents.js — Agent Town
   A local, on-device multi-agent simulation:
   agents walk the grid, accept a task, work and report.
   ════════════════════════════════════════════ */

const PIXELS = [
  '..####..',
  '.#....#.',
  '.#.##.#.',
  '.#....#.',
  '..####..',
  '.######.',
  '.#.##.#.',
  '..#..#..',
];

function sprite(color) {
  const el = document.createElement('div');
  el.className = 'sprite';
  el.style.color = color;
  const shadows = [];
  PIXELS.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') shadows.push(`${x * 2.6}px ${y * 2.6}px 0 0 ${color}`);
    });
  });
  el.style.width = '2.6px';
  el.style.height = '2.6px';
  el.style.marginLeft = 'auto';
  el.style.marginRight = 'auto';
  el.style.boxShadow = shadows.join(',');
  el.style.background = 'transparent';
  return el;
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ── local "work" generators, one per role ── */
const WORK = {
  Researcher: (task) => {
    const angle = pick([
      'three angles worth checking',
      'one strong counter-argument',
      'two sources that disagree',
      'a primary source to verify',
    ]);
    return `Scanned the brief for “${trim(task)}”. Found ${angle}.`;
  },
  Builder: (task) => {
    const parts = pick([
      'split it into three steps, first one is small enough to start now',
      'sketched the structure, dependencies are all local',
      'drafted a first version and marked the risky part',
      'listed what to remove before adding anything',
    ]);
    return `On “${trim(task)}”: I ${parts}.`;
  },
  Analyst: (task) => {
    const note = pick([
      'the cost is mostly waiting time, not effort',
      'two of the requirements overlap and can merge',
      'the first 20% delivers most of the value',
      'there is one assumption nobody has tested yet',
    ]);
    return `Read “${trim(task)}”. My read: ${note}.`;
  },
  Critic: (task) => {
    const note = pick([
      'the goal is clear but the success measure is not',
      'it is framed as a feature when it is really a decision',
      'you are solving the symptom, not the cause',
      'scope is the risk here, not difficulty',
    ]);
    return `On “${trim(task)}” — ${note}.`;
  },
};

function trim(t) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > 34 ? `${s.slice(0, 34)}…` : s;
}

export const ROSTER = [
  { name: 'HERMES-1', role: 'Researcher', color: '#35f0ff' },
  { name: 'HERMES-2', role: 'Builder', color: '#7c5cff' },
  { name: 'HERMES-3', role: 'Analyst', color: '#4dffa8' },
  { name: 'HERMES-4', role: 'Critic', color: '#ffb13c' },
];

export class AgentTown {
  constructor({ stage, logEl }) {
    this.stage = stage;
    this.logEl = logEl;
    this.agents = [];
    this.deployed = false;
    this.turn = 0;
    this.busy = false;
    this.walkTimer = null;
  }

  deploy() {
    if (this.deployed) return;
    this.deployed = true;
    this.stage.innerHTML = '';

    ROSTER.forEach((spec, i) => {
      const el = document.createElement('div');
      el.className = 'agent';
      el.style.color = spec.color;

      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      el.appendChild(bubble);
      el.appendChild(sprite(spec.color));

      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = spec.role.toUpperCase();
      el.appendChild(tag);

      const x = 14 + i * 23;
      el.style.left = `${x}%`;
      el.style.top = `${45 + (i % 2 ? -14 : 16)}%`;
      this.stage.appendChild(el);

      this.agents.push({
        ...spec,
        el,
        bubble,
        x,
        y: 45 + (i % 2 ? -14 : 16),
        status: 'idle',
      });
    });

    this.log('Agent Town online', '4 local seats ready. Assign a task.');
    this.walkTimer = setInterval(() => this.wander(), 2600);
  }

  wander() {
    for (const a of this.agents) {
      if (a.status !== 'idle' || Math.random() > 0.55) continue;
      const x = Math.round(rand(8, 88));
      const y = Math.round(rand(18, 82));
      a.x = x;
      a.y = y;
      a.el.style.left = `${x}%`;
      a.el.style.top = `${y}%`;
    }
  }

  log(title, text) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    li.innerHTML = `<b>${time}</b> ${title}${text ? ` — ${text}` : ''}`;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 24) this.logEl.lastElementChild.remove();
  }

  say(agent, text, keep = 5200) {
    agent.bubble.textContent = text;
    agent.el.classList.add('has-bubble');
    clearTimeout(agent._bubbleTimer);
    agent._bubbleTimer = setTimeout(() => agent.el.classList.remove('has-bubble'), keep);
  }

  async assign(task) {
    const clean = String(task || '').trim();
    if (!clean) return;
    if (!this.deployed) this.deploy();
    if (this.busy) {
      this.log('Queued', trim(clean));
      return;
    }
    this.busy = true;

    const agent = this.agents[this.turn % this.agents.length];
    this.turn += 1;

    agent.status = 'working';
    agent.el.classList.add('is-working');
    agent.el.style.left = `${Math.round(rand(30, 68))}%`;
    agent.el.style.top = `${Math.round(rand(34, 66))}%`;

    this.log(agent.name, `started — ${trim(clean)}`);
    this.say(agent, 'Working…', 2400);

    await wait(1100 + Math.random() * 900);

    const output = (WORK[agent.role] || WORK.Analyst)(clean);
    this.say(agent, output, 7000);
    this.log(agent.name, output);

    agent.status = 'idle';
    agent.el.classList.remove('is-working');

    this.busy = false;
    return { agent: agent.name, output };
  }

  stop() {
    clearInterval(this.walkTimer);
    this.deployed = false;
    this.agents = [];
    this.stage.innerHTML = '';
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
