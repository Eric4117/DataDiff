import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { SchemaSnapshot, AuditRecord, TableStructure } from '../../src/types'
import type { TableSchemaPayload } from './adapters/types'
import { fetchSchemaForConn } from './schema'
import { compareTables, buildSummary } from './schema-diff'

// ─── 持久化存储 ───────────────────────────────────────────

interface SnapshotStore {
  snapshots: SchemaSnapshot[]
}

interface RecordStore {
  records: AuditRecord[]
}

const snapshotStore = new Store<SnapshotStore>({
  name: 'audit-snapshots',
  defaults: { snapshots: [] }
})

const recordStore = new Store<RecordStore>({
  name: 'audit-records',
  defaults: { records: [] }
})

// ─── 工具函数 ─────────────────────────────────────────────

function snapshotToMap(tables: TableStructure[]): Map<string, TableSchemaPayload> {
  return new Map(
    tables.map((t) => [
      t.name,
      {
        columns: t.columns,
        indexes: t.indexes,
        meta: t.meta,
        foreignKeys: t.foreignKeys
      }
    ])
  )
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ─── IPC handlers ─────────────────────────────────────────

export function registerAuditHandlers(): void {
  // 保存当前库结构为快照
  ipcMain.handle(
    'audit:snapshot-save',
    async (_event, connId: string, database: string, name?: string) => {
      const schemaMap = await fetchSchemaForConn(connId, database)
      const tables: TableStructure[] = []
      for (const [tableName, schema] of schemaMap) {
        tables.push({ name: tableName, ...schema })
      }
      tables.sort((a, b) => a.name.localeCompare(b.name))

      const now = Date.now()
      const snapshot: SchemaSnapshot = {
        id: randomUUID(),
        name: name ?? `${database} ${formatDateTime(now)}`,
        connectionId: connId,
        database,
        tables,
        createdAt: now
      }

      const snapshots = snapshotStore.get('snapshots', [])
      snapshotStore.set('snapshots', [snapshot, ...snapshots])
      return snapshot
    }
  )

  // 列出所有快照（不含 tables，只传元数据）
  ipcMain.handle('audit:snapshot-list', () => {
    const snapshots = snapshotStore.get('snapshots', [])
    return snapshots.map(({ id, name, connectionId, database, createdAt }) => ({
      id,
      name,
      connectionId,
      database,
      createdAt,
      tables: []
    }))
  })

  // 删除快照及其关联审计记录
  ipcMain.handle('audit:snapshot-delete', (_event, id: string) => {
    const snapshots = snapshotStore.get('snapshots', [])
    snapshotStore.set('snapshots', snapshots.filter((s) => s.id !== id))

    const records = recordStore.get('records', [])
    recordStore.set('records', records.filter((r) => r.snapshotId !== id))
    return true
  })

  // 基于快照与当前库对比生成审计记录
  ipcMain.handle('audit:generate', async (_event, snapshotId: string, name?: string) => {
    const snapshots = snapshotStore.get('snapshots', [])
    const snapshot = snapshots.find((s) => s.id === snapshotId)
    if (!snapshot) throw new Error('快照不存在')

    const currentMap = await fetchSchemaForConn(snapshot.connectionId, snapshot.database)
    const snapshotMap = snapshotToMap(snapshot.tables)

    // 快照为左（基线），当前为右（最新）
    const tables = compareTables(snapshotMap, currentMap)
    const summary = buildSummary(tables)

    const now = Date.now()
    const record: AuditRecord = {
      id: randomUUID(),
      name: name ?? `${snapshot.name} → ${formatDateTime(now)}`,
      snapshotId,
      snapshotName: snapshot.name,
      connectionId: snapshot.connectionId,
      database: snapshot.database,
      createdAt: now,
      diff: { tables, summary }
    }

    const records = recordStore.get('records', [])
    recordStore.set('records', [record, ...records])
    return record
  })

  // 列出所有审计记录（不含 diff.tables 详情，只含 summary）
  ipcMain.handle('audit:record-list', () => {
    const records = recordStore.get('records', [])
    return records.map(({ id, name, snapshotId, snapshotName, connectionId, database, createdAt, diff }) => ({
      id,
      name,
      snapshotId,
      snapshotName,
      connectionId,
      database,
      createdAt,
      diff: { tables: [], summary: diff.summary }
    }))
  })

  // 获取完整审计记录（含 diff）
  ipcMain.handle('audit:record-get', (_event, id: string) => {
    const records = recordStore.get('records', [])
    const record = records.find((r) => r.id === id)
    if (!record) throw new Error('审计记录不存在')
    return record
  })

  // 删除审计记录
  ipcMain.handle('audit:record-delete', (_event, id: string) => {
    const records = recordStore.get('records', [])
    recordStore.set('records', records.filter((r) => r.id !== id))
    return true
  })
}

// ─── 自动审计（schema 加载时触发，fire-and-forget） ────────

export async function autoAuditDatabase(
  sender: WebContents,
  connId: string,
  database: string,
  currentMap: Map<string, TableSchemaPayload>
): Promise<void> {
  const snapshots = snapshotStore.get('snapshots', [])
  // 找该库最新快照（已按 createdAt 倒序存储）
  const latest = snapshots.find((s) => s.connectionId === connId && s.database === database)

  const tables: TableStructure[] = [...currentMap.entries()]
    .map(([name, schema]) => ({ name, ...schema }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const now = Date.now()
  const newSnapshot: SchemaSnapshot = {
    id: randomUUID(),
    name: `${database} ${formatDateTime(now)}`,
    connectionId: connId,
    database,
    tables,
    createdAt: now
  }

  if (!latest) {
    // 首次：仅存基线快照，不生成报告
    snapshotStore.set('snapshots', [newSnapshot, ...snapshots])
    return
  }

  const snapshotMap = snapshotToMap(latest.tables)
  const diffTables = compareTables(snapshotMap, currentMap)
  const summary = buildSummary(diffTables)
  const hasChanges = summary.leftOnly + summary.rightOnly + summary.modified > 0
  if (!hasChanges) return

  // 有变更：存新快照 + 审计记录
  snapshotStore.set('snapshots', [newSnapshot, ...snapshots])
  const record: AuditRecord = {
    id: randomUUID(),
    name: `${latest.name} → ${formatDateTime(now)}`,
    snapshotId: newSnapshot.id,
    snapshotName: newSnapshot.name,
    connectionId: connId,
    database,
    createdAt: now,
    diff: { tables: diffTables, summary }
  }
  const records = recordStore.get('records', [])
  recordStore.set('records', [record, ...records])

  // 推送轻量通知到渲染进程（不含 diff.tables）
  if (!sender.isDestroyed()) {
    sender.send('audit:auto-created', {
      database,
      summary,
      recordId: record.id,
      recordName: record.name
    })
  }
}
