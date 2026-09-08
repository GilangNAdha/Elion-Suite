// ---------------------------------------------------------------------------
// Elion Suite — shared domain model (the "Merge Matrix" types, §7)
// One item model, one page/block model. Every surface reads these.
// ---------------------------------------------------------------------------

export type ItemType = 'epic' | 'story' | 'task' | 'subtask' | 'habit'
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest'

export interface RecurrenceRule {
  freq: 'daily' | 'weekdays' | 'weekly'
  days?: number[] // 0=Sun..6=Sat, for weekly
  time?: string // "HH:mm"
}

export type PropertyType =
  | 'select'
  | 'multiSelect'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'person'
  | 'url'
  | 'relation'
  | 'rollup'

export interface PropertyDef {
  id: string
  name: string
  type: PropertyType
  options?: string[]
  relationDbId?: string
  rollup?: { dbId: string; field: string; op: 'sum' | 'count' | 'avg' | 'min' | 'max' }
}

export interface WorkspaceItem {
  id: string
  type: ItemType
  title: string
  description: string
  status: string
  priority: Priority
  assignee?: string
  labels: string[]
  parentId?: string
  databaseId: string | null // null = "outside any project" → Tasks page
  sprintId?: string
  storyPoints?: number
  startDate?: string
  dueDate?: string
  recurrence?: RecurrenceRule
  completions?: string[] // ISO dates (habits)
  customFields: Record<string, unknown>
  rank: number
  createdAt: string
  updatedAt: string
  cover?: string
}

export type ViewKind = 'table' | 'board' | 'calendar' | 'timeline' | 'gallery' | 'list'

export interface ViewDef {
  id: string
  name: string
  kind: ViewKind
  visibleProperties: string[]
  swimlane?: 'none' | 'assignee' | 'epic'
  wipLimit?: number
  sprintOnly?: boolean
}

export interface StatusDef {
  id: string
  name: string
  color: string
  isDone?: boolean
  isBacklog?: boolean
}

export type AutomationAction =
  | { kind: 'set-priority'; value: Priority }
  | { kind: 'add-label'; value: string }
  | { kind: 'set-due-days'; value: number }
  | { kind: 'notify'; value: string }

export interface Automation {
  id: string
  onStatus: string
  actions: AutomationAction[]
}

export interface WorkspaceDatabase {
  id: string
  pageId: string
  name: string
  properties: PropertyDef[]
  statuses: StatusDef[]
  views: ViewDef[]
  automations: Automation[]
  defaultType: ItemType
}

export interface Sprint {
  id: string
  databaseId: string
  name: string
  start: string
  end: string
  goal?: string
}

export interface StatusEvent {
  id: string
  itemId: string
  from: string
  to: string
  at: string
}

// ---------------- Pages / blocks ----------------

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'code'
  | 'callout'
  | 'divider'
  | 'image'
  | 'gallery'
  | 'columns'
  | 'database'
  | 'text'
  | 'shape'
  | 'arrow'
  | 'pen'
  | 'frame'
  | 'edge'
  | 'duel'

export interface EdgelessPos {
  x: number
  y: number
  w: number
  h: number
}

export interface Block {
  id: string
  type: BlockType
  content: string
  parentId: string | null
  order: number
  checked?: boolean
  props: Record<string, unknown>
  pos?: EdgelessPos
}

export interface BlockSuiteState {
  version: 1
  update: string // base64-encoded Yjs state; media lives in the shared blob table
  projectionDirty: boolean
}

export interface PageRecord {
  id: string
  parentId: string | null
  title: string
  icon: string
  branch: 'workspace' | 'personal' // personal = Notes (§7)
  blocks: Block[]
  databaseId: string | null
  native?: BlockSuiteState
  editorMode?: 'page' | 'edgeless'
  favorite?: boolean
  createdAt: string
  updatedAt: string
}

export interface PageSnapshot {
  id: string
  pageId: string
  title: string
  takenAt: string
  label: string
  auto: boolean
  blocks: Block[]
  native?: BlockSuiteState
}

export interface Template {
  id: string
  name: string
  kind: 'page' | 'database'
  payload: { title?: string; blocks?: Block[]; database?: Omit<WorkspaceDatabase, 'id' | 'pageId'> }
  createdAt: string
}

export interface BlockComment {
  id: string
  pageId: string
  blockId: string
  author: string
  text: string
  mentions: string[]
  at: string
}

// ---------------- Calendar ----------------

export interface CalEvent {
  id: string
  title: string
  at: string
  color?: string
}

// ---------------- Notifications & alarms ----------------

export type NotificationKind = 'task-due' | 'mention' | 'habit' | 'alarm' | 'system'

export interface NotificationRecord {
  id: string
  kind: NotificationKind
  title: string
  body: string
  at: string
  read: boolean
  link?: string
}

export interface Alarm {
  id: string
  title: string
  at: string // ISO datetime
  repeat: 'none' | 'daily' | 'weekly'
  enabled: boolean
  lastFired?: string
}

// ---------------- Lockdown ----------------

export interface SoundscapeMix {
  layers: Record<string, number> // layerId -> volume 0..1
}

export interface PomodoroConfig {
  workMin: number
  breakMin: number
  goalCycles: number
}

export type WallpaperTier = 'static' | 'video' | 'scene3d'
export type Scene3DKind = 'particles' | 'gradient' | 'orbit'

export interface WallpaperConfig {
  tier: WallpaperTier
  blobId?: string
  scene?: Scene3DKind
  videoMuted?: boolean
  builtin?: 'nocturne' | 'forest'
}

export type WidgetId = 'clock' | 'timer' | 'music' | 'notes' | 'pet' | 'weather'

export interface WidgetInstance {
  id: string
  type: WidgetId
  x: number
  y: number
  w: number
  h: number
  props?: Record<string, unknown>
}

export interface LockdownPreset {
  id: string
  name: string
  wallpaper: WallpaperConfig
  ambientEmbedUrl?: string
  soundscape: SoundscapeMix
  pomodoro: PomodoroConfig
  widgets: WidgetInstance[]
  layout?: 'centered' | 'free'
  themeOverride?: string
  createdAt: string
  updatedAt: string
}

export interface FocusSession {
  id: string
  presetId: string
  presetName: string
  objective: string
  start: string
  end: string
  interruptions: number
  cyclesCompleted: number
}

// ---------------- Saved filters (visual query builder, §9.3) ----------------

export interface FilterPredicate {
  id: string
  field: string
  op: string
  value: string
}

export interface FilterNode {
  op: 'and' | 'or'
  children: (FilterPredicate | FilterNode)[]
}

export function isPredicate(n: FilterPredicate | FilterNode): n is FilterPredicate {
  return 'field' in n
}

export interface SavedFilter {
  id: string
  name: string
  databaseId: string | null
  query: FilterNode
  createdAt: string
}

// ---------------- Theme ----------------

export type Harmony = 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'monochromatic'

export interface AuroraTheme {
  id: string
  name: string
  seed: { h: number; s: number; l: number }
  harmony: Harmony
  mode: 'dark' | 'light'
  density: 'compact' | 'comfortable' | 'spacious'
  radius: number // px
  glass: number // 0..100
}

// ---------------- Misc ----------------

export interface PetMoodState {
  mood: 'idle' | 'focused' | 'happy' | 'tired' | 'worried'
  since: string
}

export interface MusicTrack {
  id: string
  name: string
  src: string
  kind: 'file' | 'youtube'
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
