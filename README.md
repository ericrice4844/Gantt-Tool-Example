# Easy Gantt (Gantt Tool Example)

A simple Gantt chart app inspired by Microsoft Project, built to be easy to use.
It is plain HTML/JavaScript with no dependencies or build step, so it runs on
Linux, macOS and Windows in Firefox, Chrome or Chromium.

## Run it on Linux

```bash
cd Gantt-Tool-Example
python3 gantt.py                 # starts a local server and opens your browser
python3 gantt.py --install-desktop   # optional: adds "Easy Gantt" to your app menu
```

You can also open `index.html` directly in a browser (`xdg-open index.html`).
The launcher only needs the Python 3 standard library, which most Linux distributions include.

## Features

| Feature | How |
|---|---|
| **Tasks, durations and milestones** | `+ Task` / `Insert`. Durations take `5`, `5d` or `2w`; `0` makes a milestone ◆. |
| **Parent/child (summary) tasks** | Use **Indent**/**Outdent** (`Alt+Shift+→/←`) to build any number of levels. Summary rows roll up start, finish, duration, % done, **hours** and **cost**. Row 0 is the project summary with totals. |
| **Dependencies: FS, SS, FF, SF, with lag/lead** | Drag from the dot at a bar's start or end onto another bar's start or end half (the ends you pick set the type). Or select rows and press **Link**, or type in the Predecessors column (`3`, `3SS`, `2FS+2d`, `4FF-1d`). Click an arrow to edit or delete it. |
| **Critical path** | A full forward/backward-pass (CPM) calculation. Zero-slack tasks and the links that drive them show in red, and the **Total Slack** column shows each task's float. |
| **Hours and cost estimates** | Entered per task and summed up through every summary level to the project total. |
| **Scheduling** | Drag bars to move them (this sets a "start no earlier than" constraint 📌), or drag a bar's right edge to change its duration. Weekends can be non-working. |
| **Task details window** | Double-click a row or bar to edit everything, including the lists of predecessors and successors. |
| **Files** | Autosaves in the browser. **Save**/**Open** use `.json` files. **Export CSV** works with LibreOffice Calc or Excel. |
| **Undo / redo** | `Ctrl+Z` / `Ctrl+Y` |

Rules that match Microsoft Project: a summary task can't be linked to its own subtasks,
FF and SF links can't drive a summary task, and links that would create a loop are rejected.

## Files

- `index.html`, `styles.css`, `app.js` — the user interface
- `scheduler.js` — the scheduling engine (calendar, outline, CPM, link validation), with no DOM code
- `gantt.py` — Linux launcher and local web server
- `tests/scheduler.test.js` — engine tests, run with `node --test tests/*.test.js`
