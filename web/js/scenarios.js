// scenarios.js — shoot / no-shoot scene templates.
// ---------------------------------------------------------------------------
// Each template's build() makes a fresh, randomized scene every run so it
// can't be memorized: who is the threat, when they reveal, what the others
// are holding, and where everyone stands.
//
// build() returns:
//   actors:   [{ x, pose, vx? }]            x = normalized screen position
//   events:   [{ t, actor, pose }]         t = seconds after the scene appears
//   duration: seconds (capped by CONFIG.scenario.maxDuration)
//
// A person is a threat only while their pose is 'gun'.

import { SHIRTS, JACKETS, SKINS, HAIRS } from './actors.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const harmless = () => pick(['phone', 'wallet', 'empty']);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// n distinct standing spots across the range.
const spots = n => shuffle([0.2, 0.35, 0.5, 0.65, 0.8]).slice(0, n).sort((a, b) => a - b);

export const SCENARIOS = [
  {
    id: 'turn',
    name: 'Turn and Reveal',
    desc: 'One person turns around. Gun: engage. Anything else: hold fire.',
    build() {
      const t = rand(1.0, 3.0);
      const reveal = Math.random() < 0.6 ? 'gun' : harmless();
      return {
        actors: [{ x: pick([0.35, 0.5, 0.65]), pose: 'back' }],
        events: [{ t, actor: 0, pose: reveal }],
        duration: t + 3.5,
      };
    },
  },
  {
    id: 'pick',
    name: 'Pick the Threat',
    desc: 'Two people reach for something at once. Only one might be armed.',
    build() {
      const t = rand(1.5, 3.5);
      const [x1, x2] = spots(2);
      const armed = Math.random() < 0.85 ? pick([0, 1]) : -1;
      return {
        actors: [{ x: x1, pose: 'empty' }, { x: x2, pose: 'empty' }],
        events: [0, 1].map(i => ({ t: t + rand(-0.2, 0.2), actor: i, pose: i === armed ? 'gun' : harmless() })),
        duration: t + 3.5,
      };
    },
  },
  {
    id: 'crowd',
    name: 'Crowd',
    desc: 'Three people. Maybe one threat, maybe none.',
    build() {
      const xs = spots(3);
      const armed = Math.random() < 0.7 ? pick([0, 1, 2]) : -1;
      const events = [0, 1, 2].map(i => ({ t: rand(1.2, 4.0), actor: i, pose: i === armed ? 'gun' : harmless() }));
      return {
        actors: xs.map(x => ({ x, pose: pick(['empty', 'back']) })),
        events,
        duration: Math.max(...events.map(e => e.t)) + 3.0,
      };
    },
  },
  {
    id: 'surrender',
    name: 'Surrender',
    desc: 'An armed person may drop the gun and raise their hands. Stop when they do.',
    build() {
      const t = rand(1.0, 2.6);
      return {
        actors: [{ x: pick([0.35, 0.5, 0.65]), pose: 'back' }],
        events: [
          { t: 0.6, actor: 0, pose: 'gun' },
          { t: 0.6 + t, actor: 0, pose: 'surrender' },
        ],
        duration: 0.6 + t + 2.5,
      };
    },
  },
  {
    id: 'bystander',
    name: 'Bystander in Front',
    desc: 'A threat partly behind an innocent person. Take only the shot you can make.',
    build() {
      const x = pick([0.4, 0.5, 0.6]);
      const side = pick([-1, 1]);
      const t = rand(1.2, 3.0);
      return {
        // Drawn in order, so the bystander (second) is in front.
        actors: [{ x: x + side * 0.05, pose: 'back' }, { x: x - side * 0.05, pose: 'empty' }],
        events: [{ t, actor: 0, pose: Math.random() < 0.8 ? 'gun' : harmless() }],
        duration: t + 3.5,
      };
    },
  },
  {
    id: 'walker',
    name: 'Moving Threat',
    desc: 'Someone walks across the room and pulls something out.',
    build() {
      const fromLeft = Math.random() < 0.5;
      const speed = rand(0.09, 0.14);
      const t = rand(1.5, 3.0);
      return {
        actors: [{ x: fromLeft ? -0.08 : 1.08, pose: 'empty', vx: fromLeft ? speed : -speed }],
        events: [{ t, actor: 0, pose: Math.random() < 0.75 ? 'gun' : harmless() }],
        duration: Math.min(10, 1.16 / speed),
      };
    },
  },
  {
    id: 'allclear',
    name: 'All Clear',
    desc: 'Several people turn around. Watch their hands.',
    build() {
      const n = pick([2, 3]);
      const xs = spots(n);
      // Usually nobody is armed; now and then one is, so it stays honest.
      const armed = Math.random() < 0.2 ? pick(xs.map((_, i) => i)) : -1;
      const events = xs.map((_, i) => ({
        t: rand(1.0, 4.5), actor: i, pose: i === armed ? 'gun' : pick(['phone', 'wallet', 'empty', 'surrender']),
      }));
      return {
        actors: xs.map(x => ({ x, pose: 'back' })),
        events,
        duration: Math.max(...events.map(e => e.t)) + 3.0,
      };
    },
  },
  {
    id: 'late',
    name: 'Late Reveal',
    desc: 'A long, quiet wait. Stay switched on.',
    build() {
      const n = pick([1, 2]);
      const xs = spots(n);
      const t = rand(4.0, 7.0);
      const armed = Math.random() < 0.8 ? pick(xs.map((_, i) => i)) : -1;
      return {
        actors: xs.map(x => ({ x, pose: 'empty' })),
        events: xs.map((_, i) => ({ t: t + rand(0, 0.4), actor: i, pose: i === armed ? 'gun' : harmless() })),
        duration: t + 2.8,
      };
    },
  },
  {
    id: 'two',
    name: 'Two Threats',
    desc: 'Three people, two of them armed, reacting at different times.',
    build() {
      const xs = spots(3);
      const innocent = pick([0, 1, 2]);
      const t1 = rand(1.0, 2.5);
      const events = [0, 1, 2].map(i => ({
        t: i === innocent ? rand(1.0, 3.5) : t1 + rand(0, 1.5), actor: i, pose: i === innocent ? harmless() : 'gun',
      }));
      return {
        actors: xs.map(x => ({ x, pose: 'empty' })),
        events,
        duration: Math.max(...events.map(e => e.t)) + 3.5,
      };
    },
  },
];

// Random look for each person.
export function dressActor(spec) {
  return {
    ...spec,
    shirt: pick(SHIRTS),
    jacket: pick(JACKETS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    pants: pick(['#2e3440', '#3b3a36', '#27344a', '#4a4036']),
  };
}
