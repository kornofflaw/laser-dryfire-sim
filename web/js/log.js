// log.js — one row per finished run, kept in this browser, exportable as CSV.
// (Replaces SessionLogger.cs and logs far more: points, zones, splits, HF.)
// It lives in this browser's localStorage only, so download the CSV to keep it.

import { CONFIG } from './config.js';
import { load, save, remove } from './storage.js';

const COLUMNS = [
  'datetime', 'drill', 'input', 'par_s', 'complete', 'time_s', 'first_shot_s',
  'shots', 'hits', 'accuracy_pct', 'points', 'a', 'c', 'd', 'head', 'miss',
  'hit_factor', 'made_par', 'passed', 'early_shots', 'splits_s',
];

export class RunLog {
  constructor() {
    this.rows = load(CONFIG.storage.log, []);
    if (!Array.isArray(this.rows)) this.rows = [];
  }

  add(r, input) {
    const f = (v, n = 3) => (v == null ? '' : Number(v).toFixed(n));
    const row = {
      datetime: formatDate(r.datetime),
      drill: r.drill,
      input,
      par_s: f(r.parTime, 2),
      complete: r.complete ? 'yes' : 'no',
      time_s: f(r.time),
      first_shot_s: f(r.firstShot),
      shots: r.shots,
      hits: r.hits,
      accuracy_pct: r.shots ? f((r.hits / r.shots) * 100, 1) : '',
      points: r.points,
      a: r.counts.A, c: r.counts.C, d: r.counts.D, head: r.counts.Head, miss: r.counts.Miss,
      hit_factor: f(r.hitFactor, 2),
      made_par: r.madePar ? 'yes' : 'no',
      passed: r.passed == null ? '' : r.passed ? 'yes' : 'no',
      early_shots: r.early,
      splits_s: r.splits.map(s => s.toFixed(3)).join(' '),
    };
    this.rows.push(row);
    save(CONFIG.storage.log, this.rows);
  }

  clear() {
    this.rows = [];
    remove(CONFIG.storage.log);
  }

  toCSV() {
    const esc = v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [COLUMNS.join(',')];
    for (const row of this.rows) lines.push(COLUMNS.map(c => esc(row[c])).join(','));
    return lines.join('\n') + '\n';
  }

  download() {
    const blob = new Blob([this.toCSV()], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dryfire-log-${formatDate(new Date()).replace(/[: ]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function formatDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
