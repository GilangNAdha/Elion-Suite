import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  Alarm,
  BlockComment,
  CalEvent,
  FocusSession,
  LockdownPreset,
  NotificationRecord,
  PageRecord,
  PageSnapshot,
  SavedFilter,
  Sprint,
  StatusEvent,
  Template,
  WorkspaceDatabase,
  WorkspaceItem
} from './types'

export interface BlobRecord {
  id: string
  kind: 'wallpaper' | 'image' | 'video' | 'attachment'
  name: string
  data: Blob
}

// Tabel agent (spek §4–§6 & §37) ditambahkan lewat version(2) — skema lama
// tidak diubah, jadi database existing user ikut ter-migrate otomatis.
class ElionDB extends Dexie {
  pages!: Table<PageRecord, string>
  items!: Table<WorkspaceItem, string>
  databases!: Table<WorkspaceDatabase, string>
  sprints!: Table<Sprint, string>
  statusHistory!: Table<StatusEvent, string>
  notifications!: Table<NotificationRecord, string>
  alarms!: Table<Alarm, string>
  events!: Table<CalEvent, string>
  lockdownPresets!: Table<LockdownPreset, string>
  lockdownSessions!: Table<FocusSession, string>
  snapshots!: Table<PageSnapshot, string>
  templates!: Table<Template, string>
  comments!: Table<BlockComment, string>
  savedFilters!: Table<SavedFilter, string>
  blobs!: Table<BlobRecord, string>
  memories!: Table<import('./memory').MemoryRecord, string>
  agentEvents!: Table<import('./activity').AgentEventRecord, string>

  constructor() {
    super('elion-suite')
    this.version(1).stores({
      pages: 'id, parentId, branch, title, updatedAt',
      items: 'id, type, databaseId, status, dueDate, sprintId, parentId, title',
      databases: 'id, pageId, name',
      sprints: 'id, databaseId, start',
      statusHistory: 'id, itemId, at',
      notifications: 'id, at, read, kind',
      alarms: 'id, enabled',
      events: 'id, at',
      lockdownPresets: 'id, name',
      lockdownSessions: 'id, start, presetId',
      snapshots: 'id, pageId, takenAt',
      templates: 'id, name, kind',
      comments: 'id, pageId, blockId, at',
      savedFilters: 'id, name, databaseId',
      blobs: 'id, kind'
    })
    this.version(2).stores({
      memories: 'id, type, factKey, updatedAt, lastAccessedAt, retention, *relatedEntities',
      agentEvents: 'id, at, kind, taskId'
    })
  }
}

export const db = new ElionDB()
