/* Easy Gantt - user interface. Depends on scheduler.js (window.GanttCore). */
(function () {
  'use strict';

  var G = window.GanttCore;
  var DAY = G.DAY;
  var ROW_H = 30;
  var STORAGE_KEY = 'easygantt.project.v1';
  var PREFS_KEY = 'easygantt.prefs.v1';
  var PROJECT_ROW = 'P';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ----------------------------------------------------------- columns */

  var COLUMNS = [
    { key: 'id', title: 'ID', width: 40 },
    { key: 'name', title: 'Task Name', width: 230 },
    { key: 'duration', title: 'Duration', width: 72, num: true },
    { key: 'start', title: 'Start', width: 96 },
    { key: 'finish', title: 'Finish', width: 96 },
    { key: 'preds', title: 'Predecessors', width: 104 },
    { key: 'pct', title: '% Done', width: 58, num: true },
    { key: 'hours', title: 'Hours Est.', width: 70, num: true },
    { key: 'cost', title: 'Cost Est.', width: 92, num: true },
    { key: 'slack', title: 'Total Slack', width: 62, num: true }
  ];
  var EDIT_COLS = ['name', 'duration', 'start', 'finish', 'preds', 'pct', 'hours', 'cost'];

  var ZOOMS = {
    day: { px: 28, top: 'week', bottom: 'day', before: 3, after: 14 },
    week: { px: 11, top: 'month', bottom: 'week', before: 7, after: 35 },
    month: { px: 3, top: 'year', bottom: 'month', before: 20, after: 90 }
  };

  /* ------------------------------------------------------------- state */

  var project, sched, rows = [];
  var selection = new Set();
  var anchorId = null;
  var active = { id: null, col: 'name' };
  var editor = null;
  var undoStack = [], redoStack = [];
  var view = { start: 0, end: 0, px: 11 };
  var drag = null;
  var prefs = loadPrefs();

  function loadPrefs() {
    var p = { zoom: 'week', showCritical: true, gridWidth: null, colWidths: {} };
    try { Object.assign(p, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) { /* ignore */ }
    return p;
  }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  function colWidth(c) { return prefs.colWidths[c.key] || c.width; }

  /* ---------------------------------------------------- project model */

  function newTask(fields) {
    return Object.assign({
      id: project.nextId++, name: 'New task', level: 0, duration: 1, snet: null,
      cost: 0, hours: 0, pct: 0, notes: '', collapsed: false, preds: []
    }, fields || {});
  }

  function blankProject() {
    var d = new Date();
    return {
      version: 1, name: 'New Project',
      start: G.formatDate(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
      skipWeekends: true, nextId: 1, tasks: []
    };
  }

  /** The project shown on first launch, from default-project.js (falls back to an empty project). */
  function sampleProject() {
    var def = window.EASY_GANTT_DEFAULT_PROJECT;
    if (def) {
      try { return normalizeProject(JSON.parse(JSON.stringify(def))); } catch (e) { /* fall through */ }
    }
    return blankProject();
  }

  function normalizeProject(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) throw new Error('This file is not an Easy Gantt project.');
    var p = blankProject();
    p.name = String(obj.name || 'Untitled Project');
    if (!isNaN(G.parseDate(obj.start))) p.start = obj.start;
    p.skipWeekends = obj.skipWeekends !== false;
    var seen = new Set(), maxId = 0;
    p.tasks = obj.tasks.map(function (t) {
      var id = Number(t.id);
      if (!Number.isFinite(id) || seen.has(id)) id = NaN;
      return {
        id: id, name: String(t.name == null ? '' : t.name), level: +t.level || 0,
        duration: Math.max(0, Math.round(+t.duration || 0)),
        snet: t.snet && !isNaN(G.parseDate(t.snet)) ? t.snet : null,
        cost: +t.cost || 0, hours: +t.hours || 0, pct: Math.min(100, Math.max(0, +t.pct || 0)),
        notes: String(t.notes || ''), collapsed: !!t.collapsed,
        preds: Array.isArray(t.preds) ? t.preds.map(function (l) {
          return { id: Number(l.id), type: String(l.type || 'FS').toUpperCase(), lag: Math.round(+l.lag || 0) };
        }) : []
      };
    });
    p.tasks.forEach(function (t) { if (Number.isFinite(t.id)) { seen.add(t.id); maxId = Math.max(maxId, t.id); } });
    p.tasks.forEach(function (t) { if (!Number.isFinite(t.id)) { t.id = ++maxId; } });
    p.nextId = Math.max(maxId + 1, +obj.nextId || 0);
    G.sanitize(p);
    if (G.schedule(p).error) {
      p.tasks.forEach(function (t) { t.preds = []; });
      toast('The file contained circular links; links were removed.', 'error');
    }
    return p;
  }

  function taskById(id) {
    for (var i = 0; i < project.tasks.length; i++) if (project.tasks[i].id === id) return project.tasks[i];
    return null;
  }
  function indexOfId(id) {
    for (var i = 0; i < project.tasks.length; i++) if (project.tasks[i].id === id) return i;
    return -1;
  }
  function idToRow(id) { var i = indexOfId(id); return i < 0 ? undefined : i + 1; }
  function rowToId(n) { var t = project.tasks[n - 1]; return t ? t.id : undefined; }

  /* ------------------------------------------------------- persistence */

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch (e) { /* ignore */ }
  }

  function loadInitial() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeProject(JSON.parse(raw));
    } catch (e) { /* fall through */ }
    return sampleProject();
  }

  /* ---------------------------------------------------------- mutation */

  /**
   * Apply a change to the project as one undoable step. The callback may
   * return false (or throw) to abort. Circular dependencies are rejected.
   */
  function mutate(fn) {
    var before = JSON.stringify(project);
    var result;
    try { result = fn(); } catch (e) {
      project = JSON.parse(before);
      toast(e.message, 'error');
      return false;
    }
    if (result === false) { project = JSON.parse(before); return false; }
    var removed = G.sanitize(project);
    var s = G.schedule(project);
    if (s.error) {
      project = JSON.parse(before);
      toast('That change would create a circular dependency, so it was undone.', 'error');
      refresh();
      return false;
    }
    if (JSON.stringify(project) !== before) {
      undoStack.push(before);
      if (undoStack.length > 200) undoStack.shift();
      redoStack = [];
    }
    if (removed.length) {
      toast('Removed ' + removed.length + ' link' + (removed.length > 1 ? 's' : '') + ' that no longer applied: ' + removed[0].reason, 'error');
    }
    sched = s;
    afterChange();
    return true;
  }

  function refresh() { sched = G.schedule(project); afterChange(); }

  function afterChange() {
    var ids = new Set(project.tasks.map(function (t) { return t.id; }));
    selection.forEach(function (id) { if (id !== PROJECT_ROW && !ids.has(id)) selection.delete(id); });
    if (active.id !== null && active.id !== PROJECT_ROW && !ids.has(active.id)) active.id = null;
    buildRows();
    render();
    persist();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(project));
    project = JSON.parse(undoStack.pop());
    refresh();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(project));
    project = JSON.parse(redoStack.pop());
    refresh();
  }

  /* ------------------------------------------------------------- rows */

  function buildRows() {
    rows = [{ id: PROJECT_ROW, project: true }];
    var hideBelow = Infinity;
    project.tasks.forEach(function (t) {
      if (t.level > hideBelow) return;
      hideBelow = Infinity;
      rows.push({ id: t.id, task: t });
      if (t.collapsed && sched.byId[t.id].isSummary) hideBelow = t.level;
    });
  }
  function rowIndexOf(id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
    return -1;
  }

  /* -------------------------------------------------------- formatting */

  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function fmtDate(ms) { return G.formatDate(ms); }
  function fmtLongDate(ms) {
    var d = new Date(ms);
    return WEEKDAYS[d.getUTCDay()] + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  function fmtNum(n) { return (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  function fmtMoney(n) {
    return '$' + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtSlack(d) { return d === Infinity ? '' : Math.round(d) + 'd'; }
  function parseNumber(s) {
    var v = parseFloat(String(s).replace(/[$€£¥,\s]/g, ''));
    if (!Number.isFinite(v)) throw new Error('Please enter a number.');
    return v;
  }

  /* ---------------------------------------------------------- toolbar */

  function syncToolbar() {
    var nameEl = $('projectName');
    if (document.activeElement !== nameEl) nameEl.value = project.name;
    $('projectStart').value = project.start;
    $('skipWeekends').checked = !!project.skipWeekends;
    $('zoom').value = prefs.zoom;
    $('showCritical').checked = !!prefs.showCritical;
    var sel = selectedTaskIds();
    setDisabled('undo', !undoStack.length);
    setDisabled('redo', !redoStack.length);
    setDisabled('link', sel.length < 2);
    setDisabled('unlink', sel.length < 1);
    ['markDone', 'delete', 'indent', 'outdent', 'moveUp', 'moveDown', 'scrollToTask', 'details'].forEach(function (c) {
      setDisabled(c, !sel.length);
    });
    document.title = project.name + ' - Easy Gantt';
  }
  function setDisabled(cmd, v) {
    var b = document.querySelector('[data-cmd="' + cmd + '"]');
    if (b) b.disabled = v;
  }

  function selectedTaskIds() {
    // in outline order
    return project.tasks.filter(function (t) { return selection.has(t.id); }).map(function (t) { return t.id; });
  }

  /* ------------------------------------------------------------- grid */

  function gridTemplate() {
    return COLUMNS.map(function (c) { return colWidth(c) + 'px'; }).join(' ');
  }
  function gridTotalWidth() {
    return COLUMNS.reduce(function (a, c) { return a + colWidth(c); }, 0);
  }

  function renderGridHeader() {
    var h = '<div class="grow" style="grid-template-columns:' + gridTemplate() + ';width:' + gridTotalWidth() + 'px">';
    COLUMNS.forEach(function (c) {
      h += '<div class="gcell' + (c.num ? ' num' : '') + (c.key === 'id' ? ' id' : '') + '">' + esc(c.title) +
        '<span class="col-resize" data-col="' + c.key + '"></span></div>';
    });
    $('gridHeader').innerHTML = h + '</div>';
  }

  function cellEditable(row, col) {
    if (row.project) return col === 'name';
    var r = sched.byId[row.id];
    if (r.isSummary) return col === 'name' || col === 'preds';
    return EDIT_COLS.indexOf(col) >= 0;
  }

  function cellHtml(row, col) {
    var showCrit = prefs.showCritical;
    if (row.project) {
      var P = sched.project;
      switch (col) {
        case 'id': return '0';
        case 'name': return '<span class="toggle blank"></span><span class="name-text">' + esc(project.name) + '</span>';
        case 'duration': return G.formatDuration(P.duration);
        case 'start': return fmtDate(P.startMs);
        case 'finish': return fmtDate(P.finishMs);
        case 'pct': return Math.round(P.pct) + '%';
        case 'hours': return fmtNum(P.hours);
        case 'cost': return fmtMoney(P.cost);
        default: return '';
      }
    }
    var t = row.task, r = sched.byId[t.id];
    switch (col) {
      case 'id': return String(r.index + 1);
      case 'name': {
        var tog = r.isSummary
          ? '<span class="toggle" data-toggle="' + t.id + '" title="' + (t.collapsed ? 'Expand' : 'Collapse') + '">' + (t.collapsed ? '&#9656;' : '&#9662;') + '</span>'
          : '<span class="toggle blank"></span>';
        var extras = '';
        var doneMark = r.pct >= 100 ? '<span class="done-mark" title="Done">&#10003;</span>' : '';
        if (r.isMilestone) extras += '<span class="ms" title="Milestone">&#9670;</span>';
        if (t.snet && !r.isSummary) extras += '<span class="pin" title="Start no earlier than ' + esc(t.snet) + '">&#128204;</span>';
        if (t.notes) extras += '<span class="note" title="' + esc(t.notes) + '">&#9998;</span>';
        return '<span style="width:' + (t.level * 18) + 'px;flex:none"></span>' + tog +
          doneMark + '<span class="name-text">' + esc(t.name) + '</span>' + extras;
      }
      case 'duration': return G.formatDuration(r.duration);
      case 'start': return fmtDate(r.startMs);
      case 'finish': return fmtDate(r.finishMs);
      case 'preds': return esc(G.formatPredecessors(t, idToRow));
      case 'pct': return Math.round(r.pct) + '%';
      case 'hours': return fmtNum(r.hours);
      case 'cost': return fmtMoney(r.cost);
      case 'slack': return '<span class="' + (showCrit && r.critical ? 'crit' : '') + '">' + fmtSlack(r.slack) + '</span>';
    }
    return '';
  }

  function renderGrid() {
    renderGridHeader();
    var tpl = gridTemplate(), w = gridTotalWidth();
    var h = '';
    rows.forEach(function (row) {
      var r = row.project ? null : sched.byId[row.id];
      var cls = 'grow' + (row.project ? ' project' : '') + (r && r.isSummary ? ' summary' : '') + (r && r.pct >= 100 ? ' done' : '') +
        (selection.has(row.id) ? ' selected' : '');
      h += '<div class="' + cls + '" data-id="' + row.id + '" style="grid-template-columns:' + tpl + ';width:' + w + 'px">';
      COLUMNS.forEach(function (c) {
        var ed = cellEditable(row, c.key);
        var cc = 'gcell' + (c.num ? ' num' : '') + (c.key === 'id' ? ' id' : '') +
          (!ed && c.key !== 'id' && c.key !== 'name' ? ' ro' : '') +
          (active.id === row.id && active.col === c.key ? ' active' : '');
        var title = '';
        if (c.key === 'start' || c.key === 'finish') {
          var ms = row.project ? (c.key === 'start' ? sched.project.startMs : sched.project.finishMs)
            : (c.key === 'start' ? r.startMs : r.finishMs);
          title = ' title="' + fmtLongDate(ms) + '"';
        }
        h += '<div class="' + cc + '" data-col="' + c.key + '"' + title + '>' + cellHtml(row, c.key) + '</div>';
      });
      h += '</div>';
    });
    h += '<div class="grid-filler" style="width:' + w + 'px"></div>';
    $('gridBody').innerHTML = h;
  }

  /* ------------------------------------------------------ cell editing */

  function startEdit(id, col, initialText) {
    var row = rows[rowIndexOf(id)];
    if (!row || !cellEditable(row, col)) return false;
    var rowEl = $('gridBody').querySelector('.grow[data-id="' + id + '"]');
    if (!rowEl) return false;
    var cell = rowEl.querySelector('.gcell[data-col="' + col + '"]');
    var input = document.createElement('input');
    input.type = (col === 'start' || col === 'finish') ? 'date' : 'text';
    input.spellcheck = false;
    input.value = initialText != null ? initialText : editValue(row, col);
    cell.appendChild(input);
    var ed = { id: id, col: col, input: input };
    editor = ed;
    input.focus();
    if (initialText == null && input.type === 'text') input.select();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); moveActive(1, 0); }
      else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
      else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); moveActive(0, e.shiftKey ? -1 : 1, true); }
      e.stopPropagation();
    });
    input.addEventListener('blur', function () { if (editor === ed) finishEdit(true); });
    return true;
  }

  function editValue(row, col) {
    if (row.project) return project.name;
    var t = row.task, r = sched.byId[t.id];
    switch (col) {
      case 'name': return t.name;
      case 'duration': return String(r.duration);
      case 'start': return fmtDate(r.startMs);
      case 'finish': return fmtDate(r.finishMs);
      case 'preds': return G.formatPredecessors(t, idToRow);
      case 'pct': return String(Math.round(r.pct));
      case 'hours': return String(t.hours || 0);
      case 'cost': return String(t.cost || 0);
    }
    return '';
  }

  function finishEdit(commit) {
    if (!editor) return;
    var ed = editor;
    editor = null;
    var value = ed.input.value;
    if (ed.input.parentNode) ed.input.parentNode.removeChild(ed.input);
    if (commit) commitCell(ed.id, ed.col, value);
    else render();
    $('gridBody').focus({ preventScroll: true });
  }

  function commitCell(id, col, value) {
    if (id === PROJECT_ROW) {
      mutate(function () { project.name = value.trim() || 'Untitled Project'; });
      return;
    }
    var errors = [];
    mutate(function () {
      var t = taskById(id), r = sched.byId[id];
      switch (col) {
        case 'name': t.name = value; break;
        case 'duration': {
          var d = G.parseDuration(value, project.skipWeekends);
          if (isNaN(d)) throw new Error('Durations look like 5, 5d or 2w (0 = milestone).');
          t.duration = d; break;
        }
        case 'start': {
          if (!value.trim()) { t.snet = null; break; }
          if (isNaN(G.parseDate(value))) throw new Error('Please enter a valid date.');
          t.snet = value; break;
        }
        case 'finish': {
          var f = G.parseDate(value);
          if (isNaN(f)) throw new Error('Please enter a valid date.');
          if (f < r.startMs) throw new Error('Finish cannot be before the start (' + fmtDate(r.startMs) + ').');
          t.duration = Math.max(1, sched.calendar.indexOf(f + DAY) - r.es);
          break;
        }
        case 'preds': {
          var res = G.parsePredecessors(value, rowToId, project.skipWeekends);
          errors = res.errors.slice();
          var tree = G.buildTree(project.tasks);
          var idx = new Map(project.tasks.map(function (x, i) { return [x.id, i]; }));
          var seen = new Set();
          t.preds = res.links.filter(function (l) {
            var msg = linkProblem(tree, idx, l.id, t.id, l.type);
            if (!msg && seen.has(l.id)) msg = 'Task ' + idToRow(l.id) + ' is listed twice.';
            if (msg) { errors.push(msg); return false; }
            seen.add(l.id);
            return true;
          });
          break;
        }
        case 'pct': t.pct = Math.min(100, Math.max(0, parseNumber(value))); break;
        case 'hours': t.hours = Math.max(0, parseNumber(value)); break;
        case 'cost': t.cost = Math.max(0, parseNumber(value)); break;
      }
    });
    if (errors.length) toast(errors.join(' '), 'error');
  }

  function linkProblem(tree, idx, predId, succId, type) {
    var p = idx.get(predId), s = idx.get(succId);
    if (p === undefined || s === undefined) return 'Task not found.';
    if (p === s) return 'A task cannot be its own predecessor.';
    var a = tree.parent[s];
    while (a !== -1) { if (a === p) return 'A summary task cannot be linked to its own subtasks.'; a = tree.parent[a]; }
    a = tree.parent[p];
    while (a !== -1) { if (a === s) return 'A summary task cannot be linked to its own subtasks.'; a = tree.parent[a]; }
    if (tree.isSummary[s] && (type === 'FF' || type === 'SF')) {
      return G.LINK_NAMES[type] + ' links cannot drive a summary task; link to a subtask instead.';
    }
    return null;
  }

  /* -------------------------------------------------- selection & nav */

  function selectRow(id, e) {
    e = e || {};
    if (e.shiftKey && anchorId !== null) {
      var a = rowIndexOf(anchorId), b = rowIndexOf(id);
      if (a >= 0 && b >= 0) {
        if (!(e.ctrlKey || e.metaKey)) selection.clear();
        for (var i = Math.min(a, b); i <= Math.max(a, b); i++) if (!rows[i].project) selection.add(rows[i].id);
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (selection.has(id)) selection.delete(id); else if (id !== PROJECT_ROW) selection.add(id);
      anchorId = id;
    } else {
      selection.clear();
      if (id !== PROJECT_ROW) selection.add(id);
      anchorId = id;
    }
    active.id = id;
    renderSelection();
  }

  function moveActive(dRow, dCol, editableOnly) {
    if (active.id === null) { if (rows.length > 1) selectRow(rows[1].id); return; }
    var ri = rowIndexOf(active.id);
    if (dRow) {
      var ni = Math.min(rows.length - 1, Math.max(0, ri + dRow));
      selectRow(rows[ni].id);
      ensureRowVisible(ni);
    }
    if (dCol) {
      var keys = COLUMNS.map(function (c) { return c.key; });
      var ci = keys.indexOf(active.col);
      var row = rows[rowIndexOf(active.id)];
      for (var k = ci + dCol; k >= 0 && k < keys.length; k += dCol) {
        if (!editableOnly || cellEditable(row, keys[k])) { active.col = keys[k]; break; }
      }
      renderSelection();
      if (editableOnly) startEdit(active.id, active.col);
    }
  }

  function ensureRowVisible(ri) {
    var body = $('gridBody');
    var top = ri * ROW_H, bottom = top + ROW_H;
    if (top < body.scrollTop) body.scrollTop = top;
    else if (bottom > body.scrollTop + body.clientHeight - 16) body.scrollTop = bottom - body.clientHeight + 16;
  }

  /* ------------------------------------------------------------ chart */

  function unitStart(ms, unit) {
    var d = new Date(ms);
    switch (unit) {
      case 'day': return ms;
      case 'week': return ms - ((d.getUTCDay() + 6) % 7) * DAY;
      case 'month': return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      case 'year': return Date.UTC(d.getUTCFullYear(), 0, 1);
    }
    return ms;
  }
  function unitNext(ms, unit) {
    var d = new Date(ms);
    switch (unit) {
      case 'day': return ms + DAY;
      case 'week': return ms + 7 * DAY;
      case 'month': return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      case 'year': return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
    }
    return ms + DAY;
  }
  function unitLabel(ms, unit, tier, width) {
    var d = new Date(ms);
    switch (unit) {
      case 'day': return width >= 22 ? WEEKDAYS[d.getUTCDay()][0] + ' ' + d.getUTCDate() : String(d.getUTCDate());
      case 'week':
        return tier === 'top'
          ? 'Week of ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear()
          : String(d.getUTCDate());
      case 'month':
        return tier === 'top' || width > 70 ? MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : MONTHS[d.getUTCMonth()];
      case 'year': return String(d.getUTCFullYear());
    }
    return '';
  }

  function X(ms) { return Math.round((ms - view.start) / DAY * view.px); }

  function computeView() {
    var z = ZOOMS[prefs.zoom] || ZOOMS.week;
    view.px = z.px;
    var lo = sched.calendar.start, hi = sched.project.finishMs;
    project.tasks.forEach(function (t) {
      var r = sched.byId[t.id];
      lo = Math.min(lo, r.startMs); hi = Math.max(hi, r.finishMs);
      if (!isNaN(r.constraintMs)) lo = Math.min(lo, r.constraintMs);
    });
    view.start = unitStart(lo - z.before * DAY, z.bottom === 'day' ? 'week' : z.bottom);
    var end = hi + z.after * DAY;
    var minWidth = ($('chartBody').clientWidth || 800) + 200;
    if ((end - view.start) / DAY * view.px < minWidth) end = view.start + minWidth / view.px * DAY;
    view.end = unitNext(unitStart(end, z.top), z.top);
  }

  function renderChartHeader(width) {
    var z = ZOOMS[prefs.zoom];
    var h = '<svg width="' + width + '" height="46">';
    [['top', z.top, 0], ['bottom', z.bottom, 23]].forEach(function (tier) {
      for (var ms = unitStart(view.start, tier[1]); ms < view.end; ms = unitNext(ms, tier[1])) {
        var x1 = Math.max(0, X(ms)), x2 = X(unitNext(ms, tier[1]));
        if (x2 <= 0) continue;
        h += '<line class="vline" x1="' + x1 + '" x2="' + x1 + '" y1="' + tier[2] + '" y2="' + (tier[2] + 23) + '"/>';
        var w = x2 - x1;
        var label = unitLabel(ms, tier[1], tier[0], w);
        if (w > label.length * 6.6 + 8) {
          h += '<text class="tick ' + tier[0] + '" x="' + (x1 + 4) + '" y="' + (tier[2] + 16) + '">' +
            esc(label) + '</text>';
        }
      }
    });
    h += '<line class="hline" x1="0" x2="' + width + '" y1="23" y2="23"/></svg>';
    $('chartHeader').innerHTML = h;
  }

  function geometry(row, ri) {
    var y0 = ri * ROW_H;
    if (row.project) {
      var P = sched.project;
      return { kind: 'summary', x1: X(P.startMs), x2: X(P.finishMs + (P.duration > 0 ? DAY : 0)), y0: y0, yc: y0 + 12 };
    }
    var r = sched.byId[row.id];
    if (r.isSummary) {
      return { kind: 'summary', x1: X(r.startMs), x2: X(r.finishMs + (r.duration > 0 ? DAY : 0)), y0: y0, yc: y0 + 12 };
    }
    if (r.isMilestone) {
      var cx = X(r.startMs);
      return { kind: 'milestone', x1: cx - 7, x2: cx + 7, cx: cx, y0: y0, yc: y0 + ROW_H / 2 };
    }
    return { kind: 'bar', x1: X(r.startMs), x2: X(r.finishMs + DAY), y0: y0, yc: y0 + ROW_H / 2 };
  }

  function linkPath(pg, sg, type) {
    var from = type[0], to = type[1];
    var xs = from === 'F' ? pg.x2 : pg.x1, ys = pg.yc;
    var xe = to === 'S' ? sg.x1 : sg.x2, ye = sg.yc;
    var gap = 8;
    var xa = from === 'F' ? xs + gap : xs - gap;
    if (to === 'S' && xa <= xe - 2 && ye !== ys) return 'M' + xs + ' ' + ys + ' H' + xa + ' V' + ye + ' H' + (xe - 1);
    if (to === 'F' && xa >= xe + 2 && ye !== ys) return 'M' + xs + ' ' + ys + ' H' + xa + ' V' + ye + ' H' + (xe + 1);
    var xb = to === 'S' ? xe - gap : xe + gap;
    var ymid = ye > ys ? sg.y0 - 2 : sg.y0 + ROW_H + 2;
    if (ye === ys) ymid = ys + ROW_H / 2;
    return 'M' + xs + ' ' + ys + ' H' + xa + ' V' + ymid + ' H' + xb + ' V' + ye + ' H' + (to === 'S' ? xe - 1 : xe + 1);
  }

  function renderChart() {
    computeView();
    var width = X(view.end);
    var height = Math.max(rows.length * ROW_H + 200, ($('chartBody').clientHeight || 0));
    renderChartHeader(width);
    var z = ZOOMS[prefs.zoom];
    var crit = prefs.showCritical;
    var h = [];
    h.push('<svg id="chartSvg" width="' + width + '" height="' + height + '">');
    h.push('<defs>' +
      '<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z"/></marker>' +
      '<marker id="arrowCrit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z"/></marker>' +
      '</defs>');

    // Background: weekends, grid lines, selection, today
    if (z.px >= 6 && project.skipWeekends) {
      for (var ms = view.start; ms < view.end; ms += DAY) {
        if (G.isWeekend(ms)) h.push('<rect class="weekend" x="' + X(ms) + '" y="0" width="' + Math.ceil(view.px) + '" height="' + height + '"/>');
      }
    }
    for (var u = unitStart(view.start, z.bottom); u < view.end; u = unitNext(u, z.bottom)) {
      var vx = X(u);
      if (vx > 0) h.push('<line class="vline" x1="' + vx + '" x2="' + vx + '" y1="0" y2="' + height + '"/>');
    }
    h.push('<g id="selLayer">' + selectionRects(width) + '</g>');
    rows.forEach(function (row, ri) {
      h.push('<line class="hline" x1="0" x2="' + width + '" y1="' + ((ri + 1) * ROW_H - 0.5) + '" y2="' + ((ri + 1) * ROW_H - 0.5) + '"/>');
    });
    var today = G.todayUTC();
    if (today >= view.start && today <= view.end) {
      var tx = X(today);
      h.push('<line class="today" x1="' + tx + '" x2="' + tx + '" y1="0" y2="' + height + '"/>');
    }

    // Geometry of visible rows
    var geo = {};
    rows.forEach(function (row, ri) { geo[row.id] = geometry(row, ri); });

    // Links
    sched.links.forEach(function (l) {
      var pg = geo[l.predId], sg = geo[l.succId];
      if (!pg || !sg) return;
      var d = linkPath(pg, sg, l.type);
      var isCrit = crit && l.critical;
      h.push('<path class="link-hit" d="' + d + '" data-pred="' + l.predId + '" data-succ="' + l.succId + '"><title>' +
        esc(G.LINK_NAMES[l.type] + G.formatLag(l.lag).replace(/^/, l.lag ? ' ' : '') + ' - click to edit') + '</title></path>');
      h.push('<path class="link' + (isCrit ? ' crit' : '') + '" d="' + d + '" marker-end="url(#' + (isCrit ? 'arrowCrit' : 'arrow') + ')"/>');
    });

    // Bars
    rows.forEach(function (row, ri) {
      var g = geo[row.id];
      var r = row.project ? null : sched.byId[row.id];
      var name = row.project ? project.name : row.task.name;
      var isCrit = crit && r && r.critical;
      var selCls = (selection.has(row.id) ? ' selected' : '') + (r && r.pct >= 100 ? ' done' : '');
      if (g.kind === 'summary') {
        var y = g.y0 + 9, x1 = g.x1, x2 = Math.max(g.x2, g.x1 + 2);
        h.push('<g class="summary-group bar-group' + (isCrit ? ' crit' : '') + selCls + '" data-id="' + row.id + '">');
        h.push('<path class="summary-bar" d="M' + x1 + ' ' + y + ' H' + x2 + ' V' + (y + 11) + ' L' + (x2 - 5) + ' ' + (y + 6) +
          ' H' + (x1 + 5) + ' L' + x1 + ' ' + (y + 11) + ' Z"/>');
        if (!row.project) h.push(handles(row.id, g));
        h.push('<text class="bar-label" x="' + (x2 + 8) + '" y="' + (g.y0 + 19) + '">' + esc(name) + '</text>');
        h.push('</g>');
        return;
      }
      h.push('<g class="bar-group' + (isCrit ? ' crit' : '') + selCls + '" data-id="' + row.id + '">');
      if (g.kind === 'milestone') {
        var c = g.cx, yc = g.yc;
        h.push('<path class="milestone" d="M' + c + ' ' + (yc - 8) + ' L' + (c + 8) + ' ' + yc + ' L' + c + ' ' + (yc + 8) + ' L' + (c - 8) + ' ' + yc + ' Z"/>');
        h.push(handles(row.id, g));
        h.push('<text class="bar-label" x="' + (c + 13) + '" y="' + (yc + 4) + '">' + esc(name) +
          ' <tspan class="muted">' + esc(MONTHS[new Date(r.startMs).getUTCMonth()] + ' ' + new Date(r.startMs).getUTCDate()) + '</tspan></text>');
      } else {
        var bw = Math.max(3, g.x2 - g.x1), by = g.y0 + 8, bh = ROW_H - 16;
        h.push('<rect class="bar" x="' + g.x1 + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="3"/>');
        if (r.pct > 0) h.push('<rect class="bar-progress" x="' + g.x1 + '" y="' + (by + bh / 2 - 2) + '" width="' + (bw * r.pct / 100) + '" height="4" rx="1"/>');
        h.push('<rect class="resize-zone" x="' + (g.x1 + bw - 5) + '" y="' + by + '" width="8" height="' + bh + '"/>');
        h.push(handles(row.id, g));
        h.push('<text class="bar-label" x="' + (g.x1 + bw + 10) + '" y="' + (g.yc + 4) + '">' + esc(name) + '</text>');
      }
      h.push('</g>');
    });

    h.push('</svg>');
    $('chartBody').innerHTML = h.join('');
  }

  function selectionRects(width) {
    var out = '';
    rows.forEach(function (row, ri) {
      if (selection.has(row.id)) out += '<rect class="row-sel" x="0" y="' + ri * ROW_H + '" width="' + width + '" height="' + ROW_H + '"/>';
    });
    return out;
  }

  /** Update selection highlighting without rebuilding the DOM (keeps double-click working). */
  function renderSelection() {
    $('gridBody').querySelectorAll('.grow').forEach(function (el) {
      var id = parseId(el.dataset.id);
      el.classList.toggle('selected', selection.has(id));
      el.querySelectorAll('.gcell').forEach(function (c) {
        c.classList.toggle('active', active.id === id && active.col === c.dataset.col);
      });
    });
    var svg = $('chartSvg');
    if (svg) {
      $('selLayer').innerHTML = selectionRects(svg.getAttribute('width'));
      svg.querySelectorAll('.bar-group').forEach(function (g) {
        g.classList.toggle('selected', selection.has(parseId(g.dataset.id)));
      });
    }
    syncToolbar();
  }

  function handles(id, g) {
    var yc = g.yc;
    return '<circle class="handle" data-handle="S" data-id="' + id + '" cx="' + (g.x1 - 6) + '" cy="' + yc + '" r="4.5"><title>Drag to another task to link from this task\'s START</title></circle>' +
      '<circle class="handle" data-handle="F" data-id="' + id + '" cx="' + (g.x2 + 6) + '" cy="' + yc + '" r="4.5"><title>Drag to another task to link from this task\'s FINISH</title></circle>';
  }

  /* ------------------------------------------------------- statusbar */

  function renderStatus() {
    var P = sched.project;
    $('statusbar').innerHTML =
      '<span>Start <b>' + fmtLongDate(P.startMs) + '</b></span>' +
      '<span>Finish <b>' + fmtLongDate(P.finishMs) + '</b></span>' +
      '<span>Duration <b>' + G.formatDuration(P.duration) + '</b></span>' +
      '<span>Hours <b>' + fmtNum(P.hours) + '</b></span>' +
      '<span>Cost <b>' + fmtMoney(P.cost) + '</b></span>' +
      '<span>Complete <b>' + Math.round(P.pct) + '%</b></span>' +
      '<span class="crit">Critical tasks <b>' + P.criticalCount + '</b></span>' +
      '<span class="hint">Double-click a row or bar for details &middot; drag the dots at bar ends to link tasks &middot; press ? for help</span>';
  }

  function render() {
    renderGrid();
    renderChart();
    renderStatus();
    syncToolbar();
  }

  /* --------------------------------------------------------- commands */

  function insertTask(milestone) {
    var t;
    mutate(function () {
      var tasks = project.tasks;
      var at = tasks.length, level = 0;
      var ai = active.id !== null && active.id !== PROJECT_ROW ? indexOfId(active.id) : -1;
      if (ai >= 0) {
        var a = tasks[ai], r = sched.byId[a.id];
        if (r.isSummary && !a.collapsed) { at = ai + 1; level = a.level + 1; }
        else { at = G.subtreeEnd(tasks, ai); level = a.level; }
      } else if (active.id === PROJECT_ROW) {
        at = 0;
      }
      t = newTask({ name: milestone ? 'New milestone' : 'New task', level: level, duration: milestone ? 0 : 1 });
      tasks.splice(at, 0, t);
    });
    if (!t) return;
    selection.clear(); selection.add(t.id); anchorId = t.id;
    active = { id: t.id, col: 'name' };
    render();
    var ri = rowIndexOf(t.id);
    if (ri >= 0) ensureRowVisible(ri);
    startEdit(t.id, 'name');
  }

  function deleteSelected() {
    var ids = selectedTaskIds();
    if (!ids.length) return;
    var toDelete = new Set();
    var extra = 0;
    ids.forEach(function (id) {
      var i = indexOfId(id), end = G.subtreeEnd(project.tasks, i);
      for (var k = i; k < end; k++) {
        if (!toDelete.has(project.tasks[k].id)) {
          toDelete.add(project.tasks[k].id);
          if (!selection.has(project.tasks[k].id)) extra++;
        }
      }
    });
    if (extra > 0 && !confirm('Delete ' + toDelete.size + ' tasks, including ' + extra + ' subtask' + (extra > 1 ? 's' : '') + '?')) return;
    var firstIdx = indexOfId(ids[0]);
    mutate(function () {
      project.tasks = project.tasks.filter(function (t) { return !toDelete.has(t.id); });
    });
    selection.clear();
    var next = project.tasks[Math.min(firstIdx, project.tasks.length - 1)];
    if (next) { selection.add(next.id); anchorId = next.id; active.id = next.id; } else active.id = null;
    render();
    toast('Deleted ' + toDelete.size + ' task' + (toDelete.size > 1 ? 's' : '') + '. Press Ctrl+Z to undo.');
  }

  /** Selected tasks whose ancestors are not also selected (outline roots of the selection). */
  function selectedRoots() {
    var ids = selectedTaskIds();
    var tree = G.buildTree(project.tasks);
    return ids.filter(function (id) {
      var p = tree.parent[indexOfId(id)];
      while (p !== -1) { if (selection.has(project.tasks[p].id)) return false; p = tree.parent[p]; }
      return true;
    });
  }

  function shiftLevel(delta) {
    var roots = selectedRoots();
    if (!roots.length) return;
    var blocked = false;
    mutate(function () {
      var tasks = project.tasks;
      roots.forEach(function (id) {
        var i = indexOfId(id), end = G.subtreeEnd(tasks, i);
        if (delta > 0 && (i === 0 || tasks[i - 1].level < tasks[i].level)) { blocked = true; return; }
        if (delta < 0 && tasks[i].level === 0) { blocked = true; return; }
        for (var k = i; k < end; k++) tasks[k].level += delta;
        if (delta > 0) tasks[i - 1].collapsed = false;
      });
    });
    if (blocked && roots.length === 1) {
      toast(delta > 0 ? 'Can\'t indent: there is no task above at the same level to become the parent.' : 'This task is already at the top level.');
    }
  }

  function moveSelected(dir) {
    var roots = selectedRoots();
    if (roots.length !== 1) { if (roots.length > 1) toast('Select a single task (with its subtasks) to move it.'); return; }
    mutate(function () {
      var tasks = project.tasks;
      var i = indexOfId(roots[0]), lv = tasks[i].level, end = G.subtreeEnd(tasks, i);
      var block = tasks.slice(i, end);
      if (dir < 0) {
        var j = i - 1;
        while (j >= 0 && tasks[j].level > lv) j--;
        if (j < 0 || tasks[j].level !== lv) return false;
        tasks.splice(i, block.length);
        tasks.splice.apply(tasks, [j, 0].concat(block));
      } else {
        if (end >= tasks.length || tasks[end].level !== lv) return false;
        var e2 = G.subtreeEnd(tasks, end);
        tasks.splice(i, block.length);
        var insertAt = e2 - block.length;
        tasks.splice.apply(tasks, [insertAt, 0].concat(block));
      }
    });
  }

  /** Mark the selected tasks (and everything under a selected summary) 100% done, or back to 0% if all are already done. */
  function toggleDone() {
    var ids = selectedTaskIds();
    if (!ids.length) { toast('Select one or more tasks first.'); return; }
    var leaves = [];
    ids.forEach(function (id) {
      var i = indexOfId(id), end = G.subtreeEnd(project.tasks, i);
      for (var k = i; k < end; k++) {
        var tid = project.tasks[k].id;
        if (!sched.byId[tid].isSummary && leaves.indexOf(tid) < 0) leaves.push(tid);
      }
    });
    var allDone = leaves.every(function (id) { return (+taskById(id).pct || 0) >= 100; });
    mutate(function () { leaves.forEach(function (id) { taskById(id).pct = allDone ? 0 : 100; }); });
    toast((allDone ? 'Marked not done: ' : 'Marked done: ') + leaves.length + ' task' + (leaves.length === 1 ? '' : 's') + '.');
  }

  function linkSelected() {
    var ids = selectedTaskIds();
    if (ids.length < 2) { toast('Select two or more tasks (Ctrl+click or Shift+click rows) to link them.'); return; }
    var type = $('linkType').value;
    var errors = [], added = 0;
    mutate(function () {
      for (var i = 1; i < ids.length; i++) {
        var err = G.validateLink(project, ids[i - 1], ids[i], type);
        if (err) { errors.push('Task ' + idToRow(ids[i - 1]) + ' → ' + idToRow(ids[i]) + ': ' + err); continue; }
        taskById(ids[i]).preds.push({ id: ids[i - 1], type: type, lag: 0 });
        added++;
      }
      if (!added) return false;
    });
    if (errors.length) toast(errors[0] + (errors.length > 1 ? ' (+' + (errors.length - 1) + ' more)' : ''), 'error');
    else toast('Linked ' + (added + 1) + ' tasks ' + G.LINK_NAMES[type] + '.');
  }

  function unlinkSelected() {
    var ids = selectedTaskIds();
    if (!ids.length) return;
    var set = new Set(ids);
    var removed = 0;
    mutate(function () {
      project.tasks.forEach(function (t) {
        var before = t.preds.length;
        if (ids.length === 1) {
          t.preds = t.preds.filter(function (l) { return !(set.has(l.id) || set.has(t.id)); });
        } else {
          t.preds = t.preds.filter(function (l) { return !(set.has(l.id) && set.has(t.id)); });
        }
        removed += before - t.preds.length;
      });
      if (!removed) return false;
    });
    toast(removed ? 'Removed ' + removed + ' link' + (removed > 1 ? 's' : '') + '.' : 'No links to remove.');
  }

  function addLink(predId, succId, type, lag) {
    var err = G.validateLink(project, predId, succId, type);
    if (err) { toast(err, 'error'); return false; }
    var ok = mutate(function () { taskById(succId).preds.push({ id: predId, type: type, lag: lag || 0 }); });
    if (ok) toast('Linked ' + idToRow(predId) + ' → ' + idToRow(succId) + ' (' + G.LINK_NAMES[type] + ').');
    return ok;
  }

  function scrollToTask() {
    var ids = selectedTaskIds();
    if (!ids.length) return;
    var r = sched.byId[ids[0]];
    $('chartBody').scrollLeft = Math.max(0, X(r.startMs) - 80);
    var ri = rowIndexOf(ids[0]);
    if (ri >= 0) ensureRowVisible(ri);
  }

  function toggleCollapse(id) {
    var t = taskById(id);
    if (!t) return;
    t.collapsed = !t.collapsed;
    buildRows(); render(); persist();
  }

  function setAllCollapsed(v) {
    project.tasks.forEach(function (t) { if (sched.byId[t.id].isSummary) t.collapsed = v; });
    buildRows(); render(); persist();
  }

  /* ---------------------------------------------------- file handling */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function slug(s) { return (String(s).trim().replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'project'); }

  function saveFile() {
    download(slug(project.name) + '.json', JSON.stringify(project, null, 2), 'application/json');
    toast('Project downloaded as ' + slug(project.name) + '.json');
  }

  function exportCsv() {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['ID', 'WBS', 'Outline Level', 'Task Name', 'Summary', 'Milestone', 'Duration (days)', 'Start', 'Finish',
      'Predecessors', '% Complete', 'Hours Estimate', 'Cost Estimate', 'Total Slack (days)', 'Critical', 'Constraint (Start No Earlier Than)', 'Notes']];
    var P = sched.project;
    lines.push([0, '0', 0, project.name, 'Yes', 'No', P.duration, fmtDate(P.startMs), fmtDate(P.finishMs), '',
      Math.round(P.pct), P.hours, P.cost.toFixed(2), '', '', '', '']);
    project.tasks.forEach(function (t, i) {
      var r = sched.byId[t.id];
      lines.push([i + 1, r.wbs, t.level + 1, t.name, r.isSummary ? 'Yes' : 'No', r.isMilestone ? 'Yes' : 'No', r.duration,
        fmtDate(r.startMs), fmtDate(r.finishMs), G.formatPredecessors(t, idToRow), Math.round(r.pct), r.hours,
        r.cost.toFixed(2), r.slack, r.critical ? 'Yes' : 'No', r.isSummary ? '' : (t.snet || ''), t.notes || '']);
    });
    download(slug(project.name) + '.csv', lines.map(function (l) { return l.map(q).join(','); }).join('\n'), 'text/csv');
  }

  function openFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var p;
      try { p = normalizeProject(JSON.parse(reader.result)); } catch (e) {
        toast('Could not open file: ' + e.message, 'error');
        return;
      }
      mutate(function () { project = p; });
      selection.clear(); active.id = null;
      render();
      toast('Opened "' + project.name + '". Press Ctrl+Z to go back.');
    };
    reader.readAsText(file);
  }

  /* --------------------------------------------------------- dialogs */

  function typeOptions(sel) {
    return G.LINK_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + t + ' - ' + G.LINK_NAMES[t] + '</option>';
    }).join('');
  }

  function linkSentence(type, a, b, lag) {
    var lagTxt = lag ? ' ' + (lag > 0 ? 'plus ' + lag : 'minus ' + (-lag)) + ' working day' + (Math.abs(lag) === 1 ? '' : 's') : '';
    var map = {
      FS: '"' + b + '" starts when "' + a + '" finishes' + lagTxt + '.',
      SS: '"' + b + '" starts when "' + a + '" starts' + lagTxt + '.',
      FF: '"' + b + '" finishes when "' + a + '" finishes' + lagTxt + '.',
      SF: '"' + b + '" finishes when "' + a + '" starts' + lagTxt + '.'
    };
    return map[type];
  }

  function taskOptionList(excludeIds, selectedId) {
    return project.tasks.map(function (t, i) {
      if (excludeIds.has(t.id)) return '';
      return '<option value="' + t.id + '"' + (t.id === selectedId ? ' selected' : '') + '>' +
        (i + 1) + ' - ' + '  '.repeat(t.level) + esc(t.name) + '</option>';
    }).join('');
  }

  function openTaskDialog(id) {
    if (id === PROJECT_ROW || id == null) return;
    var t = taskById(id), r = sched.byId[id];
    if (!t) return;
    var dlg = $('taskDialog');
    var isSum = r.isSummary;
    // exclude self, ancestors and descendants from link choices
    var tree = G.buildTree(project.tasks);
    var i = indexOfId(id);
    var exclude = new Set([id]);
    var p = tree.parent[i];
    while (p !== -1) { exclude.add(project.tasks[p].id); p = tree.parent[p]; }
    for (var k = i + 1, end = G.subtreeEnd(project.tasks, i); k < end; k++) exclude.add(project.tasks[k].id);

    var preds = t.preds.map(function (l) { return { id: l.id, type: l.type, lag: l.lag }; });
    var succs = [];
    project.tasks.forEach(function (s) {
      s.preds.forEach(function (l) { if (l.id === id) succs.push({ id: s.id, type: l.type, lag: l.lag }); });
    });

    function predRows() {
      if (!preds.length) return '<tr><td colspan="4" class="empty">No predecessors - this task can start at the project start.</td></tr>';
      return preds.map(function (l, n) {
        return '<tr data-n="' + n + '"><td><select class="task-sel" data-f="id">' + taskOptionList(exclude, l.id) + '</select></td>' +
          '<td><select data-f="type">' + typeOptions(l.type) + '</select></td>' +
          '<td><input class="small" data-f="lag" type="number" step="1" value="' + l.lag + '" title="Lag in working days (negative = lead)"></td>' +
          '<td><button type="button" class="danger" data-rm="' + n + '" title="Remove link">&#10005;</button></td></tr>';
      }).join('');
    }
    function succRows() {
      if (!succs.length) return '<tr><td colspan="4" class="empty">No tasks depend on this one.</td></tr>';
      return succs.map(function (l, n) {
        return '<tr><td>' + idToRow(l.id) + ' - ' + esc(taskById(l.id).name) + '</td><td>' + G.LINK_NAMES[l.type] + '</td><td>' +
          (G.formatLag(l.lag) || '-') + '</td><td><button type="button" class="danger" data-rms="' + n + '" title="Remove link">&#10005;</button></td></tr>';
      }).join('');
    }

    dlg.innerHTML =
      '<form method="dialog" novalidate>' +
      '<h2>Task ' + (i + 1) + (isSum ? ' (summary)' : r.isMilestone ? ' (milestone)' : '') + '</h2>' +
      '<div class="form-grid">' +
      '<label class="f full">Name<input name="name" value="' + esc(t.name) + '" required></label>' +
      '<label class="f">Duration (working days; 0 = milestone)<input name="duration" value="' + r.duration + '"' + (isSum ? ' disabled title="Rolled up from subtasks"' : '') + '></label>' +
      '<label class="f">Start no earlier than<span class="inline"><input type="date" name="snet" value="' + esc(isSum ? '' : t.snet || '') + '"' + (isSum ? ' disabled' : '') + '>' +
      '<button type="button" data-clear-snet' + (isSum ? ' disabled' : '') + '>Clear</button></span></label>' +
      '<label class="f">% Complete<input name="pct" type="number" min="0" max="100" value="' + Math.round(r.pct) + '"' + (isSum ? ' disabled' : '') + '></label>' +
      '<label class="f">Hours estimate<input name="hours" type="number" min="0" step="any" value="' + (isSum ? r.hours : t.hours || 0) + '"' + (isSum ? ' disabled title="Sum of subtasks"' : '') + '></label>' +
      '<label class="f">Cost estimate ($)<input name="cost" type="number" min="0" step="any" value="' + (isSum ? r.cost : t.cost || 0) + '"' + (isSum ? ' disabled title="Sum of subtasks"' : '') + '></label>' +
      '<label class="f">Outline (WBS)<input value="' + r.wbs + '" disabled></label>' +
      '<label class="f full">Notes<textarea name="notes">' + esc(t.notes || '') + '</textarea></label>' +
      '</div>' +
      '<div class="stats">' +
      '<div><span>Start</span>' + fmtLongDate(r.startMs) + '</div>' +
      '<div><span>Finish</span>' + fmtLongDate(r.finishMs) + '</div>' +
      '<div><span>Total slack</span>' + fmtSlack(r.slack) + '</div>' +
      '<div><span>Critical?</span>' + (r.critical ? '<b style="color:var(--critical)">Yes</b>' : 'No') + '</div>' +
      '</div>' +
      '<h3>Predecessors (this task depends on)</h3>' +
      '<table class="links"><thead><tr><th>Task</th><th>Type</th><th>Lag (days)</th><th></th></tr></thead><tbody id="predRows">' + predRows() + '</tbody></table>' +
      '<button type="button" id="addPred" style="margin-top:6px">+ Add predecessor</button>' +
      '<div class="type-desc">FS: start after it finishes &middot; SS: start after it starts &middot; FF: finish after it finishes &middot; SF: finish after it starts' +
      (isSum ? '<br>Summary tasks can only be driven by FS or SS links.' : '') + '</div>' +
      '<h3>Successors (depend on this task)</h3>' +
      '<table class="links"><thead><tr><th>Task</th><th>Type</th><th>Lag</th><th></th></tr></thead><tbody id="succRows">' + succRows() + '</tbody></table>' +
      '<div class="err" id="taskErr"></div>' +
      '<div class="dlg-buttons"><button type="button" class="danger left" id="dlgDelete">Delete task</button>' +
      '<button type="button" id="dlgCancel">Cancel</button><button type="submit" class="primary" value="ok">OK</button></div>' +
      '</form>';

    var form = dlg.querySelector('form');
    function readPredRows() {
      dlg.querySelectorAll('#predRows tr[data-n]').forEach(function (tr) {
        var l = preds[+tr.dataset.n];
        l.id = Number(tr.querySelector('[data-f=id]').value);
        l.type = tr.querySelector('[data-f=type]').value;
        l.lag = Math.round(+tr.querySelector('[data-f=lag]').value || 0);
      });
    }
    dlg.querySelector('#addPred').onclick = function () {
      readPredRows();
      var candidates = project.tasks.filter(function (x) { return !exclude.has(x.id) && !preds.some(function (l) { return l.id === x.id; }); });
      if (!candidates.length) { dlg.querySelector('#taskErr').textContent = 'There are no other tasks to link to.'; return; }
      // default: the nearest task above
      var above = candidates.filter(function (x) { return indexOfId(x.id) < i; });
      var pick = above.length ? above[above.length - 1] : candidates[0];
      preds.push({ id: pick.id, type: isSum ? 'FS' : 'FS', lag: 0 });
      dlg.querySelector('#predRows').innerHTML = predRows();
    };
    dlg.querySelector('#predRows').onclick = function (e) {
      var b = e.target.closest('[data-rm]');
      if (!b) return;
      readPredRows();
      preds.splice(+b.dataset.rm, 1);
      dlg.querySelector('#predRows').innerHTML = predRows();
    };
    dlg.querySelector('#succRows').onclick = function (e) {
      var b = e.target.closest('[data-rms]');
      if (!b) return;
      succs.splice(+b.dataset.rms, 1);
      dlg.querySelector('#succRows').innerHTML = succRows();
    };
    var clr = dlg.querySelector('[data-clear-snet]');
    clr.onclick = function () { form.elements.snet.value = ''; };
    dlg.querySelector('#dlgCancel').onclick = function () { dlg.close(); };
    dlg.querySelector('#dlgDelete').onclick = function () {
      dlg.close();
      selection.clear(); selection.add(id);
      deleteSelected();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      readPredRows();
      var errEl = dlg.querySelector('#taskErr');
      var f = form.elements;
      var dur = isSum ? null : G.parseDuration(f.duration.value, project.skipWeekends);
      if (!isSum && isNaN(dur)) { errEl.textContent = 'Duration should look like 5, 5d or 2w.'; return; }
      var seen = new Set();
      var tree2 = G.buildTree(project.tasks);
      var idx2 = new Map(project.tasks.map(function (x, n) { return [x.id, n]; }));
      for (var n = 0; n < preds.length; n++) {
        var msg = linkProblem(tree2, idx2, preds[n].id, id, preds[n].type);
        if (!msg && seen.has(preds[n].id)) msg = 'Task ' + idToRow(preds[n].id) + ' is listed more than once.';
        if (msg) { errEl.textContent = msg; return; }
        seen.add(preds[n].id);
      }
      var keepSucc = new Set(succs.map(function (s) { return s.id; }));
      var ok = mutate(function () {
        var tt = taskById(id);
        tt.name = f.name.value;
        tt.notes = f.notes.value;
        if (!isSum) {
          tt.duration = dur;
          tt.snet = f.snet.value || null;
          tt.pct = Math.min(100, Math.max(0, +f.pct.value || 0));
          tt.hours = Math.max(0, +f.hours.value || 0);
          tt.cost = Math.max(0, +f.cost.value || 0);
        }
        tt.preds = preds.map(function (l) { return { id: l.id, type: l.type, lag: l.lag }; });
        project.tasks.forEach(function (s) {
          if (keepSucc.has(s.id)) return;
          s.preds = s.preds.filter(function (l) { return l.id !== id; });
        });
      });
      if (ok) dlg.close();
      else errEl.textContent = 'Those links would create a circular dependency.';
    };
    dlg.showModal();
    form.elements.name.focus();
  }

  function openLinkDialog(predId, succId) {
    var succ = taskById(succId), pred = taskById(predId);
    if (!succ || !pred) return;
    var link = succ.preds.find(function (l) { return l.id === predId; });
    if (!link) return;
    var dlg = $('linkDialog');
    dlg.innerHTML =
      '<form method="dialog">' +
      '<h2>Task dependency</h2>' +
      '<p><b>From:</b> ' + idToRow(predId) + ' - ' + esc(pred.name) + '<br><b>To:</b> ' + idToRow(succId) + ' - ' + esc(succ.name) + '</p>' +
      '<div class="form-grid">' +
      '<label class="f">Type<select name="type">' + typeOptions(link.type) + '</select></label>' +
      '<label class="f">Lag (working days, negative = lead)<input name="lag" type="number" step="1" value="' + link.lag + '"></label>' +
      '</div>' +
      '<div class="type-desc" id="linkDesc"></div>' +
      '<div class="err" id="linkErr"></div>' +
      '<div class="dlg-buttons"><button type="button" class="danger left" id="linkDelete">Delete link</button>' +
      '<button type="button" id="linkCancel">Cancel</button><button type="submit" class="primary">OK</button></div>' +
      '</form>';
    var form = dlg.querySelector('form');
    function desc() {
      dlg.querySelector('#linkDesc').textContent = linkSentence(form.elements.type.value, pred.name, succ.name, Math.round(+form.elements.lag.value || 0));
    }
    form.elements.type.onchange = desc;
    form.elements.lag.oninput = desc;
    desc();
    dlg.querySelector('#linkCancel').onclick = function () { dlg.close(); };
    dlg.querySelector('#linkDelete').onclick = function () {
      mutate(function () { var s = taskById(succId); s.preds = s.preds.filter(function (l) { return l.id !== predId; }); });
      dlg.close();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      var type = form.elements.type.value;
      var tree = G.buildTree(project.tasks);
      var idx = new Map(project.tasks.map(function (x, n) { return [x.id, n]; }));
      var msg = linkProblem(tree, idx, predId, succId, type);
      if (msg) { dlg.querySelector('#linkErr').textContent = msg; return; }
      var ok = mutate(function () {
        var l = taskById(succId).preds.find(function (x) { return x.id === predId; });
        l.type = type; l.lag = Math.round(+form.elements.lag.value || 0);
      });
      if (ok) dlg.close();
    };
    dlg.showModal();
  }

  function anyDialogOpen() {
    return !!document.querySelector('dialog[open]');
  }

  /* ---------------------------------------------------- tooltip/toast */

  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, kind === 'error' ? 5500 : 3200);
  }
  function showTip(html, e) {
    var el = $('tooltip');
    el.innerHTML = html;
    el.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 16;
    var w = el.offsetWidth, hgt = el.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 10;
    if (y + hgt > window.innerHeight - 8) y = e.clientY - hgt - 10;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function hideTip() { $('tooltip').hidden = true; }

  function taskTip(id) {
    if (id === PROJECT_ROW) {
      var P = sched.project;
      return '<b>' + esc(project.name) + '</b><br>' + fmtLongDate(P.startMs) + ' → ' + fmtLongDate(P.finishMs) +
        '<br>' + G.formatDuration(P.duration) + ' · ' + fmtNum(P.hours) + ' h · ' + fmtMoney(P.cost);
    }
    var t = taskById(id), r = sched.byId[id];
    return '<b>' + idToRow(id) + '. ' + esc(t.name) + '</b>' + (r.isSummary ? ' (summary)' : '') +
      '<br>' + fmtLongDate(r.startMs) + (r.isMilestone ? '' : ' → ' + fmtLongDate(r.finishMs)) +
      '<br>' + G.formatDuration(r.duration) + ' · ' + Math.round(r.pct) + '% done' +
      '<br>' + fmtNum(r.hours) + ' h · ' + fmtMoney(r.cost) +
      '<br>Slack ' + fmtSlack(r.slack) + (r.critical ? ' · <span style="color:#ff8a8d">critical</span>' : '');
  }

  /* -------------------------------------------------- chart pointer */

  function rowAtY(clientY) {
    var rect = $('chartSvg').getBoundingClientRect();
    var ri = Math.floor((clientY - rect.top) / ROW_H);
    return rows[ri] || null;
  }

  function barGroupAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var g = el && el.closest && el.closest('.bar-group');
    if (g) return g;
    // fall back to row under pointer when hovering empty space of a row
    var row = rowAtY(y);
    if (!row || row.project) return null;
    return $('chartBody').querySelector('.bar-group[data-id="' + row.id + '"]');
  }

  function parseId(v) { return v === PROJECT_ROW ? PROJECT_ROW : Number(v); }

  var lastDown = null; // pointer capture retargets dblclick to the <svg>, so remember the bar

  function onChartPointerDown(e) {
    if (e.button !== 0) return;
    hideTip();
    var svg = $('chartSvg');
    var handle = e.target.closest('.handle');
    var hit = e.target.closest('.link-hit');
    var group = e.target.closest('.bar-group');
    if (handle) {
      e.preventDefault();
      var id = Number(handle.dataset.id);
      var cx = +handle.getAttribute('cx'), cy = +handle.getAttribute('cy');
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('class', 'rubber');
      svg.appendChild(line);
      drag = { mode: 'link', id: id, side: handle.dataset.handle, x0: cx, y0: cy, line: line, target: null };
      handle.classList.add('show');
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (hit) {
      openLinkDialog(Number(hit.dataset.pred), Number(hit.dataset.succ));
      return;
    }
    if (group) {
      var gid = parseId(group.dataset.id);
      lastDown = { id: gid, t: Date.now() };
      if (gid === PROJECT_ROW || sched.byId[gid].isSummary) {
        drag = { mode: 'click', id: gid, sx: e.clientX };
      } else {
        var resize = !!e.target.closest('.resize-zone');
        drag = { mode: resize ? 'resize' : 'move', id: gid, sx: e.clientX, dx: 0, group: group, moved: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      }
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    var row = rowAtY(e.clientY);
    if (row) selectRow(row.id, e);
  }

  function onChartPointerMove(e) {
    if (!drag) {
      var g = e.target.closest && e.target.closest('.bar-group');
      if (g && !e.target.closest('.handle')) showTip(taskTip(parseId(g.dataset.id)), e);
      else hideTip();
      return;
    }
    var svg = $('chartSvg');
    var rect = svg.getBoundingClientRect();
    if (drag.mode === 'link') {
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      drag.line.setAttribute('d', 'M' + drag.x0 + ' ' + drag.y0 + ' L' + px + ' ' + py);
      var prev = svg.querySelector('.drop-target');
      if (prev) prev.classList.remove('drop-target');
      drag.target = null;
      var tg = barGroupAt(e.clientX, e.clientY);
      if (tg && parseId(tg.dataset.id) !== drag.id && tg.dataset.id !== PROJECT_ROW) {
        var bb = tg.getBBox();
        var tid = Number(tg.dataset.id);
        var tr = sched.byId[tid];
        var mid = bb.x + bb.width / 2;
        var toSide = (px < mid) ? 'S' : 'F';
        if (tr.isSummary) toSide = 'S';
        var type = drag.side + toSide;
        drag.target = { id: tid, type: type };
        tg.classList.add('drop-target');
        var err = G.validateLink(project, drag.id, tid, type);
        showTip('<b>' + G.LINK_NAMES[type] + '</b><br>' +
          esc(linkSentence(type, taskById(drag.id).name, taskById(tid).name, 0)) +
          (err ? '<br><span style="color:#ff8a8d">' + esc(err) + '</span>' : '<br><i>Release to link</i>'), e);
      } else {
        showTip('Drop on the <b>start</b> or <b>finish</b> half of another task', e);
      }
      return;
    }
    if (drag.mode === 'click') return;
    var dxPx = e.clientX - drag.sx;
    if (Math.abs(dxPx) > 3) drag.moved = true;
    if (!drag.moved) return;
    var days = Math.round(dxPx / view.px);
    drag.dx = days;
    var r = sched.byId[drag.id];
    if (drag.mode === 'move') {
      drag.group.setAttribute('transform', 'translate(' + (days * view.px) + ',0)');
      drag.group.classList.add('dragging');
      var ns = r.startMs + days * DAY;
      var cal = sched.calendar;
      var nsAdj = cal.dateOf(cal.indexOf(ns));
      var nf = r.duration > 0 ? cal.dateOf(cal.indexOf(ns) + r.duration - 1) : nsAdj;
      showTip('<b>Move</b><br>Start ' + fmtLongDate(nsAdj) + '<br>Finish ' + fmtLongDate(nf), e);
    } else if (drag.mode === 'resize') {
      var bar = drag.group.querySelector('.bar');
      var baseW = X(r.finishMs + DAY) - X(r.startMs);
      var w = Math.max(view.px, baseW + days * view.px);
      bar.setAttribute('width', w);
      var nd = newDurationFromResize(r, days);
      showTip('<b>Duration ' + G.formatDuration(nd) + '</b><br>Finish ' + fmtLongDate(sched.calendar.dateOf(r.es + nd - 1)), e);
    }
  }

  function newDurationFromResize(r, days) {
    var endExcl = r.finishMs + DAY + days * DAY;
    return Math.max(1, sched.calendar.indexOf(endExcl) - r.es);
  }

  function onChartPointerUp(e) {
    if (!drag) return;
    var d = drag;
    drag = null;
    hideTip();
    var svg = $('chartSvg');
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (d.mode === 'link') {
      d.line.remove();
      var prev = svg.querySelector('.drop-target');
      if (prev) prev.classList.remove('drop-target');
      svg.querySelectorAll('.handle.show').forEach(function (h) { h.classList.remove('show'); });
      if (d.target) addLink(d.id, d.target.id, d.target.type, 0);
      return;
    }
    if (d.mode === 'click' || !d.moved) {
      selectRow(d.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
      return;
    }
    var r = sched.byId[d.id];
    if (d.mode === 'move') {
      if (!d.dx) { render(); return; }
      var target = r.startMs + d.dx * DAY;
      var targetIdx = sched.calendar.indexOf(target);
      mutate(function () { taskById(d.id).snet = fmtDate(sched.calendar.dateOf(targetIdx)); });
      var nr = sched.byId[d.id];
      if (nr && nr.es > targetIdx) {
        toast('Its predecessors don\'t allow it to start earlier than ' + fmtLongDate(nr.startMs) + '.', 'error');
      } else {
        toast('Task pinned to start no earlier than ' + fmtLongDate(nr.startMs) + ' (📌). Clear it in Task details.');
      }
    } else if (d.mode === 'resize') {
      var nd = newDurationFromResize(r, d.dx);
      mutate(function () { taskById(d.id).duration = nd; });
    }
  }

  /* ------------------------------------------------------ wiring */

  function runCommand(cmd) {
    if (editor) finishEdit(true);
    switch (cmd) {
      case 'new':
        mutate(function () { project = blankProject(); });
        selection.clear(); active.id = null; render();
        toast('Started a new project. Press Ctrl+Z to undo.');
        break;
      case 'open': $('fileInput').click(); break;
      case 'save': saveFile(); break;
      case 'csv': exportCsv(); break;
      case 'addTask': insertTask(false); break;
      case 'addMilestone': insertTask(true); break;
      case 'delete': deleteSelected(); break;
      case 'indent': shiftLevel(1); break;
      case 'outdent': shiftLevel(-1); break;
      case 'moveUp': moveSelected(-1); break;
      case 'moveDown': moveSelected(1); break;
      case 'markDone': toggleDone(); break;
      case 'link': linkSelected(); break;
      case 'unlink': unlinkSelected(); break;
      case 'scrollToTask': scrollToTask(); break;
      case 'details': openTaskDialog(selectedTaskIds()[0]); break;
      case 'expandAll': setAllCollapsed(false); break;
      case 'collapseAll': setAllCollapsed(true); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'help': $('helpDialog').showModal(); break;
    }
  }

  function wire() {
    document.querySelectorAll('[data-cmd]').forEach(function (b) {
      b.addEventListener('click', function () { runCommand(b.dataset.cmd); });
    });
    $('fileInput').addEventListener('change', function (e) {
      if (e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    });
    $('projectName').addEventListener('change', function (e) {
      mutate(function () { project.name = e.target.value.trim() || 'Untitled Project'; });
    });
    $('projectName').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });
    $('projectStart').addEventListener('change', function (e) {
      if (isNaN(G.parseDate(e.target.value))) return;
      mutate(function () { project.start = e.target.value; });
    });
    $('skipWeekends').addEventListener('change', function (e) {
      mutate(function () { project.skipWeekends = e.target.checked; });
    });
    $('zoom').addEventListener('change', function (e) { prefs.zoom = e.target.value; savePrefs(); renderChart(); });
    $('showCritical').addEventListener('change', function (e) { prefs.showCritical = e.target.checked; savePrefs(); render(); });

    // Grid
    var body = $('gridBody');
    body.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var tog = e.target.closest('[data-toggle]');
      if (tog) { e.preventDefault(); toggleCollapse(Number(tog.dataset.toggle)); return; }
      var rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      if (editor) finishEdit(true);
      var cell = e.target.closest('.gcell');
      var id = parseId(rowEl.dataset.id);
      var col = cell ? cell.dataset.col : active.col;
      var wasActive = active.id === id && active.col === col && selection.size <= 1 && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      active.col = col;
      selectRow(id, e);
      body.focus({ preventScroll: true });
      if (wasActive && col !== 'id') {
        e.preventDefault();
        startEdit(id, col);
      }
    });
    body.addEventListener('dblclick', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      var id = parseId(rowEl.dataset.id);
      var cell = e.target.closest('.gcell');
      var col = cell ? cell.dataset.col : 'name';
      if (col === 'id' || !startEdit(id, col)) openTaskDialog(id);
    });

    // Scroll sync
    var chartBody = $('chartBody');
    var syncing = false;
    body.addEventListener('scroll', function () {
      $('gridHeader').scrollLeft = body.scrollLeft;
      if (syncing) { syncing = false; return; }
      if (chartBody.scrollTop !== body.scrollTop) { syncing = true; chartBody.scrollTop = body.scrollTop; }
    });
    chartBody.addEventListener('scroll', function () {
      $('chartHeader').scrollLeft = chartBody.scrollLeft;
      if (syncing) { syncing = false; return; }
      if (body.scrollTop !== chartBody.scrollTop) { syncing = true; body.scrollTop = chartBody.scrollTop; }
    });

    // Chart
    chartBody.addEventListener('pointerdown', onChartPointerDown);
    chartBody.addEventListener('pointermove', onChartPointerMove);
    chartBody.addEventListener('pointerup', onChartPointerUp);
    chartBody.addEventListener('pointercancel', function () { drag = null; hideTip(); render(); });
    chartBody.addEventListener('pointerleave', function () { if (!drag) hideTip(); });
    chartBody.addEventListener('dblclick', function (e) {
      var g = e.target.closest('.bar-group');
      var id = g ? parseId(g.dataset.id) : (lastDown && Date.now() - lastDown.t < 800 ? lastDown.id : null);
      if (id !== null && id !== PROJECT_ROW) openTaskDialog(id);
    });

    // Splitter
    var splitter = $('splitter'), pane = $('gridPane');
    pane.style.width = (prefs.gridWidth || Math.min(gridTotalWidth() + 18, Math.round(window.innerWidth * 0.6))) + 'px';
    splitter.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      splitter.classList.add('dragging');
      splitter.setPointerCapture(e.pointerId);
      var sx = e.clientX, sw = pane.offsetWidth;
      function mv(ev) { pane.style.width = Math.max(200, sw + ev.clientX - sx) + 'px'; }
      function up() {
        splitter.classList.remove('dragging');
        splitter.removeEventListener('pointermove', mv);
        splitter.removeEventListener('pointerup', up);
        prefs.gridWidth = pane.offsetWidth; savePrefs();
        renderChart();
      }
      splitter.addEventListener('pointermove', mv);
      splitter.addEventListener('pointerup', up);
    });

    // Column resize
    $('gridHeader').addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.col-resize');
      if (!h) return;
      e.preventDefault();
      var key = h.dataset.col;
      var col = COLUMNS.find(function (c) { return c.key === key; });
      var sx = e.clientX, sw = colWidth(col);
      h.setPointerCapture(e.pointerId);
      function mv(ev) { prefs.colWidths[key] = Math.max(30, sw + ev.clientX - sx); renderGrid(); }
      function up() { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); savePrefs(); }
      // the header is re-rendered while dragging, so listen on the document instead
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', function done() {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', done);
        up();
      });
    });

    // Keyboard
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', function () { renderChart(); });
  }

  function onKeyDown(e) {
    if (anyDialogOpen()) return;
    var inField = e.target.matches && e.target.matches('input, textarea, select');
    var ctrl = e.ctrlKey || e.metaKey;
    var k = e.key;
    if (ctrl && !inField) {
      if (k === 'z' || k === 'Z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (k === 'y' || k === 'Y') { e.preventDefault(); redo(); return; }
      if (k === 'l' || k === 'L') { e.preventDefault(); linkSelected(); return; }
      if (k === 'a' || k === 'A') {
        e.preventDefault();
        rows.forEach(function (r) { if (!r.project) selection.add(r.id); });
        renderSelection(); return;
      }
    }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); if (editor) finishEdit(true); saveFile(); return; }
    if (ctrl && (k === 'o' || k === 'O')) { e.preventDefault(); $('fileInput').click(); return; }
    if (inField) return;
    if (e.altKey && e.shiftKey) {
      if (k === 'ArrowRight') { e.preventDefault(); shiftLevel(1); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); shiftLevel(-1); return; }
      if (k === 'ArrowUp') { e.preventDefault(); moveSelected(-1); return; }
      if (k === 'ArrowDown') { e.preventDefault(); moveSelected(1); return; }
    }
    switch (k) {
      case 'ArrowDown': case 'ArrowUp': {
        e.preventDefault();
        var dir = k === 'ArrowDown' ? 1 : -1;
        if (e.shiftKey && active.id !== null) {
          var ni = Math.min(rows.length - 1, Math.max(0, rowIndexOf(active.id) + dir));
          var keep = anchorId;
          selectRow(rows[ni].id, { shiftKey: true });
          anchorId = keep;
          ensureRowVisible(ni);
        } else moveActive(dir, 0);
        return;
      }
      case 'ArrowLeft': e.preventDefault(); moveActive(0, -1); return;
      case 'ArrowRight': e.preventDefault(); moveActive(0, 1); return;
      case 'Tab': e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1); return;
      case 'Enter': case 'F2':
        if (active.id !== null) { e.preventDefault(); if (!startEdit(active.id, active.col)) openTaskDialog(active.id); }
        return;
      case 'Delete': e.preventDefault(); deleteSelected(); return;
      case 'Insert': e.preventDefault(); insertTask(false); return;
      case '?': e.preventDefault(); $('helpDialog').showModal(); return;
      case 'Escape': selection.clear(); renderSelection(); return;
    }
    if (k.length === 1 && !ctrl && !e.altKey && active.id !== null) {
      if (startEdit(active.id, active.col, active.col === 'start' || active.col === 'finish' ? null : k)) e.preventDefault();
    }
  }

  /* ------------------------------------------------------------ boot */

  project = loadInitial();
  sched = G.schedule(project);
  buildRows();
  wire();
  render();
  if (project.tasks.length) {
    var first = project.tasks[0].id;
    selection.add(first); anchorId = first; active.id = first;
    render();
  }
  window.EasyGantt = { get project() { return project; }, get schedule() { return sched; }, runCommand: runCommand };
})();
