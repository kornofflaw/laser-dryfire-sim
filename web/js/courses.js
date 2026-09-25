// courses.js — every drill, Dot Torture, and scenario the user can pick.
// ---------------------------------------------------------------------------
// type 'drill'     timed by the shot timer (run.js)
// type 'dots'      Dot Torture, untimed, stage by stage (dots.js)
// type 'scenario'  shoot / no-shoot judgment scene (scenario.js + scenarios.js)
//
// Drill fields (all optional except name/type/parTime):
//   layout         range layout to use; null = whatever the user picked (L)
//   requiredShots  run ends after this many rounds (0 = ends at the par beep)
//   requiredHits   run ends after this many hits (pop-ups, movers, steel)
//   maxShots       with requiredHits: out of ammo after this many rounds = fail
//   parTime        seconds from the beep
//   minAHits / minBodyHits / minHeadHits   pass criteria
//   perTargetMin   every bay target needs at least this many hits
//   order: 'ltr'   hits must go left to right across the bay targets
//   desc           one line shown in the drill panel

import { SCENARIOS } from './scenarios.js';

export const CATEGORIES = ['Fundamentals', 'Transitions', 'Movement', 'Steel', 'Precision', 'Judgment'];

const DRILLS = [
  // Fundamentals
  { name: 'Free Run', category: 'Fundamentals', layout: null, requiredShots: 0, parTime: 5.0,
    desc: 'Shoot anything until the par beep. L changes the targets.' },
  { name: 'Bill Drill', category: 'Fundamentals', layout: 'single', requiredShots: 6, parTime: 2.0,
    desc: '6 rounds on one target, all A zone ideally.' },
  { name: 'Doubles', category: 'Fundamentals', layout: 'single', requiredShots: 2, parTime: 1.0, minAHits: 2,
    desc: 'A fast pair. Both must be A-zone hits.' },
  { name: 'Par String (5)', category: 'Fundamentals', layout: 'single', requiredShots: 5, parTime: 3.0,
    desc: '5 rounds on one target inside par.' },
  { name: 'Head Box', category: 'Fundamentals', layout: 'single', requiredShots: 3, parTime: 3.0, minHeadHits: 3,
    desc: '3 rounds, all in the head box.' },
  { name: 'Mozambique', category: 'Fundamentals', layout: 'single', requiredShots: 3, parTime: 2.5,
    minBodyHits: 2, minHeadHits: 1, desc: '2 to the body, 1 to the head.' },

  // Transitions
  { name: 'Transitions 1-1-1', category: 'Transitions', layout: 'bay', requiredShots: 3, parTime: 2.0,
    perTargetMin: 1, order: 'ltr', desc: 'One round on each target, left to right.' },
  { name: 'Transitions 2-2-2', category: 'Transitions', layout: 'bay', requiredShots: 6, parTime: 3.5,
    perTargetMin: 2, order: 'ltr', desc: 'Two rounds on each target, left to right.' },
  { name: 'El Presidente (dry)', category: 'Transitions', layout: 'bay', requiredShots: 12, parTime: 10.0,
    perTargetMin: 4, desc: '2 on each target, reload, 2 on each again. Timer runs through the reload.' },

  // Movement
  { name: 'Pop-ups', category: 'Movement', layout: 'popup', requiredHits: 6, maxShots: 12, parTime: 6.0,
    desc: 'Hit 6 pop-up targets. 12 rounds max.' },
  { name: 'Movers', category: 'Movement', layout: 'movers', requiredHits: 4, maxShots: 10, parTime: 8.0,
    desc: 'Hit 4 moving targets. 10 rounds max.' },

  // Steel
  { name: 'Texas Star', category: 'Steel', layout: 'star', requiredHits: 5, maxShots: 15, parTime: 8.0,
    desc: 'Clear all 5 plates. It starts spinning after the first plate falls.' },
];

const DOTS = [
  { name: 'Dot Torture', category: 'Precision', type: 'dots', layout: 'dots',
    desc: '50 rounds on 10 small dots, untimed. Every round must be in the right dot.' },
];

const SCENES = [
  { name: 'Random Scenario', category: 'Judgment', type: 'scenario', layout: 'scene', template: null,
    desc: 'A random scene from the list below.' },
  ...SCENARIOS.map(s => ({ name: s.name, category: 'Judgment', type: 'scenario', layout: 'scene', template: s.id, desc: s.desc })),
];

export const COURSES = [
  ...DRILLS.map(d => ({ type: 'drill', ...d })),
  ...DOTS,
  ...SCENES,
];

// Dot Torture sequence (50 rounds). Each stage: which dots, rounds per dot on
// each draw, how many draws, and a note.
export const DOT_TORTURE = [
  { dots: [1], rounds: [5], draws: 1, note: 'Draw, 5 rounds slow fire' },
  { dots: [2], rounds: [1], draws: 5, note: 'Draw and fire 1 round, 5 times' },
  { dots: [3, 4], rounds: [1, 1], draws: 4, note: 'Draw, 1 on #3 and 1 on #4, 4 times' },
  { dots: [5], rounds: [5], draws: 1, note: 'Draw, 5 rounds strong hand only' },
  { dots: [6, 7], rounds: [2, 2], draws: 3, note: 'Draw, 2 on #6 and 2 on #7, 3 times' },
  { dots: [8], rounds: [5], draws: 1, note: 'Draw, 5 rounds weak hand only' },
  { dots: [9, 10], rounds: [1, 1], draws: 5, note: 'Draw, 1 on #9 and 1 on #10, 5 times' },
];
