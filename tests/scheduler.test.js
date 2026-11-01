// Run with: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../scheduler.js');

function proj(tasks, opts) {
  return Object.assign({
    name: 'T', start: '2025-01-06', skipWeekends: true, // Monday
    tasks: tasks.map((t, i) => Object.assign({ id: i + 1, name: 'T' + (i + 1), level: 0, duration: 1, preds: [] }, t))
  }, opts || {});
}
const L = (id, type = 'FS', lag = 0) => ({ id, type, lag });

test('calendar skips weekends both ways', () => {
  const cal = new G.Calendar('2025-01-06', true); // Mon
  assert.equal(G.formatDate(cal.dateOf(0)), '2025-01-06');
  assert.equal(G.formatDate(cal.dateOf(4)), '2025-01-10'); // Fri
  assert.equal(G.formatDate(cal.dateOf(5)), '2025-01-13'); // next Mon
  assert.equal(G.formatDate(cal.dateOf(-1)), '2025-01-03'); // prev Fri
  for (let i = -12; i < 40; i++) assert.equal(cal.indexOf(cal.dateOf(i)), i);
  assert.equal(cal.indexOf(G.parseDate('2025-01-11')), 5); // Sat -> Mon
});

test('calendar starting on a weekend moves to Monday', () => {
  const cal = new G.Calendar('2025-01-04', true); // Sat
  assert.equal(G.formatDate(cal.dateOf(0)), '2025-01-06');
  const cal2 = new G.Calendar('2025-01-04', false);
  assert.equal(G.formatDate(cal2.dateOf(1)), '2025-01-05');
});

test('finish-to-start chain and critical path', () => {
  const r = G.schedule(proj([
    { duration: 3 },
    { duration: 2, preds: [L(1)] },
    { duration: 1 },              // parallel, has slack
    { duration: 1, preds: [L(2), L(3)] }
  ]));
  assert.equal(r.byId[2].es, 3);
  assert.equal(r.byId[4].es, 5);
  assert.equal(r.byId[3].slack, 4);
  assert.deepEqual([1, 2, 3, 4].map(i => r.byId[i].critical), [true, true, false, true]);
  assert.equal(G.formatDate(r.byId[2].finishMs), '2025-01-10');
  assert.equal(r.project.duration, 6);
});

test('all four link types with lag', () => {
  const r = G.schedule(proj([
    { duration: 5 },                          // 1: [0,5)
    { duration: 2, preds: [L(1, 'SS', 2)] }, // 2: start >= 2
    { duration: 2, preds: [L(1, 'FF')] },     // 3: finish >= 5 -> start 3
    { duration: 3, preds: [L(1, 'SF', 1)] },  // 4: finish >= 1 -> start 0 (clamped)
    { duration: 1, preds: [L(1, 'FS', -2)] }  // 5: start >= 3
  ]));
  assert.equal(r.byId[2].es, 2);
  assert.equal(r.byId[3].es, 3); assert.equal(r.byId[3].ef, 5);
  assert.equal(r.byId[4].es, 0);
  assert.equal(r.byId[5].es, 3);
});

test('summary tasks roll up dates, cost, hours and % complete', () => {
  const r = G.schedule(proj([
    { name: 'Phase', level: 0 },
    { level: 1, duration: 2, cost: 100, hours: 10, pct: 100 },
    { level: 1, duration: 6, cost: 50, hours: 5, pct: 50, preds: [L(2)] },
    { level: 0, duration: 1 }
  ]));
  const s = r.byId[1];
  assert.ok(s.isSummary);
  assert.equal(s.es, 0); assert.equal(s.ef, 8); assert.equal(s.duration, 8);
  assert.equal(s.cost, 150); assert.equal(s.hours, 15);
  assert.equal(Math.round(s.pct), 63); // (2*100 + 6*50) / 8 = 62.5
  assert.equal(r.project.cost, 150 + 0);
});

test('links into and out of summary tasks', () => {
  const r = G.schedule(proj([
    { duration: 4 },                                  // 1
    { level: 0, preds: [L(1)] },                      // 2 summary, FS from 1
    { level: 1, duration: 2 },                        // 3
    { level: 1, duration: 3, preds: [L(3)] },         // 4
    { level: 0, duration: 1, preds: [L(2)] }          // 5 after summary
  ]));
  assert.equal(r.byId[3].es, 4);
  assert.equal(r.byId[4].es, 6);
  assert.equal(r.byId[2].ef, 9);
  assert.equal(r.byId[5].es, 9);
  assert.ok([1, 2, 3, 4, 5].every(i => r.byId[i].critical));
});

test('start-no-earlier-than constraint delays a task', () => {
  const r = G.schedule(proj([{ duration: 2, snet: '2025-01-13' }, { duration: 1, preds: [L(1)] }]));
  assert.equal(r.byId[1].es, 5);
  assert.equal(r.byId[2].es, 7);
});

test('cycles are detected and rejected', () => {
  const p = proj([{ preds: [L(2)] }, { preds: [L(1)] }]);
  const r = G.schedule(p);
  assert.ok(r.error);
  const p2 = proj([{}, { preds: [L(1)] }]);
  assert.match(G.validateLink(p2, 2, 1, 'FS'), /circular/);
  assert.equal(G.validateLink(p2, 1, 2, 'SS'), 'These tasks are already linked. Edit the existing link instead.');
});

test('invalid links are rejected and sanitized', () => {
  const p = proj([{ level: 0 }, { level: 1, preds: [L(1)] }, { level: 0, preds: [] }, { level: 1 }]);
  assert.match(G.validateLink(p, 1, 2, 'FS'), /summary/);
  assert.match(G.validateLink(p, 2, 3, 'FF'), /cannot drive a summary/);
  assert.equal(G.validateLink(p, 2, 3, 'FS'), null);
  const removed = G.sanitize(p);
  assert.equal(removed.length, 1);
  assert.equal(p.tasks[1].preds.length, 0);
});

test('parse and format predecessors and durations', () => {
  const rows = { 1: 'a', 2: 'b', 3: 'c' };
  const res = G.parsePredecessors('1, 2SS+3d; 3ff-1w, 9, x', n => rows[n], true);
  assert.deepEqual(res.links, [
    { id: 'a', type: 'FS', lag: 0 }, { id: 'b', type: 'SS', lag: 3 }, { id: 'c', type: 'FF', lag: -5 }
  ]);
  assert.equal(res.errors.length, 2);
  const ids = { a: 1, b: 2, c: 3 };
  assert.equal(G.formatPredecessors({ preds: res.links }, id => ids[id]), '1, 2SS+3d, 3FF-5d');
  assert.equal(G.parseDuration('2w', true), 10);
  assert.equal(G.parseDuration('3 days', true), 3);
  assert.ok(isNaN(G.parseDuration('soon', true)));
});

test('milestones have zero duration and finish on their start date', () => {
  const r = G.schedule(proj([{ duration: 3 }, { duration: 0, preds: [L(1)] }]));
  const m = r.byId[2];
  assert.ok(m.isMilestone);
  assert.equal(m.startMs, m.finishMs);
  assert.equal(G.formatDate(m.startMs), '2025-01-09');
});

test('WBS codes follow the outline', () => {
  const p = proj([{ level: 0 }, { level: 1 }, { level: 2 }, { level: 1 }, { level: 0 }]);
  assert.deepEqual(G.schedule(p).wbs, ['1', '1.1', '1.1.1', '1.2', '2']);
});

/* ------------------------------------------------------------ roll-ups */

// Checks every summary row (and the project row) against the rows directly under it.
function checkRollups(p) {
  const r = G.schedule(p);
  assert.ok(!r.error, r.error);
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, what + ': ' + a + ' vs ' + b);
  const leafWork = id => {
    const x = r.byId[id];
    if (!x.isSummary) return [Math.max(x.duration, 1), Math.max(x.duration, 1) * x.pct];
    return x.childIds.map(leafWork).reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
  };
  const check = (label, kids, row) => {
    const k = kids.map(id => r.byId[id]);
    close(row.cost, k.reduce((a, c) => a + c.cost, 0), label + ' cost');
    close(row.hours, k.reduce((a, c) => a + c.hours, 0), label + ' hours');
    assert.equal(row.startMs, Math.min(...k.map(c => c.startMs)), label + ' start');
    assert.equal(row.finishMs, Math.max(...k.map(c => c.finishMs)), label + ' finish');
    const w = kids.map(leafWork).reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
    close(row.pct, w[1] / w[0], label + ' % done');
  };
  Object.values(r.byId).filter(x => x.isSummary).forEach(x => check('task ' + (x.index + 1), x.childIds, x));
  const top = Object.values(r.byId).filter(x => x.parentId === null).map(x => x.id);
  if (top.length) check('project', top, r.project);
  return r;
}

test('summary finishes on its last milestone, not the day before', () => {
  const r = checkRollups(proj([
    { level: 0 },
    { level: 1, duration: 0, snet: '2025-01-06' },
    { level: 1, duration: 0, snet: '2025-01-13' }
  ]));
  assert.equal(G.formatDate(r.byId[1].startMs), '2025-01-06');
  assert.equal(G.formatDate(r.byId[1].finishMs), '2025-01-13');
  assert.equal(r.byId[1].duration, 6); // Mon..next Mon inclusive, working days
  assert.equal(G.formatDate(r.project.finishMs), '2025-01-13');
});

test('% done counts milestones and weights nested summaries by their work', () => {
  const r = checkRollups(proj([
    { level: 0 },
    { level: 1 },                                   // 2: summary of two parallel 10-day tasks
    { level: 2, duration: 10, pct: 100 },
    { level: 2, duration: 10, pct: 0 },
    { level: 1, duration: 10, pct: 0 },             // 5
    { level: 1, duration: 0, pct: 100 }             // 6: done milestone counts as 1 day
  ]));
  assert.equal(r.byId[2].pct, 50);
  // work: 10 + 10 + 10 + 1 = 31, done: 10 + 1 = 11
  assert.ok(Math.abs(r.byId[1].pct - 1100 / 31) < 1e-9);
});

test('roll-ups hold for every summary in randomly generated projects', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 300; k++) {
    const n = 1 + rnd(25), tasks = [];
    let lv = 0;
    for (let i = 0; i < n; i++) {
      lv = Math.max(0, Math.min(lv + rnd(3) - 1, i ? tasks[i - 1].level + 1 : 0));
      const t = { level: lv, duration: rnd(4) === 0 ? 0 : 1 + rnd(12), cost: rnd(5000), hours: rnd(80), pct: [0, 0, 25, 50, 100][rnd(5)] };
      if (rnd(3) === 0) t.snet = G.formatDate(G.parseDate('2025-01-06') + rnd(40) * G.DAY);
      if (i && rnd(2) === 0) t.preds = [L(1 + rnd(i), G.LINK_TYPES[rnd(4)], rnd(5) - 2)];
      tasks.push(t);
    }
    const p = proj(tasks, { skipWeekends: rnd(2) === 0 });
    G.sanitize(p);
    checkRollups(p);
  }
});

test('the bundled PVE renovation plan rolls up correctly', () => {
  global.window = {};
  require('../default-project.js');
  const p = JSON.parse(JSON.stringify(global.window.EASY_GANTT_DEFAULT_PROJECT));
  delete global.window;
  const r = checkRollups(p);
  const byName = n => Object.values(r.byId).find(x => p.tasks[x.index].name === n);
  assert.equal(G.formatDate(byName('Purchase & Planning').finishMs), '2026-09-21');
  assert.equal(r.project.cost, 394954);
  assert.equal(G.formatDate(r.project.startMs), '2026-09-08');
  assert.equal(G.formatDate(r.project.finishMs), '2027-01-03');
});
