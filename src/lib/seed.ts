// First-run sample data so the app feels alive; guarded by a flag so it runs
// exactly once per install.

import { db } from './db'
import type { PageRecord, WorkspaceItem, FocusSession } from './types'
import { uid } from './types'
import { toISODate, addDays } from './time'

export async function seedIfEmpty(): Promise<void> {
  if (localStorage.getItem('elion-seeded-v1')) return
  const pageCount = await db.pages.count()
  if (pageCount > 0) {
    localStorage.setItem('elion-seeded-v1', '1')
    return
  }

  const now = new Date().toISOString()
  const b = (type: string, content: string, order: number, extra?: Partial<import('./types').Block>) => ({
    id: uid(),
    type: type as never,
    content,
    parentId: null,
    order,
    props: {},
    ...extra
  })

  const wsWelcome: PageRecord = {
    id: uid(),
    parentId: null,
    title: 'Welcome to Elion',
    icon: 'file-text',
    branch: 'workspace',
    databaseId: null,
    createdAt: now,
    updatedAt: now,
    blocks: [
      b('heading1', 'Welcome to Elion', 1),
      b('paragraph', 'A local-first productivity suite: Workspace (blocks + databases), Lockdown (focus sessions), tasks, habits, notes, calendar — all on one device, no cloud.', 2),
      b('heading2', 'Try the flagship editor', 3),
      b('paragraph', 'Press “Edit full-screen” on any page. Drag a block chip from the left library onto the canvas to insert, drop it onto an existing block to convert it in place, or drop it on a block’s edge to compose columns. Ctrl+K opens the command palette; the History panel lists every action in plain language.', 4),
      b('heading2', 'Lockdown', 5),
      b('paragraph', 'Full-screen focus with wallpaper (static / video / 3D), a soundscape mixer, Pomodoro cycles, and session analytics. The distraction guard is a soft nudge — by design.', 6),
      b('callout', 'Everything you see (pages, items, presets, snapshots) lives in IndexedDB on this device. See [[Project Aurora]] for the item model in action.', 7),
      b('paragraph', 'Links like [[Project Aurora]] are cross-page links; each page has a Backlinks panel.', 8)
    ]
  }

  const projectPage: PageRecord = {
    id: uid(),
    parentId: null,
    title: 'Project Aurora',
    icon: 'target',
    branch: 'workspace',
    databaseId: null,
    createdAt: now,
    updatedAt: now,
    blocks: [
      b('heading1', 'Project Aurora', 1),
      b('paragraph', 'Sample project database (Jira-style tracking over the shared item model).', 2),
      b('paragraph', 'The database below is a block — edit it full-screen to add items, views, workflows, sprints, and automations.', 3)
    ]
  }

  const personalRoot: PageRecord = {
    id: uid(),
    parentId: null,
    title: 'Scratchpad',
    icon: 'star',
    branch: 'personal',
    databaseId: null,
    createdAt: now,
    updatedAt: now,
    blocks: [
      b('heading1', 'Scratchpad', 1),
      b('paragraph', 'Your quick notes. Edited here, on the Notes page, or inside a Lockdown widget — same record, live-synced.', 2),
      b('todo', 'Check the immersive editor’s drag-to-replace', 3, { checked: false }),
      b('todo', 'Start a Lockdown session with the soundscape on', 4, { checked: false }),
      b('todo', 'Review the burndown chart in Project Aurora', 5, { checked: true })
    ]
  }

  const weekly: PageRecord = {
    id: uid(),
    parentId: null,
    title: 'Weekly review',
    icon: 'compass',
    branch: 'personal',
    databaseId: null,
    createdAt: now,
    updatedAt: now,
    blocks: [
      b('heading1', 'Weekly review', 1),
      b('bullet', 'What shipped?', 2),
      b('bullet', 'What slipped?', 3),
      b('bullet', 'Next week’s one big thing:', 4)
    ]
  }

  await db.pages.bulkAdd([wsWelcome, projectPage, personalRoot, weekly])

  // ---- sample database on the Project Aurora page ----
  const dbId = uid()
  const statuses = [
    { id: 'backlog', name: 'Backlog', color: 'var(--ink-faint)', isBacklog: true },
    { id: 'todo', name: 'To do', color: 'var(--info)' },
    { id: 'doing', name: 'In progress', color: 'var(--warn)' },
    { id: 'done', name: 'Done', color: 'var(--ok)', isDone: true }
  ]
  const properties = [
    { id: uid(), name: 'Area', type: 'select' as const, options: ['Frontend', 'Backend', 'Design'] },
    { id: uid(), name: 'Blocked', type: 'checkbox' as const }
  ]
  await db.databases.add({
    id: dbId,
    pageId: projectPage.id,
    name: 'Project Aurora',
    properties,
    statuses,
    views: [
      { id: uid(), name: 'Board', kind: 'board', visibleProperties: ['title', 'status', 'priority'], swimlane: 'none', wipLimit: 3 },
      { id: uid(), name: 'Table', kind: 'table', visibleProperties: ['title', 'status', 'priority', 'dueDate'] },
      { id: uid(), name: 'Timeline', kind: 'timeline', visibleProperties: ['title'] },
      { id: uid(), name: 'Calendar', kind: 'calendar', visibleProperties: ['title'] }
    ],
    automations: [
      { id: uid(), onStatus: 'doing', actions: [{ kind: 'notify', value: 'A story moved to In progress' }] }
    ],
    defaultType: 'task'
  })
  // host the database as a block on the page
  const dbBlockId = uid()
  const pageWithDb = {
    ...projectPage,
    blocks: [...projectPage.blocks, { id: dbBlockId, type: 'database' as const, content: '', parentId: null, order: 4, props: { dbId } }]
  }
  await db.pages.put(pageWithDb)

  // ---- sprint ----
  const sprintId = uid()
  const sStart = toISODate(addDays(new Date(), -5))
  const sEnd = toISODate(addDays(new Date(), 8))
  await db.sprints.add({ id: sprintId, databaseId: dbId, name: 'Sprint 1', start: sStart, end: sEnd, goal: 'Ship the editor shell' })

  // ---- items ----
  const mk = (p: Partial<WorkspaceItem> & { title: string; rank: number; status: string }): WorkspaceItem => ({
    id: uid(),
    type: 'task',
    description: '',
    priority: 'medium',
    labels: [],
    databaseId: dbId,
    customFields: {},
    createdAt: now,
    updatedAt: now,
    ...p
  })
  const epic = mk({ title: 'Epic: Immersive editor', type: 'epic', status: 'doing', priority: 'high', rank: 1000, storyPoints: 13, labels: ['editor'] })
  const story1 = mk({ title: 'Drag-to-replace with content preservation', type: 'story', status: 'doing', priority: 'highest', rank: 2000, storyPoints: 8, parentId: epic.id, sprintId, dueDate: toISODate(addDays(new Date(), 3)), labels: ['editor', 'dnd'] })
  const story2 = mk({ title: 'Visible history stack + Time Machine', type: 'story', status: 'todo', priority: 'high', rank: 3000, storyPoints: 8, parentId: epic.id, sprintId, dueDate: toISODate(addDays(new Date(), 6)), labels: ['editor'] })
  const story3 = mk({ title: 'Edgeless canvas tools (pen, arrows)', type: 'story', status: 'todo', priority: 'medium', rank: 4000, storyPoints: 5, parentId: epic.id, sprintId, labels: ['canvas'] })
  const t1 = mk({ title: 'Soundscape mixer in Lockdown', status: 'done', priority: 'medium', rank: 5000, storyPoints: 5, sprintId, labels: ['lockdown'] })
  const t2 = mk({ title: 'Pomodoro cycle counter + cues', status: 'done', priority: 'medium', rank: 6000, storyPoints: 3, sprintId, labels: ['lockdown'] })
  const t3 = mk({ title: 'Theme contrast auto-correction', status: 'doing', priority: 'high', rank: 7000, storyPoints: 3, sprintId, dueDate: toISODate(addDays(new Date(), 1)), labels: ['theming'] })
  const t4 = mk({ title: 'Offline STT dictation (Whisper WASM)', status: 'backlog', priority: 'high', rank: 8000, storyPoints: 8, labels: ['stt'] })
  const t5 = mk({ title: 'Cumulative flow report', status: 'backlog', priority: 'low', rank: 9000, storyPoints: 3, labels: ['reports'] })

  const unassigned: WorkspaceItem[] = [
    mk({ title: 'Book dentist appointment', status: 'todo', priority: 'medium', rank: 1000, databaseId: null, dueDate: toISODate(addDays(new Date(), 1)), labels: ['personal'] }),
    mk({ title: 'Prepare Q4 proposal outline', status: 'doing', priority: 'high', rank: 2000, databaseId: null, dueDate: toISODate(addDays(new Date(), 4)), labels: ['work'] }),
    mk({ title: 'Water the plants', status: 'todo', priority: 'lowest', rank: 3000, databaseId: null, labels: ['home'] }),
    mk({ title: 'Read 30 pages of “Deep Work”', status: 'done', priority: 'low', rank: 4000, databaseId: null, labels: ['reading'] })
  ]

  const habits: WorkspaceItem[] = [
    mk({ title: 'Read 20 pages', type: 'habit', status: 'todo', rank: 1000, databaseId: null, recurrence: { freq: 'daily' }, completions: [toISODate(addDays(new Date(), -1)), toISODate(addDays(new Date(), -2)), toISODate(addDays(new Date(), -3))] }),
    mk({ title: 'Exercise 30 min', type: 'habit', status: 'todo', rank: 2000, databaseId: null, recurrence: { freq: 'weekdays' }, completions: [toISODate(addDays(new Date(), -1))] }),
    mk({ title: 'Weekly meal prep', type: 'habit', status: 'todo', rank: 3000, databaseId: null, recurrence: { freq: 'weekly', days: [5] }, completions: [] })
  ]

  await db.items.bulkAdd([epic, story1, story2, story3, t1, t2, t3, t4, t5, ...unassigned, ...habits])

  // sample status history (drives burndown / velocity / cumulative flow)
  const events: import('./types').StatusEvent[] = []
  const push = (itemId: string, from: string, to: string, daysAgo: number) => {
    events.push({ id: uid(), itemId, from, to, at: new Date(Date.now() - daysAgo * 86400000).toISOString() })
  }
  push(t1.id, 'todo', 'doing', 4)
  push(t1.id, 'doing', 'done', 3)
  push(t2.id, 'todo', 'doing', 4)
  push(t2.id, 'doing', 'done', 2)
  push(story1.id, 'todo', 'doing', 2)
  push(t3.id, 'todo', 'doing', 1)
  await db.statusHistory.bulkAdd(events)

  // ---- lockdown preset ----
  const presetId = uid()
  await db.lockdownPresets.add({
    id: presetId,
    name: 'Deep Work',
    wallpaper: { tier: 'scene3d', scene: 'particles' },
    soundscape: { layers: { rain: 0.5, fire: 0, white: 0, cafe: 0.3, wind: 0 } },
    pomodoro: { workMin: 25, breakMin: 5, goalCycles: 4 },
    widgets: [
      { id: uid(), type: 'clock', x: 72, y: 72, w: 230, h: 120 },
      { id: uid(), type: 'timer', x: 340, y: 72, w: 280, h: 220 },
      { id: uid(), type: 'notes', x: 72, y: 240, w: 300, h: 260 },
      { id: uid(), type: 'pet', x: 410, y: 330, w: 180, h: 170 }
    ],
    createdAt: now,
    updatedAt: now
  })
  await db.lockdownPresets.add({
    id: uid(),
    name: 'Café Focus',
    wallpaper: { tier: 'static' },
    soundscape: { layers: { rain: 0, fire: 0, white: 0, cafe: 0.7, wind: 0.1 } },
    pomodoro: { workMin: 50, breakMin: 10, goalCycles: 2 },
    widgets: [
      { id: uid(), type: 'timer', x: 90, y: 90, w: 280, h: 220 },
      { id: uid(), type: 'music', x: 420, y: 90, w: 280, h: 130 }
    ],
    createdAt: now,
    updatedAt: now
  })

  // a sample focus session (yesterday) so analytics have data
  const yStart = new Date(Date.now() - 86400000)
  const yEnd = new Date(yStart.getTime() + 47 * 60000)
  await db.lockdownSessions.add({
    id: uid(),
    presetId,
    presetName: 'Deep Work',
    objective: 'Draft the editor history spec',
    start: yStart.toISOString(),
    end: yEnd.toISOString(),
    interruptions: 1,
    cyclesCompleted: 2
  } as FocusSession)

  // a manual calendar event
  await db.events.add({
    id: uid(),
    title: 'Team sync (sample event)',
    at: new Date(Date.now() + 2 * 86400000).toISOString()
  })

  // mark seeded only after every write succeeded (a failed partial seed can
  // retry on next launch instead of being silently skipped forever)
  localStorage.setItem('elion-seeded-v1', '1')
}
