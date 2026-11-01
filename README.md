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
| **Estimate / Actual modes** | Use the switch at the top left. **Estimate** has Headcount, Hours Est. and Cost Est. columns. Enter either headcount or hours and the other is calculated: *hours = working days × hours per day × headcount* (20 days × 8 h × 2 people = 320 h). Changing a duration recalculates hours. **Actual** has actual start and finish, hours and cost, with variance columns (red + = over or late, green − = under or early). The chart shows the estimate as a grey line and the actual dates as a purple bar. |
| **Holidays** | No work is scheduled on holidays, so durations count working days only. The 11 US federal holidays are on by default, with weekend dates moved to the observed Friday or Monday. Use **Calendar…** to switch any of them off, add optional holidays (day after Thanksgiving, Christmas Eve, New Year's Eve) or your own company holidays, and set the hours in a work day. Holidays are shaded on the chart. |
| **Hours and cost roll-ups** | Estimated and actual hours and costs add up through every summary level to the project total (row 0). |
| **Scheduling** | Drag bars to move them (this sets a "start no earlier than" constraint 📌), or drag a bar's right edge to change its duration. Weekends can be non-working. |
| **Mark tasks done** | Select tasks and press **✓ Done**. They turn green with a ✓, and selecting a summary marks all of its subtasks. Press it again to un-mark. Type any value in **% Done** for partial progress, which rolls up through the summaries. |
| **Task details window** | Double-click a row or bar to edit everything, including the lists of predecessors and successors. |
| **Files** | Autosaves in the browser. **Save**/**Open** use `.json` files. **Export CSV** works with LibreOffice Calc or Excel. |
| **Undo / redo** | `Ctrl+Z` / `Ctrl+Y` |

Rules that match Microsoft Project: a summary task can't be linked to its own subtasks,
FF and SF links can't drive a summary task, and links that would create a loop are rejected.

## Files

- `index.html`, `styles.css`, `app.js` — the user interface
- `default-project.js` — the project shown the first time the app opens (PVE Home Renovation & Move)
- `scheduler.js` — the scheduling engine (calendar, outline, CPM, link validation), with no DOM code
- `gantt.py` — Linux launcher and local web server
- `tests/scheduler.test.js` — engine tests, run with `node --test tests/*.test.js`
