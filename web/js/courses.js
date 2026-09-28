// courses.js — every drill, Dot Torture, and scenario the user can pick.
// ---------------------------------------------------------------------------
// type 'drill'     timed by the shot timer (run.js)
// type 'dots'      Dot Torture, untimed, stage by stage (dots.js)
// type 'scenario'  shoot / no-shoot judgment scene (scenario.js + scenarios.js)
// type 'popup'     pop-up reaction drill (popdrill.js)
// type 'knife'     parking-lot knife attack (knife.js)
// type 'flip'      flip-tile grid drills (flipdrill.js)
// type 'knife3d'   the knife attack in real 3D (knife3d.js, loaded on demand)
// type 'office3d'  active shooter in an office building, 3D (office3d.js, on demand)
// type 'stage'     USPSA-style stage on the 3D range: paper, no-shoots and steel
//                  at their own distances (stage.js scores it, range3d.js draws it)
//
// Drill fields (all optional except name/type/parTime):
//   layout         range layout to use; null = whatever the user picked (L).
//                  single / bay / popup / star switch to the 3D range when it's
//                  on (range.js TO_3D); 'range3d-*' layouts are always 3D.
//   requiredShots  run ends after this many rounds (0 = ends at the par beep)
//   requiredHits   run ends after this many hits (pop-ups, movers, steel)
//   maxShots       with requiredHits: out of ammo after this many rounds = fail
//   reloadAfter    the reload comes after this shot: the timer shows the reload time
//   clearSteel     with requiredHits: ends when the steel is cleared (a
//                  dueling tree: every paddle over), not at a hit count
//   parTime        seconds from the beep
//   minAHits / minBodyHits / minHeadHits   pass criteria
//   perTargetMin   every bay target needs at least this many hits
//   order: 'ltr'   hits must go left to right across the bay targets
//   sequence       what each shot in turn must hit: 'Head', 'A' or 'body'
//                  (A / C / D), e.g. FAST: two head, then four body
//   evenSplits     every split within this many seconds of the others (rhythm)
//   desc           one line shown in the drill panel

import { SCENARIOS } from './scenarios.js';

export const CATEGORIES = ['Fundamentals', 'Transitions', 'Movement', 'Positions', 'Pop-ups', 'Flip Grid', 'Steel', 'Steel Challenge', 'Stages', 'My Stages', 'Match', 'Precision', 'Judgment'];

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
  // Standard drills, with the par times shooters use for them.
  { name: '5x5 Drill', category: 'Fundamentals', layout: 'single', requiredShots: 5, parTime: 5.0, minAHits: 5,
    desc: '5 rounds in 5 seconds, all in the A zone (the "5-inch circle" at 5 yards).' },
  { name: 'FAST', reloadAfter: 2, category: 'Fundamentals', layout: 'single', requiredShots: 6, parTime: 5.0,
    sequence: ['Head', 'Head', 'body', 'body', 'body', 'body'],
    desc: 'Fundamentals, Accuracy & Speed Test: 2 to the head, reload, 4 to the body. Under 5 s is Advanced.' },
  { name: 'Rhythm Drill', category: 'Fundamentals', layout: 'single', requiredShots: 6, parTime: 3.0, minBodyHits: 6,
    evenSplits: 0.08, desc: '6 body hits at an even pace: every split within 0.08 s of the others. Shoot to a rhythm, not a rush.' },
  { name: '1-Reload-1', reloadAfter: 1, category: 'Fundamentals', layout: 'single', requiredShots: 2, parTime: 3.0, minAHits: 2,
    desc: 'One A-zone hit, a slide-lock reload, another A-zone hit.' },

  // Transitions
  { name: 'Transitions 1-1-1', category: 'Transitions', layout: 'bay', requiredShots: 3, parTime: 2.0,
    perTargetMin: 1, order: 'ltr', desc: 'One round on each target, left to right.' },
  { name: 'Transitions 2-2-2', category: 'Transitions', layout: 'bay', requiredShots: 6, parTime: 3.5,
    perTargetMin: 2, order: 'ltr', desc: 'Two rounds on each target, left to right.' },
  { name: 'Blake Drill', category: 'Transitions', layout: 'bay', requiredShots: 6, parTime: 2.5,
    perTargetMin: 2, order: 'ltr', minAHits: 6, desc: 'Two A-zone hits on each target, left to right. Under 2.5 s; the best do it in under 2.' },
  { name: 'El Presidente (dry)', reloadAfter: 6, category: 'Transitions', layout: 'bay', requiredShots: 12, parTime: 10.0,
    perTargetMin: 4, desc: '2 on each target, reload, 2 on each again. Timer runs through the reload.' },

  // Movement
  // Kneeling / prone (3D): the view is at that eye height.
  { name: 'Kneeling 2-2-2', category: 'Positions', layout: 'range3d-bay', requiredShots: 6, parTime: 4.0, perTargetMin: 2, stance: 'kneel',
    desc: 'From kneeling (the view is at kneeling eye height): two on each target, left to right.' },
  { name: 'Prone 2-2-2', category: 'Positions', layout: 'range3d-bay', requiredShots: 6, parTime: 5.0, perTargetMin: 2, stance: 'prone', minAHits: 4,
    desc: 'Prone (eyes 35 cm off the ground): two on each target, at least 4 A. A steady position - make the hits count.' },
  { name: 'Stand and Kneel', category: 'Positions', layout: 'range3d-bay', requiredShots: 12, parTime: 7.0, perTargetMin: 4,
    stanceAfter: { shots: 6, stance: 'kneel' },
    desc: 'Two on each target standing, then drop to kneeling (the view goes down) and two on each again. The timer runs through the position change.' },
  // Shooting on the move (3D): the view walks after the beep; shots count on the way.
  { name: 'Walk Up', category: 'Movement', layout: 'range3d-bay', requiredShots: 6, parTime: 6.0, perTargetMin: 2,
    advance: { from: [0, -6], to: [0, -1], speed: 0.9 }, minBodyHits: 6,
    desc: 'Shooting on the move: at the beep you walk forward (5 yd, slow heel-to-toe) - 2 on each target while moving. Keep the dot steady as the view bobs.' },
  { name: 'Back Up', category: 'Movement', layout: 'range3d-bay', requiredShots: 6, parTime: 6.0, perTargetMin: 2,
    advance: { from: [0, 2], to: [0, -3], speed: 0.8 }, minBodyHits: 6,
    desc: 'Shooting while retreating: at the beep you back away 5 yd from close targets - 2 on each while moving.' },
  { name: 'Crossing Fire', category: 'Movement', layout: 'range3d-bay', requiredShots: 6, parTime: 7.0, perTargetMin: 2,
    advance: { from: [-3, -2], to: [3, -2], speed: 0.9 }, minBodyHits: 6,
    desc: 'Moving across: at the beep you walk 6 m to the right, parallel to the targets - 2 on each while moving.' },
  { name: 'Movers', category: 'Movement', layout: 'movers', requiredHits: 4, maxShots: 10, parTime: 8.0,
    desc: 'Hit 4 moving targets. 10 rounds max.' },

  // Steel
  { name: 'Texas Star', category: 'Steel', layout: 'star', requiredHits: 5, maxShots: 15, parTime: 8.0,
    desc: 'Clear all 5 plates. It starts spinning after the first plate falls.' },
  { name: 'Plate Rack', category: 'Steel', layout: 'range3d-plates', requiredHits: 6, maxShots: 12, parTime: 6.0,
    desc: 'Six 8-inch plates on a rack at 10 yards (3D). Knock them all down.' },
  { name: 'Dueling Tree', category: 'Steel', layout: 'range3d-tree', requiredHits: 6, clearSteel: true, maxShots: 14, parTime: 5.0,
    desc: 'Six paddles on a tree at 10 yards (3D). Throw every one over to the right. Hit one that\'s already over and it swings back.' },
  { name: 'Poppers', category: 'Steel', layout: 'range3d-poppers', requiredHits: 4, maxShots: 8, parTime: 4.0,
    desc: 'Four full-size poppers (3D). Every one has to fall.' },
];

const POPUPS = [
  { name: 'Pop-up Reaction', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 10, together: 1, upTime: 2.5, gap: [0.8, 2.5], passPct: 80,
    desc: '10 targets, one at a time. Hit each before it drops.' },
  { name: 'Pop-up Pairs', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 6, together: 2, upTime: 3.0, gap: [1.0, 2.5], passPct: 80,
    desc: 'Two targets at once. Hit both before they drop.' },
  { name: 'Pop-up Speed', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 12, together: 1, upTime: [2.0, 0.8], gap: [0.6, 1.8], passPct: 75,
    desc: 'Each target stays up a little less than the one before.' },
];

const FLIP = [
  { name: 'Flip Grid', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'flash',
    exposures: 15, together: 1, upTime: 1.6, gap: [0.5, 1.8], passPct: 80,
    desc: 'Plates spin to an orange target for a moment. Hit each before it spins back.' },
  { name: 'Flip Grid Pairs', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'flash',
    exposures: 8, together: 2, upTime: 2.2, gap: [0.8, 2.0], passPct: 100, failOnMiss: true,
    desc: 'Two plates at a time. Hit both before they spin back: one that gets away fails the run.' },
  { name: 'Numbered Grid 1–12', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'order', parTime: 12,
    desc: 'At the beep all plates spin to numbers. Shoot 1 to 12 in order. Wrong number = penalty.' },
  { name: 'Called Numbers', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'called',
    calls: 10, gap: [0.7, 1.8], callPar: 1.5,
    desc: 'A voice calls a number; shoot that plate. The numbers reshuffle after every hit.' },
  { name: 'Called Shapes & Colours', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'shape',
    calls: 10, gap: [0.7, 1.8], callPar: 1.8, callKinds: ['color', 'shape', 'both'],
    desc: 'A voice calls a colour, a shape, or both ("Blue", "Star", "Red triangle"). Shoot a plate that matches. The plates reshuffle after every hit.' },
];

// Stages. Items: type 'paper' | 'noshoot' | 'popper' | 'mini' | 'plate', x in
// metres (left -, right +, from the shooting position), yd = distance in yards.
// No-shoots are listed after the paper they cover and sit a little in front;
// dy raises (+) or lowers (-) one, in metres. Plates may set h (stand height).
// Paper may carry hard cover: hard: { side: 'left'|'right'|'top'|'bottom', cm }
// paints that many cm in from that edge black; hits there can't score.
// swing: { by: 'S1', rest? } hangs a paper as a swinger released by that steel
// (its activator); it waits held to one side, behind cover.
// turn: { by: 'S1', show? } makes a paper a drop turner: edge-on until that
// steel falls, then it faces you for `show` s and turns away (disappearing).
// run: { by: 'S1', to, speed? } puts a paper on a trolley: when that steel
// falls it runs across to x = to (m) at speed m/s, usually wall to wall.
// A course's time: 'night' (or morning / evening) sets the 3D range's time of
// day for it, whatever Setup says.
// positions: [{ x, yd, look?: { x, yd } }, ...] (in stage): where you shoot
// from (x m, yd forward); items with pos: k are shot from position k (default
// 0). Once that array is done the view runs to the next position
// (onMove: true - it walks there slowly and shots count on the way;
// stance: 'kneel' / 'prone' - eyes lower, CONFIG.range3d.stances).
// A wall may have one port or several (ports: [...], a barricade).
// strings: [{ name, say? }, ...] (in stage, course type 'classifier'): the
// stage is shot once per string, steel reset between them, paper scored at
// the end.
// scoring: 'virginia' (in stage) = Virginia Count: exactly the round count,
// each extra shot a procedural (CONFIG.stage.procedural).
// Steel plates may set in (diameter in inches, default 8) or rect: [w, h]
// inches; stop: true makes one the stop plate (Steel Challenge style
// courses, type 'strings').
// pop: { by: 'S1' } makes a paper an activated pop-up: flat on its hinge
// until that steel falls, then up for good (not a disappearing target).
// bob: { by: 'S1', times? } makes a paper a bobber: sunk behind low cover
// until that steel falls, then it rises and sinks `times` times.
// props: plywood walls { type: 'wall', x, yd, w?, h?, port?: { x, y, w, h } }
// (port = an opening to shoot through, y = its centre height, m),
// { type: 'barrel', x, yd } and { type: 'clamshell', x, yd, by: 'S1' } (a
// drop-down cover in front of a target that falls when that steel is hit).
// They stop rounds.
// Every paper needs 2 hits and every piece of steel has to fall (CONFIG.stage).
const STAGES = [
  { name: 'Mini Poppers', category: 'Steel', parTime: 5.0, maxShots: 10,
    desc: 'Five mini poppers at 10 yards (3D). Knock them all down.',
    stage: { items: [-2.4, -1.2, 0, 1.2, 2.4].map(x => ({ type: 'mini', x, yd: 10 })) } },
  { name: 'Paper and Steel', category: 'Stages', parTime: 8.0, maxShots: 16,
    desc: 'Two paper at 7 yd, two poppers, two plates. 2 hits per paper, all steel down.',
    stage: { items: [
      { type: 'plate', x: -3.6, yd: 10 },
      { type: 'paper', x: -1.6, yd: 7 },
      { type: 'popper', x: -0.6, yd: 13 },
      { type: 'popper', x: 0.8, yd: 13 },
      { type: 'paper', x: 1.8, yd: 7 },
      { type: 'plate', x: 3.8, yd: 10 },
    ], props: [{ type: 'barrel', x: 0.1, yd: 9 }] } },
  { name: 'No-Shoots', category: 'Stages', parTime: 8.0, maxShots: 14,
    desc: 'Three paper, each partly behind a white no-shoot, plus a mini popper. Hitting a no-shoot costs 10.',
    stage: { items: [
      { type: 'paper', x: -2.2, yd: 8 },
      { type: 'noshoot', x: -1.9, yd: 7.8, dy: -0.25 },
      { type: 'paper', x: 0, yd: 9 },
      { type: 'noshoot', x: -0.3, yd: 8.8, dy: 0.25 },
      { type: 'paper', x: 2.2, yd: 8 },
      { type: 'noshoot', x: 2.55, yd: 7.8, dy: -0.1 },
      { type: 'mini', x: -4.6, yd: 12 },
    ] } },
  { name: 'Hard Cover', category: 'Stages', parTime: 8.0, maxShots: 14,
    desc: 'Three paper partly behind black hard cover (hits there don\'t count) and a popper. 2 per paper, the popper down.',
    stage: { items: [
      { type: 'paper', x: -2.3, yd: 8, hard: { side: 'right', cm: 16 } },
      { type: 'paper', x: 0, yd: 11, hard: { side: 'bottom', cm: 38 } },
      { type: 'paper', x: 2.3, yd: 8, hard: { side: 'left', cm: 14 } },
      { type: 'popper', x: 1.2, yd: 16 },
    ] } },
  { name: 'Through the Port', category: 'Stages', parTime: 7.0, maxShots: 12,
    desc: 'Shoot through a port in a plywood wall: two paper and two plates behind it. Rounds that hit the wall are misses.',
    stage: {
      items: [
        { type: 'paper', x: -0.9, yd: 8 },
        { type: 'plate', x: -0.35, yd: 12 },
        { type: 'plate', x: 0.35, yd: 12 },
        { type: 'paper', x: 0.9, yd: 8 },
      ],
      props: [{ type: 'wall', x: 0, yd: 1.7, w: 3.2, h: 2.2, port: { x: 0, y: 1.55, w: 0.62, h: 0.46 } }],
    } },
  { name: 'Swinger', category: 'Stages', parTime: 9.0, maxShots: 14,
    desc: 'Hit the popper to release the swinger from behind the wall, then catch it as it swings. Plus two paper. 2 per paper.',
    stage: {
      items: [
        { type: 'paper', x: -2.4, yd: 7 },
        { type: 'popper', x: -0.9, yd: 12 },
        { type: 'paper', x: 1.2, yd: 9, swing: { by: 'S1', rest: 1.0 } },
        { type: 'paper', x: 3.4, yd: 7 },
      ],
      props: [{ type: 'wall', x: 2.65, yd: 8.2, w: 1.22, h: 2.44 }],
    } },
  { name: 'Swinging No-Shoot', category: 'Stages', parTime: 10.0, maxShots: 14,
    desc: 'The popper releases a no-shoot from behind the wall: it swings back and forth across the middle target. Take the middle one before you hit the popper, or time your shots between swings. 2 per paper.',
    stage: {
      items: [
        { type: 'paper', x: -2.8, yd: 7 },
        { type: 'paper', x: 0.3, yd: 9 },
        { type: 'noshoot', x: 0.3, yd: 8.6, swing: { by: 'S1', rest: -1.0 } },
        { type: 'popper', x: 1.9, yd: 12 },
        { type: 'paper', x: 2.9, yd: 7 },
      ],
      props: [{ type: 'wall', x: -1.2, yd: 8.2, w: 1.22, h: 2.44 }],
    } },
  { name: 'Drop Turner', category: 'Stages', parTime: 8.0, maxShots: 12,
    desc: 'Two paper, then the popper: it turns the middle target to face you for one second. Catch it with two before it turns away. Misses on it aren\'t penalised once it has turned.',
    stage: {
      items: [
        { type: 'paper', x: -2.2, yd: 7 },
        { type: 'paper', x: 0.3, yd: 8, turn: { by: 'S1' } },
        { type: 'paper', x: 2.4, yd: 7 },
        { type: 'popper', x: -0.9, yd: 11 },
      ],
    } },
  { name: 'Activated Mover', category: 'Stages', parTime: 9.0, maxShots: 14,
    desc: 'A paper each side, then the popper: it sends a target running across from behind the left wall to behind the right one. Lead it and get two hits. Misses on the mover aren\'t penalised once it has run.',
    stage: {
      items: [
        { type: 'paper', x: -4.0, yd: 7 },
        { type: 'popper', x: 0, yd: 12 },
        { type: 'paper', x: -2.6, yd: 9, run: { by: 'S1', to: 2.6 } },
        { type: 'paper', x: 4.0, yd: 7 },
      ],
      props: [
        { type: 'wall', x: -2.6, yd: 8.3, w: 1.22, h: 1.83 },
        { type: 'wall', x: 2.6, yd: 8.3, w: 1.22, h: 1.83 },
      ],
    } },
  { name: 'Clamshell', category: 'Stages', parTime: 8.0, maxShots: 12,
    desc: 'The middle target is behind a drop-down cover. Hit the plate to drop it, then shoot all three, two each.',
    stage: {
      items: [
        { type: 'paper', x: -2.0, yd: 7 },
        { type: 'paper', x: 0, yd: 9 },
        { type: 'paper', x: 2.0, yd: 7 },
        { type: 'plate', x: 3.6, yd: 10 },
      ],
      props: [{ type: 'clamshell', x: 0, yd: 8.6, by: 'S1' }],
    } },
  { name: 'Swing and Drop', category: 'Stages', parTime: 12.0, maxShots: 22,
    desc: 'A classifier-style stage. Left: a paper beside a no-shoot, then two plates. The popper releases the swinger from behind the right wall AND drops the clamshell in front of the middle paper. 2 per paper, all steel down.',
    stage: {
      start: 'wrists above your shoulders (surrender)',
      items: [
        { type: 'paper', x: -3.0, yd: 7 },
        { type: 'noshoot', x: -2.65, yd: 6.8, dy: -0.2 },
        { type: 'plate', x: -2.75, yd: 10 },
        { type: 'plate', x: -2.2, yd: 10, h: 1.2 },
        { type: 'popper', x: -1.1, yd: 12 },
        { type: 'paper', x: 0.6, yd: 9 },
        { type: 'paper', x: 2.2, yd: 10, swing: { by: 'S3' } },
      ],
      props: [
        { type: 'clamshell', x: 0.6, yd: 8.6, by: 'S3' },
        { type: 'wall', x: 3.55, yd: 9.3, w: 1.22, h: 2.44 },
      ],
    } },
  { name: 'Bobber', category: 'Stages', parTime: 10.0, maxShots: 14,
    desc: 'A paper each side and a popper. The popper makes the middle target bob up from behind the low wall three times: about a second up each time. Get two hits on it. Misses on it aren\'t penalised once it has bobbed.',
    stage: {
      items: [
        { type: 'paper', x: -2.6, yd: 7 },
        { type: 'popper', x: 1.0, yd: 12 },
        { type: 'paper', x: -0.4, yd: 9, bob: { by: 'S1' } },
        { type: 'paper', x: 2.6, yd: 7 },
      ],
      props: [{ type: 'wall', x: -0.4, yd: 8.4, w: 1.22, h: 1.0 }],
    } },
  { name: 'Steel Challenge style: Five Plates', category: 'Steel Challenge', type: 'strings', parTime: 14.0,
    desc: 'Four plates and the stop plate (the one with the red pole) - shoot the stop plate last. Five strings: the steel resets between them, the slowest is thrown out, the other four are added up. A plate left up costs 3 s.',
    stage: {
      items: [
        { type: 'plate', x: -3.0, yd: 10, in: 10, h: 1.3 },
        { type: 'plate', x: -1.2, yd: 15, in: 12, h: 1.3 },
        { type: 'plate', x: 1.2, yd: 15, in: 12, h: 1.3 },
        { type: 'plate', x: 3.0, yd: 10, in: 10, h: 1.3 },
        { type: 'plate', x: 0, yd: 12, in: 12, h: 1.3, stop: true },
      ],
    } },
  { name: 'Steel Challenge style: Wide Open', category: 'Steel Challenge', type: 'strings', parTime: 16.0,
    desc: 'Five big rectangles (18 x 24 in) spread wide from 7 to 20 yards, stop plate in the middle. Big swings between plates: drive the gun and stop it. Five strings, slowest thrown out.',
    stage: {
      items: [
        { type: 'plate', x: -4.4, yd: 7, rect: [18, 24], h: 1.0 },
        { type: 'plate', x: -2.2, yd: 14, rect: [18, 24], h: 1.0 },
        { type: 'plate', x: 2.2, yd: 14, rect: [18, 24], h: 1.0 },
        { type: 'plate', x: 4.4, yd: 7, rect: [18, 24], h: 1.0 },
        { type: 'plate', x: 0, yd: 20, rect: [18, 24], h: 1.0, stop: true },
      ],
    } },
  { name: 'Steel Challenge style: Near and Far', category: 'Steel Challenge', type: 'strings', parTime: 18.0,
    desc: 'Two close 12 in plates, two small 10 in plates at 25 yards, and a rectangle stop plate. Fast on the close ones, slow down for the far ones. Five strings, slowest thrown out.',
    stage: {
      items: [
        { type: 'plate', x: -1.6, yd: 7, in: 12, h: 1.3 },
        { type: 'plate', x: 1.6, yd: 7, in: 12, h: 1.3 },
        { type: 'plate', x: -1.8, yd: 25, in: 10, h: 1.3 },
        { type: 'plate', x: 1.8, yd: 25, in: 10, h: 1.3 },
        { type: 'plate', x: 0, yd: 15, rect: [18, 24], h: 1.0, stop: true },
      ],
    } },
  { name: 'Virginia Count: Three at Ten', category: 'Stages', parTime: 5.0, maxShots: 12,
    desc: 'Three paper at 10 yards and a popper, Virginia Count: exactly 7 rounds. Every extra shot is a procedural (-10), so make-up shots cost you.',
    stage: {
      start: 'standing in the box, loaded gun on the table, hands at your sides',
      scoring: 'virginia',
      items: [
        { type: 'paper', x: -1.8, yd: 10 },
        { type: 'paper', x: 0, yd: 10 },
        { type: 'paper', x: 1.8, yd: 10 },
        { type: 'popper', x: 3.4, yd: 12 },
      ],
    } },
  { name: 'Classifier style: Three Strings', category: 'Stages', type: 'classifier', parTime: 6.0, maxShots: 40,
    desc: 'Three paper at 7 yards and a popper, shot three times: freestyle, strong hand only, weak hand only (the RO calls each string). 2 per paper and the popper each string; the paper is scored at the end (best 6 per paper), one hit factor over the three times added up.',
    stage: {
      strings: [{ name: 'Freestyle' }, { name: 'Strong hand only' }, { name: 'Weak hand only' }],
      items: [
        { type: 'paper', x: -1.6, yd: 7 },
        { type: 'paper', x: 0, yd: 7 },
        { type: 'paper', x: 1.6, yd: 7 },
        { type: 'popper', x: 3.0, yd: 10 },
      ],
    } },
  { name: 'Two Positions', category: 'Stages', parTime: 10.0, maxShots: 16,
    desc: 'Start on the left: two paper and a plate. When they\'re done you run to the right (the view moves; no shots on the way) past the wall to two more paper and a popper. 2 per paper, all steel down.',
    stage: {
      start: 'standing at position 1, gun held at low ready',
      positions: [{ x: -2.5, yd: 0 }, { x: 2.5, yd: 2 }],
      items: [
        { type: 'paper', x: -4.0, yd: 8 },
        { type: 'paper', x: -1.6, yd: 8 },
        { type: 'plate', x: -2.8, yd: 12 },
        { type: 'paper', x: 1.4, yd: 9, pos: 1 },
        { type: 'paper', x: 3.8, yd: 9, pos: 1 },
        { type: 'popper', x: 2.6, yd: 13, pos: 1 },
      ],
      props: [{ type: 'wall', x: 0, yd: 5, w: 1.22, h: 2.2 }],
    } },
  { name: 'Walk and Shoot', category: 'Stages', parTime: 12.0, maxShots: 18,
    desc: 'Start left: two paper. Then walk right (slowly - shots count on the way) and engage the next two paper while moving, finishing with the popper from where you stop. 2 per paper, popper down.',
    stage: {
      start: 'standing at position 1, hands relaxed at your sides',
      positions: [{ x: -3, yd: 0 }, { x: 3, yd: 0, onMove: true }],
      items: [
        { type: 'paper', x: -4.2, yd: 7 },
        { type: 'paper', x: -2.2, yd: 8 },
        { type: 'paper', x: 0.2, yd: 9, pos: 1 },
        { type: 'paper', x: 2.4, yd: 8, pos: 1 },
        { type: 'popper', x: 3.4, yd: 13, pos: 1 },
      ],
    } },
  { name: 'Low Port', category: 'Stages', parTime: 12.0, maxShots: 16,
    desc: 'Start standing on the left: two paper. Then move right and kneel behind the wall: two paper and a plate, seen only through a low port. Rounds into the wall are misses. 2 per paper, the plate down.',
    stage: {
      start: 'standing at position 1, hands relaxed at your sides',
      positions: [{ x: -2.5, yd: 0 }, { x: 1.5, yd: 1, stance: 'kneel' }],
      items: [
        { type: 'paper', x: -4.0, yd: 7 },
        { type: 'paper', x: -1.9, yd: 8 },
        { type: 'paper', x: 0.7, yd: 9, pos: 1 },
        { type: 'paper', x: 2.5, yd: 9, pos: 1 },
        { type: 'plate', x: 1.6, yd: 12, pos: 1 },
      ],
      props: [{ type: 'wall', x: 1.5, yd: 2.5, w: 2.44, h: 2.2, port: { x: 0, y: 0.95, w: 0.6, h: 0.42 } }],
    } },
  { name: 'Barricade', category: 'Stages', parTime: 14.0, maxShots: 12,
    desc: 'A VTAC-style barricade 1.5 yd in front of you with three small ports. Standing: 2 on the left target through the top port. Kneel: 2 on the middle target through the middle port. Prone: 2 on the low right target through the bottom port. Rounds into the barricade are misses.',
    stage: {
      start: 'standing behind the barricade, hands relaxed at your sides',
      positions: [{ x: 0, yd: 0 }, { x: 0, yd: 0, stance: 'kneel' }, { x: 0, yd: 0, stance: 'prone' }],
      items: [
        { type: 'paper', x: -0.55, yd: 10 },
        { type: 'paper', x: 0.1, yd: 10, pos: 1 },
        { type: 'paper', x: 0.6, yd: 10, pos: 2, dy: -0.45 },
      ],
      props: [{ type: 'wall', x: 0, yd: 1.5, w: 1.22, h: 2.13, ports: [{ y: 1.55, w: 0.3, h: 0.36 }, { y: 1.0, w: 0.3, h: 0.36 }, { y: 0.36, w: 0.34, h: 0.26 }] }],
    } },
  { name: 'Low Light: Under the Lights', category: 'Stages', parTime: 9.0, maxShots: 16, time: 'night',
    desc: 'A night stage: the bay lit only by a floodlight behind you (whatever the Setup time of day). Three paper, two plates in the half-dark and a popper. 2 per paper, all steel down.',
    stage: {
      items: [
        { type: 'paper', x: -2.2, yd: 7 },
        { type: 'paper', x: 0, yd: 9 },
        { type: 'paper', x: 2.2, yd: 7 },
        { type: 'plate', x: -4.4, yd: 10 },
        { type: 'plate', x: 4.4, yd: 10 },
        { type: 'popper', x: 1.1, yd: 15 },
      ],
    } },
  { name: 'Pop-up Surprise', category: 'Stages', parTime: 8.0, maxShots: 14,
    desc: 'Two paper and a plate. The plate pops up two more paper that were lying flat on their hinges - they stay up, so they must be shot (2 each).',
    stage: {
      items: [
        { type: 'paper', x: -2.8, yd: 7 },
        { type: 'plate', x: 0, yd: 10 },
        { type: 'paper', x: 2.8, yd: 7 },
        { type: 'paper', x: -1.2, yd: 12, pop: { by: 'S1' } },
        { type: 'paper', x: 1.2, yd: 12, pop: { by: 'S1' } },
      ],
    } },
  { name: 'Three Positions', category: 'Stages', parTime: 16.0, maxShots: 24,
    desc: 'Start left at low ready: two paper and a mini popper. Run to the middle: two paper and a popper - the popper pops up a target you\'ll see from the right. Run right: two paper and a plate. 2 per paper, all steel down.',
    stage: {
      start: 'standing at position 1, gun held at low ready',
      positions: [{ x: -3, yd: 0 }, { x: 0, yd: 3 }, { x: 3, yd: 1 }],
      items: [
        { type: 'paper', x: -4.4, yd: 7 },
        { type: 'paper', x: -2.2, yd: 8 },
        { type: 'mini', x: -3.3, yd: 11 },
        { type: 'paper', x: -0.9, yd: 10, pos: 1 },
        { type: 'paper', x: 0.9, yd: 10, pos: 1 },
        { type: 'popper', x: 0, yd: 14, pos: 1 },
        { type: 'paper', x: 2.4, yd: 8, pos: 2 },
        { type: 'paper', x: 4.4, yd: 8, pos: 2, pop: { by: 'S2' } },
        { type: 'plate', x: 3.4, yd: 12, pos: 2 },
      ],
      props: [
        { type: 'wall', x: -1.4, yd: 4.5, w: 1.22, h: 2.2 },
        { type: 'wall', x: 1.8, yd: 5, w: 1.22, h: 2.2 },
      ],
    } },
  { name: 'Accelerator', category: 'Stages', parTime: 6.0, maxShots: 10,
    desc: 'Three targets at 15, 10 and 5 yards, far to near, 2 hits each. Slow down for the far one, speed up as they get closer.',
    stage: { items: [
      { type: 'paper', x: -2.2, yd: 15 },
      { type: 'paper', x: 0, yd: 10 },
      { type: 'paper', x: 2.2, yd: 5 },
    ] } },
  { name: 'Doubles 3-7-15', category: 'Stages', parTime: 5.0, maxShots: 10,
    desc: 'A pair on a target at 3 yards, 7 yards and 15 yards. Same sights-and-trigger, very different pace.',
    stage: { items: [
      { type: 'paper', x: -1.4, yd: 3 },
      { type: 'paper', x: 0.2, yd: 7 },
      { type: 'paper', x: 1.9, yd: 15 },
    ] } },
  { name: 'Long Course', category: 'Stages', parTime: 16.0, maxShots: 26,
    desc: 'Paper from 5 to 15 yards, plates, mini poppers and a far popper. 2 per paper, all steel down.',
    stage: { items: [
      { type: 'paper', x: -3.2, yd: 5 },
      { type: 'plate', x: -4.6, yd: 10 },
      { type: 'plate', x: -3.9, yd: 10 },
      { type: 'plate', x: -3.2, yd: 10 },
      { type: 'paper', x: -1.4, yd: 9 },
      { type: 'noshoot', x: -1.0, yd: 8.8, dy: -0.3 },
      { type: 'mini', x: -0.3, yd: 15 },
      { type: 'popper', x: 0.6, yd: 20 },
      { type: 'mini', x: 1.5, yd: 15 },
      { type: 'paper', x: 2.0, yd: 12 },
      { type: 'paper', x: 3.4, yd: 6 },
    ] } },
];

// The stage's items with their target ids: P1.. for paper, NS1.. for
// no-shoots, S1.. for steel. range3d.js and stage.js both use this.
export function stageTargets(stage) {
  let p = 0, n = 0, s = 0;
  return stage.items.map(it => ({
    ...it, id: it.type === 'paper' ? `P${++p}` : it.type === 'noshoot' ? `NS${++n}` : `S${++s}`,
    steel: it.type !== 'paper' && it.type !== 'noshoot',
  }));
}

// A match: its stages (by course name) shot one after another; main.js runs
// it (type 'match') and shows the results at the end.
const MATCHES = [
  { name: 'Mini Match: 4 Stages', category: 'Match', type: 'match',
    stages: ['Paper and Steel', 'Swinger', 'Two Positions', 'Virginia Count: Three at Ten'],
    desc: 'Four stages in a row, like a local match: each loads after the last (press Space to shoot it; I to walk the targets first). Results at the end: points, time and hit factor per stage, and the match total.' },
  { name: 'Night Match: 3 Stages', category: 'Match', type: 'match', time: 'night',
    stages: ['Low Light: Under the Lights', 'Pop-up Surprise', 'Drop Turner'],
    desc: 'A low-light match: three stages, all at night under the floodlight. Results at the end: points, time and hit factor per stage, and the match total.' },
  { name: 'Field Match: 5 Stages', category: 'Match', type: 'match',
    stages: ['Walk and Shoot', 'Low Port', 'Swinging No-Shoot', 'Barricade', 'Hard Cover'],
    desc: 'Five stages that make you move and change position: shooting on the move, a low port, a swinging no-shoot, a barricade (standing, kneeling, prone) and hard cover. Results at the end: points, time and hit factor per stage, and the match total.' },
  { name: 'Steel Match: 3 Stages', category: 'Match', type: 'match',
    stages: ['Steel Challenge style: Five Plates', 'Steel Challenge style: Wide Open', 'Steel Challenge style: Near and Far'],
    desc: 'The three Steel Challenge style stages in a row, five strings each. Lowest total time wins: the results show each stage\'s total and the match total.' },
];

const DOTS = [
  { name: 'Dot Torture', category: 'Precision', type: 'dots', layout: 'dots',
    desc: '50 rounds on 10 small dots, untimed. Every round must be in the right dot.' },
];

const SCENES = [
  { name: 'Active Shooter: Office Building (3D)', category: 'Judgment', type: 'office3d', layout: 'office3d',
    desc: 'Radio call, walk in past a wounded man, then clear a cubicle office: gunmen pop up, then a hostage-taker.' },
  { name: 'Parking Lot: Knife Attack (3D)', category: 'Judgment', type: 'knife3d', layout: 'lot3d',
    desc: 'The knife attack in realistic 3D: a man with a knife ~30 ft away. If he charges, stop him before he reaches you.' },
  { name: 'Parking Lot: Knife Attack', category: 'Judgment', type: 'knife', layout: 'lot',
    desc: 'A man with a knife, ~30 ft away in a parking lot. If he charges, stop him before he reaches you.' },
  { name: 'Random Scenario', category: 'Judgment', type: 'scenario', layout: 'scene', template: null,
    desc: 'A random scene from the list below.' },
  ...SCENARIOS.map(s => ({ name: s.name, category: 'Judgment', type: 'scenario', layout: 'scene', template: s.id, desc: s.desc })),
];

export const COURSES = [
  ...DRILLS.map(d => ({ type: 'drill', ...d })),
  ...POPUPS,
  ...FLIP,
  ...STAGES.map(c => ({ type: 'stage', layout: 'range3d-stage', ...c })),
  ...MATCHES,
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
