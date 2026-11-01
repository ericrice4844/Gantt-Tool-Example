/* Project shown the first time Easy Gantt opens (before anything is autosaved). */
window.EASY_GANTT_DEFAULT_PROJECT = {
  "version": 1,
  "name": "PVE Home Renovation & Move",
  "start": "2026-09-07",
  "skipWeekends": false,
  "nextId": 48,
  "tasks": [
    {
      "id": 1,
      "name": "Purchase & Planning",
      "level": 0,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 2,
      "name": "Inspection & Architect",
      "level": 1,
      "duration": 0,
      "snet": "2026-09-08",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Scheduled",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 3,
      "name": "HOA meeting",
      "level": 1,
      "duration": 0,
      "snet": "2026-09-09",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Scheduled",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 4,
      "name": "Close house purchase",
      "level": 1,
      "duration": 0,
      "snet": "2026-09-21",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 2,
          "type": "FS",
          "lag": 0
        }
      ]
    },
    {
      "id": 5,
      "name": "Start design",
      "level": 1,
      "duration": 0,
      "snet": "2026-09-21",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 4,
          "type": "SS",
          "lag": 0
        }
      ]
    },
    {
      "id": 6,
      "name": "Tucson House",
      "level": 0,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 7,
      "name": "Clean out Tucson house",
      "level": 1,
      "duration": 5,
      "snet": "2026-09-30",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Scheduled",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 8,
      "name": "Kylie get apartment",
      "level": 1,
      "duration": 1,
      "snet": "2026-09-30",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 9,
      "name": "Move out of Tucson house",
      "level": 1,
      "duration": 0,
      "snet": "2026-10-04",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 10,
      "name": "List Tucson house",
      "level": 1,
      "duration": 0,
      "snet": "2026-10-08",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Scheduled",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 11,
      "name": "Tucson house on market",
      "level": 1,
      "duration": 85,
      "snet": "2026-10-08",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 10,
          "type": "SS",
          "lag": 0
        }
      ]
    },
    {
      "id": 12,
      "name": "Sell Tucson house",
      "level": 1,
      "duration": 0,
      "snet": "2026-12-31",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 13,
      "name": "Renovation",
      "level": 0,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 14,
      "name": "Start floors, kitchen, wall painting",
      "level": 1,
      "duration": 0,
      "snet": "2026-10-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 4,
          "type": "FS",
          "lag": 0
        }
      ]
    },
    {
      "id": 15,
      "name": "Priority 1",
      "level": 1,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": [
        {
          "id": 14,
          "type": "FS",
          "lag": 0
        }
      ]
    },
    {
      "id": 16,
      "name": "Roof",
      "level": 2,
      "duration": 30,
      "snet": "2026-10-01",
      "cost": 66570,
      "hours": 0,
      "pct": 0,
      "notes": "Real quote $66,570 (estimate $50,000–$75,000). Paid by Parents. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 17,
      "name": "Irrigation repair",
      "level": 2,
      "duration": 10,
      "snet": "2026-10-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "No cost in Budget tab. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 18,
      "name": "Fiber internet availability",
      "level": 2,
      "duration": 10,
      "snet": "2026-10-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "No cost in Budget tab. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 19,
      "name": "Termite repair",
      "level": 2,
      "duration": 19,
      "snet": "2026-10-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "No cost in Budget tab (see also Pest control). Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 20,
      "name": "Front ramp drainage",
      "level": 2,
      "duration": 16,
      "snet": "2026-10-05",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "No cost in Budget tab. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 21,
      "name": "Electrical",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 21500,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Real quote $21,500 (estimate $5,000–$15,000). Our budget $15,000.",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 22,
      "name": "Foundation repair",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 10100,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Real quote $10,100 (estimate $10,100–$12,000). Pending inspection.",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 23,
      "name": "Plumbing",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 16000,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Real quote $16,000 (estimate $7,600–$21,300).",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 24,
      "name": "Water heater fix",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 2150,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Real quote $2,150.",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 25,
      "name": "Pest control",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 2000,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Mid estimate (range $1,000–$3,000).",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 26,
      "name": "Other repairs from inspection",
      "level": 2,
      "duration": 1,
      "snet": "2026-10-01",
      "cost": 3750,
      "hours": 0,
      "pct": 0,
      "notes": "Budget tab only - NOT on the Schedule tab; date is a placeholder. Mid estimate (range $2,500–$5,000). Scope TBD.",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 27,
      "name": "Priority 2",
      "level": 1,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": [
        {
          "id": 14,
          "type": "FS",
          "lag": 0
        }
      ]
    },
    {
      "id": 28,
      "name": "Raise ceiling above kitchen",
      "level": 2,
      "duration": 31,
      "snet": "2026-10-01",
      "cost": 19400,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $2,740–$27,400). Our budget $20,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 29,
      "name": "Floor replacement - 2,000 sf bamboo",
      "level": 2,
      "duration": 38,
      "snet": "2026-10-01",
      "cost": 25700,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $13,600–$39,600). Our budget $18,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 30,
      "name": "Interior painting - whole home",
      "level": 2,
      "duration": 51,
      "snet": "2026-10-01",
      "cost": 4750,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $3,000–$8,000). Our budget $5,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 31,
      "name": "Kitchen remodel",
      "level": 2,
      "duration": 52,
      "snet": "2026-10-15",
      "cost": 93180,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $41,520–$178,800). Our budget $75,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 32,
      "name": "Kitchen windows",
      "level": 2,
      "duration": 32,
      "snet": "2026-10-15",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Estimate depends on the option chosen in the Kitchen Windows tab. Our budget $1,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 33,
      "name": "Light fixtures - 5 bedrooms + sconces",
      "level": 2,
      "duration": 21,
      "snet": "2026-11-20",
      "cost": 480,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $230–$1,150). Our budget $1,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 34,
      "name": "Priority 3",
      "level": 1,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 35,
      "name": "Front landscaping",
      "level": 2,
      "duration": 37,
      "snet": "2026-10-10",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Scope TBD - no estimate yet. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 36,
      "name": "Master closet & bathroom renovation",
      "level": 2,
      "duration": 61,
      "snet": "2026-10-15",
      "cost": 45090,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $23,930–$80,280). Our budget $40,000. Budget tab lists this as Priority 2. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 37,
      "name": "Two additional bathroom updates",
      "level": 2,
      "duration": 37,
      "snet": "2026-10-20",
      "cost": 17600,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $7,000–$34,600). Our budget $12,500. Budget tab lists this as Priority 2. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 38,
      "name": "Wallpaper repair / replace",
      "level": 2,
      "duration": 20,
      "snet": "2026-11-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Scope TBD - no estimate yet. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 39,
      "name": "Interior decoration - all",
      "level": 2,
      "duration": 39,
      "snet": "2026-10-31",
      "cost": 53564,
      "hours": 0,
      "pct": 0,
      "notes": "Sum of mid estimates: furniture $35,764, art $8,020, lighting $4,550, textiles $5,230 (range $14,460–$103,039). Our budget $40,000. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 40,
      "name": "Priority 4",
      "level": 1,
      "duration": 1,
      "snet": null,
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 41,
      "name": "Fountain",
      "level": 2,
      "duration": 26,
      "snet": "2026-11-15",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Scope TBD - no estimate yet. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 42,
      "name": "Interior doors - 7-10 doors",
      "level": 2,
      "duration": 19,
      "snet": "2026-11-20",
      "cost": 4800,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $1,760–$10,640). Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 43,
      "name": "Twinkle lights",
      "level": 2,
      "duration": 12,
      "snet": "2026-12-01",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Scope TBD - no estimate yet. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 44,
      "name": "Front railing",
      "level": 2,
      "duration": 1,
      "snet": "2027-01-03",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Scope TBD - no estimate yet. Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 45,
      "name": "Exterior painting",
      "level": 2,
      "duration": 1,
      "snet": "2027-01-03",
      "cost": 8320,
      "hours": 0,
      "pct": 0,
      "notes": "Mid estimate (range $4,200–$11,920). Status: Not Started",
      "collapsed": false,
      "preds": []
    },
    {
      "id": 46,
      "name": "Exterior work done, interior structure updated",
      "level": 1,
      "duration": 0,
      "snet": "2026-10-31",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 16,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 17,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 19,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 20,
          "type": "FS",
          "lag": 0
        }
      ]
    },
    {
      "id": 47,
      "name": "Move in",
      "level": 1,
      "duration": 0,
      "snet": "2026-12-15",
      "cost": 0,
      "hours": 0,
      "pct": 0,
      "notes": "Status: Not Started",
      "collapsed": false,
      "preds": [
        {
          "id": 31,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 29,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 30,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 36,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 37,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 33,
          "type": "FS",
          "lag": 0
        },
        {
          "id": 42,
          "type": "FS",
          "lag": 0
        }
      ]
    }
  ]
};
