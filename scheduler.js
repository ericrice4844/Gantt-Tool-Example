/*
 * Easy Gantt - scheduling engine.
 *
 * Pure logic with no DOM access, so it can be used both in the browser
 * (exposed as window.GanttCore) and from Node.js (module.exports) for tests.
 *
 * Model
 * -----
 * project = {
 *   name, start: 'YYYY-MM-DD', skipWeekends: bool, nextId,
 *   tasks: [ { id, name, level, duration, snet, cost, hours, pct, notes,
 *              collapsed, preds: [ { id, type: 'FS'|'SS'|'FF'|'SF', lag } ] } ]
 * }
 *
 * Tasks are stored as an ordered outline (like Microsoft Project): a task's
 * parent is the nearest task above it with a lower outline level. A task that
 * has children is a summary task; its dates, duration, cost, hours and
 * % complete are rolled up from its children.
 *
 * Time is measured in working-day indexes relative to the project start.
 * A task occupies [ES, EF) - EF is exclusive, so duration = EF - ES.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GanttCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];
  var LINK_NAMES = {
    FS: 'Finish-to-Start',
    SS: 'Start-to-Start',
    FF: 'Finish-to-Finish',
    SF: 'Start-to-Finish'
  };
  var EPS = 1e-9;

  /* ------------------------------------------------------------------ dates */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return NaN;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(ms);
    if (d.getUTCMonth() !== +m[2] - 1) return NaN; // e.g. 2025-02-31
    return ms;
  }

  function formatDate(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function floorDay(ms) { return Math.floor(ms / DAY) * DAY; }

  function todayUTC() {
    var n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function isWeekend(ms) {
    var g = new Date(ms).getUTCDay();
    return g === 0 || g === 6;
  }

  /**
   * Converts between working-day indexes and calendar dates (UTC ms).
   * Index 0 is the project start (moved to the next weekday when weekends
   * are non-working).
   */
  function Calendar(startStr, skipWeekends) {
    this.skip = !!skipWeekends;
    var s = parseDate(startStr);
    if (isNaN(s)) s = todayUTC();
    if (this.skip) while (isWeekend(s)) s += DAY;
    this.start = s;
  }

  Calendar.prototype.isWorkday = function (ms) {
    return !this.skip || !isWeekend(ms);
  };

  /** Working-day index -> date (ms). */
  Calendar.prototype.dateOf = function (i) {
    i = Math.round(i);
    if (!this.skip) return this.start + i * DAY;
    var d = this.start;
    if (i < 0) {
      var n = -i;
      while (n > 0) { d -= DAY; if (!isWeekend(d)) n--; }
      return d;
    }
    var weeks = Math.floor(i / 5);
    d += weeks * 7 * DAY;
    var r = i - weeks * 5;
    while (r > 0) { d += DAY; if (!isWeekend(d)) r--; }
    return d;
  };

  /** Date (ms) -> index of the first working day on or after it. */
  Calendar.prototype.indexOf = function (ms) {
    ms = floorDay(ms);
    if (!this.skip) return Math.round((ms - this.start) / DAY);
    while (isWeekend(ms)) ms += DAY;
    var d, n;
    if (ms < this.start) {
      n = 0; d = ms;
      while (d < this.start) { if (!isWeekend(d)) n++; d += DAY; }
      return -n;
    }
    var days = Math.round((ms - this.start) / DAY);
    var weeks = Math.floor(days / 7);
    n = weeks * 5;
    d = this.start + weeks * 7 * DAY;
    while (d < ms) { d += DAY; if (!isWeekend(d)) n++; }
    return n;
  };

  /* -------------------------------------------------------------- outline */

  /** Clamp outline levels so each task is at most one level below the one above. */
  function normalizeLevels(tasks) {
    var prev = -1;
    for (var i = 0; i < tasks.length; i++) {
      var lv = Math.max(0, Math.floor(+tasks[i].level || 0));
      tasks[i].level = Math.min(lv, prev + 1);
      prev = tasks[i].level;
    }
  }

  function buildTree(tasks) {
    var n = tasks.length;
    var parent = new Array(n);
    var children = [];
    var stack = [];
    for (var i = 0; i < n; i++) {
      children.push([]);
      parent[i] = -1;
      var lv = tasks[i].level;
      while (stack.length && tasks[stack[stack.length - 1]].level >= lv) stack.pop();
      if (stack.length) {
        parent[i] = stack[stack.length - 1];
        children[parent[i]].push(i);
      }
      stack.push(i);
    }
    return {
      parent: parent,
      children: children,
      isSummary: children.map(function (c) { return c.length > 0; })
    };
  }

  /** Index one past the last descendant of task i. */
  function subtreeEnd(tasks, i) {
    var lv = tasks[i].level;
    var j = i + 1;
    while (j < tasks.length && tasks[j].level > lv) j++;
    return j;
  }

  function isAncestor(tree, a, b) { // is a an ancestor of b?
    var p = tree.parent[b];
    while (p !== -1) { if (p === a) return true; p = tree.parent[p]; }
    return false;
  }

  function wbsCodes(tasks) {
    var counters = [];
    return tasks.map(function (t) {
      counters.length = t.level + 1;
      counters[t.level] = (counters[t.level] || 0) + 1;
      return counters.join('.');
    });
  }

  /* ----------------------------------------------------- link validation */

  /** Returns a human readable reason a link is not allowed, or null. */
  function structuralLinkError(tasks, tree, idx, predId, succId, type) {
    var p = idx.get(predId), s = idx.get(succId);
    if (p === undefined || s === undefined) return 'Task not found.';
    if (p === s) return 'A task cannot be linked to itself.';
    if (LINK_TYPES.indexOf(type) < 0) return 'Unknown link type "' + type + '".';
    if (isAncestor(tree, p, s) || isAncestor(tree, s, p)) {
      return 'A summary task cannot be linked to its own subtasks.';
    }
    if (tree.isSummary[s] && (type === 'FF' || type === 'SF')) {
      return LINK_NAMES[type] + ' links cannot drive a summary task. ' +
        'Link to one of its subtasks instead.';
    }
    return null;
  }

  /**
   * Remove links that are no longer valid (missing tasks, links between a
   * summary and its own subtasks, FF/SF into summaries, duplicates).
   * Returns the list of removed links as {predId, succId, type, reason}.
   */
  function sanitize(project) {
    var tasks = project.tasks;
    normalizeLevels(tasks);
    var tree = buildTree(tasks);
    var idx = new Map(tasks.map(function (t, i) { return [t.id, i]; }));
    var removed = [];
    tasks.forEach(function (t) {
      var seen = new Set();
      t.preds = (t.preds || []).filter(function (l) {
        if (LINK_TYPES.indexOf(l.type) < 0) l.type = 'FS';
        l.lag = Math.round(+l.lag || 0);
        var reason = structuralLinkError(tasks, tree, idx, l.id, t.id, l.type);
        if (!reason && seen.has(l.id)) reason = 'Duplicate link.';
        if (reason) {
          removed.push({ predId: l.id, succId: t.id, type: l.type, reason: reason });
          return false;
        }
        seen.add(l.id);
        return true;
      });
    });
    return removed;
  }

  /* -------------------------------------------------------------- schedule */

  function linkRequirement(type, lag, pES, pEF, succDur) {
    switch (type) {
      case 'SS': return pES + lag;
      case 'FF': return pEF + lag - succDur;
      case 'SF': return pES + lag - succDur;
      default: return pEF + lag; // FS
    }
  }

  /**
   * Run a full critical-path (CPM) calculation.
   *
   * Every leaf task gets an early start/finish from a forward pass and a
   * late start/finish from a backward pass; total slack = LF - EF. Tasks with
   * zero slack are on the critical path.
   *
   * Summary tasks are modelled as two graph nodes: an "in" node that collects
   * constraints from links pointing at the summary (and passes them down to
   * every subtask), and an "out" node that rolls up the dates of its
   * children (used by links leaving the summary).
   */
  function schedule(project) {
    var tasks = project.tasks;
    normalizeLevels(tasks);
    var cal = new Calendar(project.start, project.skipWeekends);
    var tree = buildTree(tasks);
    var n = tasks.length;
    var idx = new Map(tasks.map(function (t, i) { return [t.id, i]; }));
    var isSum = tree.isSummary;
    var N = 2 * n;

    function IN(i) { return i; }
    function OUT(i) { return isSum[i] ? n + i : i; }

    var dur = tasks.map(function (t, i) {
      return isSum[i] ? 0 : Math.max(0, Math.round(+t.duration || 0));
    });

    // Graph
    var adj = [], indeg = new Int32Array(N), incoming = [], outgoing = [];
    for (var k = 0; k < N; k++) { adj.push([]); incoming.push([]); outgoing.push([]); }
    function edge(a, b) { adj[a].push(b); indeg[b]++; }

    var links = [];
    tasks.forEach(function (t, s) {
      (t.preds || []).forEach(function (l) {
        var type = LINK_TYPES.indexOf(l.type) >= 0 ? l.type : 'FS';
        if (structuralLinkError(tasks, tree, idx, l.id, t.id, type)) return;
        var p = idx.get(l.id);
        var link = { p: p, s: s, predId: l.id, succId: t.id, type: type, lag: Math.round(+l.lag || 0) };
        links.push(link);
        incoming[IN(s)].push(link);
        outgoing[OUT(p)].push(link);
        edge(OUT(p), IN(s));
      });
    });
    for (var i = 0; i < n; i++) {
      if (!isSum[i]) continue;
      tree.children[i].forEach(function (c) {
        edge(IN(i), IN(c));
        edge(OUT(c), OUT(i));
      });
    }

    // Topological order (Kahn). Nodes n+i exist only for summaries.
    var used = [];
    for (i = 0; i < n; i++) { used.push(i); if (isSum[i]) used.push(n + i); }
    var queue = used.filter(function (v) { return indeg[v] === 0; });
    var order = [];
    while (queue.length) {
      var v = queue.pop();
      order.push(v);
      adj[v].forEach(function (w) { if (--indeg[w] === 0) queue.push(w); });
    }
    if (order.length < used.length) {
      var inCycle = new Set();
      used.forEach(function (v) { if (indeg[v] > 0) inCycle.add(tasks[v % n].id); });
      return {
        error: 'Circular dependency detected. Tasks in the loop cannot be scheduled.',
        cycle: Array.from(inCycle),
        calendar: cal
      };
    }

    // Forward pass
    var ES = new Float64Array(N), EF = new Float64Array(N), CON = new Float64Array(n);
    order.forEach(function (v) {
      var i, es;
      if (v >= n) { // summary out node: roll up children
        i = v - n;
        var lo = Infinity, hi = -Infinity;
        tree.children[i].forEach(function (c) {
          lo = Math.min(lo, ES[OUT(c)]);
          hi = Math.max(hi, EF[OUT(c)]);
        });
        ES[v] = lo; EF[v] = hi;
        return;
      }
      i = v;
      var t = tasks[i];
      es = 0;
      var par = tree.parent[i];
      if (par !== -1) es = Math.max(es, CON[par]);
      incoming[v].forEach(function (l) {
        var po = OUT(l.p);
        es = Math.max(es, linkRequirement(l.type, l.lag, ES[po], EF[po], dur[i]));
      });
      if (isSum[i]) {
        CON[i] = es;
      } else {
        if (t.snet) {
          var c = parseDate(t.snet);
          if (!isNaN(c)) es = Math.max(es, cal.indexOf(c));
        }
        ES[i] = es; EF[i] = es + dur[i];
      }
    });

    var projectFinish = 0;
    for (i = 0; i < n; i++) if (!isSum[i]) projectFinish = Math.max(projectFinish, EF[i]);

    // Backward pass
    var LS = new Float64Array(N), LF = new Float64Array(N);
    for (var o = order.length - 1; o >= 0; o--) {
      v = order[o];
      if (v < n && isSum[v]) { // summary in node: earliest late start of children
        var ls = Infinity, lf = -Infinity;
        tree.children[v].forEach(function (c) { ls = Math.min(ls, LS[c]); lf = Math.max(lf, LF[OUT(c)]); });
        LS[v] = ls; LF[v] = lf;
        continue;
      }
      i = v >= n ? v - n : v;
      var pDur = EF[v] - ES[v];
      var cap = projectFinish;
      var par2 = tree.parent[i];
      if (par2 !== -1) cap = Math.min(cap, LF[n + par2]);
      outgoing[v].forEach(function (l) {
        var si = IN(l.s);
        var sLS = LS[si];
        var sLF = isSum[l.s] ? LS[si] + (EF[OUT(l.s)] - ES[OUT(l.s)]) : LF[si];
        var c;
        switch (l.type) {
          case 'SS': c = sLS - l.lag + pDur; break;
          case 'FF': c = sLF - l.lag; break;
          case 'SF': c = sLF - l.lag + pDur; break;
          default: c = sLS - l.lag;
        }
        cap = Math.min(cap, c);
      });
      LF[v] = cap;
      LS[v] = cap - pDur;
    }

    // Results. Roll-ups use each task's first and last calendar day, so a summary
    // always starts with its earliest child and finishes with its latest child
    // (milestones included). % complete is weighted by work: each leaf counts its
    // duration in days, and a milestone counts as one day.
    var wbs = wbsCodes(tasks);
    var byId = {};
    var firstDay = new Float64Array(n), lastDay = new Float64Array(n);
    var work = new Float64Array(n), doneWork = new Float64Array(n), allMilestones = [];
    // Post-order so children are filled before parents.
    for (i = n - 1; i >= 0; i--) {
      var t2 = tasks[i];
      var r = {
        id: t2.id, index: i, wbs: wbs[i], level: t2.level, isSummary: isSum[i],
        parentId: tree.parent[i] === -1 ? null : tasks[tree.parent[i]].id,
        childIds: tree.children[i].map(function (c) { return tasks[c].id; })
      };
      if (isSum[i]) {
        var vo = n + i;
        r.es = ES[vo]; r.ef = EF[vo];
        r.ls = LS[i]; r.lf = LF[i];
        var minSlack = Infinity, cost = 0, hours = 0, lo = Infinity, hi = -Infinity, wk = 0, dw = 0, ms = true;
        tree.children[i].forEach(function (c) {
          var rc = byId[tasks[c].id];
          minSlack = Math.min(minSlack, rc.slack);
          cost += rc.cost; hours += rc.hours;
          lo = Math.min(lo, firstDay[c]); hi = Math.max(hi, lastDay[c]);
          wk += work[c]; dw += doneWork[c]; ms = ms && allMilestones[c];
        });
        r.slack = minSlack;
        r.cost = cost; r.hours = hours;
        firstDay[i] = lo; lastDay[i] = hi; work[i] = wk; doneWork[i] = dw; allMilestones[i] = ms;
        r.pct = wk > 0 ? dw / wk : 0;
        r.duration = ms && hi === lo ? 0 : hi - lo + 1;
      } else {
        r.es = ES[i]; r.ef = EF[i]; r.ls = LS[i]; r.lf = LF[i];
        r.slack = LF[i] - EF[i];
        r.cost = +t2.cost || 0; r.hours = +t2.hours || 0;
        r.pct = Math.min(100, Math.max(0, +t2.pct || 0));
        r.duration = dur[i];
        firstDay[i] = ES[i];
        lastDay[i] = dur[i] > 0 ? EF[i] - 1 : ES[i];
        work[i] = Math.max(dur[i], 1);
        doneWork[i] = work[i] * r.pct;
        allMilestones[i] = dur[i] === 0;
      }
      if (Math.abs(r.slack) < EPS) r.slack = 0;
      r.critical = r.slack <= EPS;
      r.isMilestone = !isSum[i] && dur[i] === 0;
      r.startMs = cal.dateOf(firstDay[i]);
      r.finishMs = cal.dateOf(lastDay[i]);
      r.constraintMs = !isSum[i] && t2.snet ? parseDate(t2.snet) : NaN;
      byId[t2.id] = r;
    }

    var outLinks = links.map(function (l) {
      var po = OUT(l.p);
      var req = linkRequirement(l.type, l.lag, ES[po], EF[po], dur[l.s]);
      var actual = isSum[l.s] ? CON[l.s] : ES[l.s];
      var driving = Math.abs(req - actual) < EPS;
      var pr = byId[l.predId], sr = byId[l.succId];
      return {
        predId: l.predId, succId: l.succId, type: l.type, lag: l.lag,
        driving: driving,
        critical: driving && pr.critical && sr.critical
      };
    });

    // Project summary (row 0): the same roll-up over the top-level tasks.
    var P = { cost: 0, hours: 0, work: 0, done: 0, lo: Infinity, hi: -Infinity, ms: true };
    for (i = 0; i < n; i++) {
      if (tree.parent[i] !== -1) continue;
      var rt = byId[tasks[i].id];
      P.cost += rt.cost; P.hours += rt.hours; P.work += work[i]; P.done += doneWork[i];
      P.lo = Math.min(P.lo, firstDay[i]); P.hi = Math.max(P.hi, lastDay[i]); P.ms = P.ms && allMilestones[i];
    }
    if (!n) { P.lo = 0; P.hi = 0; }
    var projDur = !n || (P.ms && P.lo === P.hi) ? 0 : P.hi - P.lo + 1;

    return {
      calendar: cal,
      byId: byId,
      links: outLinks,
      wbs: wbs,
      project: {
        es: P.lo,
        ef: projectFinish,
        duration: projDur,
        startMs: cal.dateOf(P.lo),
        finishMs: cal.dateOf(P.hi),
        cost: P.cost,
        hours: P.hours,
        pct: P.work > 0 ? P.done / P.work : 0,
        criticalCount: tasks.filter(function (t, j) { return !isSum[j] && byId[t.id].critical; }).length
      }
    };
  }

  /** Full validation for a proposed new link, including cycle detection. */
  function validateLink(project, predId, succId, type) {
    var tasks = project.tasks;
    normalizeLevels(tasks);
    var tree = buildTree(tasks);
    var idx = new Map(tasks.map(function (t, i) { return [t.id, i]; }));
    var err = structuralLinkError(tasks, tree, idx, predId, succId, type);
    if (err) return err;
    var succ = tasks[idx.get(succId)];
    if ((succ.preds || []).some(function (l) { return l.id === predId; })) {
      return 'These tasks are already linked. Edit the existing link instead.';
    }
    var clone = JSON.parse(JSON.stringify(project));
    clone.tasks[idx.get(succId)].preds.push({ id: predId, type: type, lag: 0 });
    var res = schedule(clone);
    if (res.error) return 'That link would create a circular dependency.';
    return null;
  }

  /* --------------------------------------------------------------- parsing */

  /** Parse a duration like "5", "5d", "2w", "3 days". Returns workdays or NaN. */
  function parseDuration(str, skipWeekends) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mon|month|months)?\s*$/i
      .exec(String(str == null ? '' : str));
    if (!m) return NaN;
    var v = parseFloat(m[1]);
    var u = (m[2] || 'd').toLowerCase();
    if (u[0] === 'w') v *= skipWeekends ? 5 : 7;
    else if (u[0] === 'm') v *= skipWeekends ? 20 : 30;
    return Math.round(v);
  }

  function formatDuration(d) {
    d = Math.round(d);
    return d + (d === 1 ? ' day' : ' days');
  }

  function formatLag(lag) {
    if (!lag) return '';
    return (lag > 0 ? '+' : '') + lag + 'd';
  }

  /**
   * Parse a predecessor string like "2, 3SS+1d, 5FF-2" into link objects.
   * rowToId maps a displayed row number to a task id.
   * Returns { links: [...], errors: [...] }.
   */
  function parsePredecessors(str, rowToId, skipWeekends) {
    var out = { links: [], errors: [] };
    String(str == null ? '' : str).split(/[,;]+/).forEach(function (raw) {
      var tok = raw.trim();
      if (!tok) return;
      var m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?)?)?$/i.exec(tok);
      if (!m) { out.errors.push('Could not understand "' + tok + '". Use e.g. 3, 3SS or 3FS+2d.'); return; }
      var id = rowToId(+m[1]);
      if (id === undefined || id === null) { out.errors.push('There is no task ' + m[1] + '.'); return; }
      var lag = 0;
      if (m[3]) {
        lag = parseFloat(m[4]);
        if (m[5] && m[5][0].toLowerCase() === 'w') lag *= skipWeekends ? 5 : 7;
        lag = Math.round(lag) * (m[3] === '-' ? -1 : 1);
      }
      out.links.push({ id: id, type: (m[2] || 'FS').toUpperCase(), lag: lag });
    });
    return out;
  }

  function formatPredecessors(task, idToRow) {
    return (task.preds || []).map(function (l) {
      var row = idToRow(l.id);
      if (row === undefined) return null;
      var typeStr = l.type === 'FS' && !l.lag ? '' : l.type;
      return row + typeStr + formatLag(l.lag);
    }).filter(Boolean).join(', ');
  }

  return {
    DAY: DAY,
    LINK_TYPES: LINK_TYPES,
    LINK_NAMES: LINK_NAMES,
    parseDate: parseDate,
    formatDate: formatDate,
    todayUTC: todayUTC,
    isWeekend: isWeekend,
    Calendar: Calendar,
    normalizeLevels: normalizeLevels,
    buildTree: buildTree,
    subtreeEnd: subtreeEnd,
    wbsCodes: wbsCodes,
    sanitize: sanitize,
    schedule: schedule,
    validateLink: validateLink,
    parseDuration: parseDuration,
    formatDuration: formatDuration,
    formatLag: formatLag,
    parsePredecessors: parsePredecessors,
    formatPredecessors: formatPredecessors
  };
});
