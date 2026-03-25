import { ipcMain } from 'electron'
import Store from 'electron-store'
import type {
  Connection,
  CompareTarget,
  TableDiff,
  ColumnDiff,
  ColumnInfo,
  IndexInfo,
  IndexDiff,
  TableMeta,
  TableMetaDiff,
  ForeignKeyInfo
} from '../../src/types'
import { normalizeConnection } from './connection-utils'
import { fetchSchema } from './adapters/dispatch'
import type { TableSchemaPayload } from './adapters/types'

interface StoreSchema {
  connections: Connection[]
}

const store = new Store<StoreSchema>({
  name: 'connections',
  defaults: { connections: [] }
})

async function fetchSchemaForConn(
  connId: string,
  database: string
): Promise<Map<string, TableSchemaPayload>> {
  const connections = store.get('connections', [])
  const conn = connections.find((c) => c.id === connId)
  if (!conn) throw new Error('连接不存在')
  const normalized = normalizeConnection(conn)
  return fetchSchema(normalized, database)
}

// ─── 字段对比 ─────────────────────────────────────────────

const COLUMN_COMPARE_FIELDS: { key: keyof ColumnInfo; label: string }[] = [
  { key: 'type', label: '类型' },
  { key: 'nullable', label: '可空' },
  { key: 'key', label: '键' },
  { key: 'default', label: '默认值' },
  { key: 'extra', label: 'Extra' },
  { key: 'comment', label: '注释' },
  { key: 'charset', label: '字符集' },
  { key: 'collation', label: '排序规则' }
]

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'YES' : 'NO'
  return String(v)
}

function compareColumns(
  leftCols: ColumnInfo[],
  rightCols: ColumnInfo[]
): { diffs: ColumnDiff[]; orderChanged: boolean } {
  const leftMap = new Map(leftCols.map((c) => [c.name, c]))
  const rightMap = new Map(rightCols.map((c) => [c.name, c]))

  const leftPosMap = new Map(leftCols.map((c) => [c.name, c.ordinalPosition]))
  const rightPosMap = new Map(rightCols.map((c) => [c.name, c.ordinalPosition]))

  const sharedNames = leftCols.filter((c) => rightMap.has(c.name)).map((c) => c.name)
  const sharedRightOrder = sharedNames.slice().sort((a, b) => rightPosMap.get(a)! - rightPosMap.get(b)!)
  const hasOrderChange = sharedNames.some((n, i) => n !== sharedRightOrder[i])

  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const diffs: ColumnDiff[] = []

  for (const name of allNames) {
    const left = leftMap.get(name) ?? null
    const right = rightMap.get(name) ?? null

    if (!left) {
      diffs.push({ name, status: 'right_only', left: null, right, orderChanged: false, changedFields: [] })
    } else if (!right) {
      diffs.push({ name, status: 'left_only', left, right: null, orderChanged: false, changedFields: [] })
    } else {
      const changedFields: string[] = []
      for (const { key, label } of COLUMN_COMPARE_FIELDS) {
        if (normalizeValue(left[key]) !== normalizeValue(right[key])) {
          changedFields.push(label)
        }
      }
      const positionDiffers = left.ordinalPosition !== right.ordinalPosition

      const isModified = changedFields.length > 0 || positionDiffers
      diffs.push({
        name,
        status: isModified ? 'modified' : 'same',
        left,
        right,
        orderChanged: positionDiffers,
        changedFields
      })
    }
  }

  diffs.sort((a, b) => {
    const aPos = leftPosMap.get(a.name) ?? (rightPosMap.get(a.name)! + 90000)
    const bPos = leftPosMap.get(b.name) ?? (rightPosMap.get(b.name)! + 90000)
    return aPos - bPos
  })

  return { diffs, orderChanged: hasOrderChange }
}

// ─── 索引对比 ─────────────────────────────────────────────

function compareIndexes(leftIndexes: IndexInfo[], rightIndexes: IndexInfo[]): IndexDiff[] {
  const leftMap = new Map(leftIndexes.map((idx) => [idx.name, idx]))
  const rightMap = new Map(rightIndexes.map((idx) => [idx.name, idx]))
  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const diffs: IndexDiff[] = []

  for (const name of allNames) {
    const left = leftMap.get(name) ?? null
    const right = rightMap.get(name) ?? null

    if (!left) {
      diffs.push({ name, status: 'right_only', left: null, right, changedFields: [] })
    } else if (!right) {
      diffs.push({ name, status: 'left_only', left, right: null, changedFields: [] })
    } else {
      const changedFields: string[] = []
      if (left.columns.join(',') !== right.columns.join(',')) changedFields.push('列')
      if (left.unique !== right.unique) changedFields.push('唯一性')
      if (left.type !== right.type) changedFields.push('类型')

      diffs.push({
        name,
        status: changedFields.length > 0 ? 'modified' : 'same',
        left,
        right,
        changedFields
      })
    }
  }

  const order = { left_only: 0, right_only: 1, modified: 2, same: 3 }
  diffs.sort((a, b) => {
    const p = order[a.status] - order[b.status]
    if (p !== 0) return p
    return a.name.localeCompare(b.name)
  })

  return diffs
}

// ─── 表元信息对比 ─────────────────────────────────────────

function compareTableMeta(left: TableMeta, right: TableMeta): TableMetaDiff[] {
  const diffs: TableMetaDiff[] = []
  const fields: { key: keyof TableMeta; label: string }[] = [
    { key: 'engine', label: '存储引擎' },
    { key: 'charset', label: '字符集' },
    { key: 'collation', label: '排序规则' },
    { key: 'comment', label: '表注释' }
  ]
  for (const { key, label } of fields) {
    const lv = left[key] || ''
    const rv = right[key] || ''
    if (lv !== rv) {
      diffs.push({ field: key, label, left: lv, right: rv })
    }
  }
  return diffs
}

// ─── 表级对比 ─────────────────────────────────────────────

function compareTables(
  leftMap: Map<string, TableSchemaPayload>,
  rightMap: Map<string, TableSchemaPayload>
): TableDiff[] {
  const allTables = new Set([...leftMap.keys(), ...rightMap.keys()])
  const diffs: TableDiff[] = []

  for (const name of allTables) {
    const leftSchema = leftMap.get(name)
    const rightSchema = rightMap.get(name)

    if (!leftSchema) {
      const rs = rightSchema!
      diffs.push({
        name,
        status: 'right_only',
        orderChanged: false,
        columns: rs.columns.map((c) => ({
          name: c.name,
          status: 'right_only' as const,
          left: null,
          right: c,
          orderChanged: false,
          changedFields: []
        })),
        indexes: rs.indexes.map((idx) => ({
          name: idx.name,
          status: 'right_only' as const,
          left: null,
          right: idx,
          changedFields: []
        })),
        metaDiffs: []
      })
    } else if (!rightSchema) {
      diffs.push({
        name,
        status: 'left_only',
        orderChanged: false,
        columns: leftSchema.columns.map((c) => ({
          name: c.name,
          status: 'left_only' as const,
          left: c,
          right: null,
          orderChanged: false,
          changedFields: []
        })),
        indexes: leftSchema.indexes.map((idx) => ({
          name: idx.name,
          status: 'left_only' as const,
          left: idx,
          right: null,
          changedFields: []
        })),
        metaDiffs: []
      })
    } else {
      const { diffs: columnDiffs, orderChanged } = compareColumns(leftSchema.columns, rightSchema.columns)
      const indexDiffs = compareIndexes(leftSchema.indexes, rightSchema.indexes)
      const metaDiffs = compareTableMeta(leftSchema.meta, rightSchema.meta)

      const hasColumnDiff = columnDiffs.some((c) => c.status !== 'same')
      const hasIndexDiff = indexDiffs.some((i) => i.status !== 'same')
      const hasMetaDiff = metaDiffs.length > 0

      const isModified = hasColumnDiff || hasIndexDiff || hasMetaDiff || orderChanged

      diffs.push({
        name,
        status: isModified ? 'modified' : 'same',
        columns: columnDiffs,
        indexes: indexDiffs,
        metaDiffs,
        orderChanged
      })
    }
  }

  const order: Record<TableDiff['status'], number> = {
    left_only: 0,
    right_only: 1,
    modified: 2,
    same: 3
  }
  diffs.sort((a, b) => {
    const oPrio = order[a.status] - order[b.status]
    if (oPrio !== 0) return oPrio
    return a.name.localeCompare(b.name)
  })

  return diffs
}

export function registerSchemaHandlers(): void {
  ipcMain.handle('schema:structure', async (_event, connId: string, database: string) => {
    const map = await fetchSchemaForConn(connId, database)
    const tables: Array<{
      name: string
      columns: ColumnInfo[]
      indexes: IndexInfo[]
      meta: TableMeta
      foreignKeys: ForeignKeyInfo[]
    }> = []
    for (const [name, schema] of map) {
      tables.push({ name, ...schema })
    }
    tables.sort((a, b) => a.name.localeCompare(b.name))
    return { tables }
  })

  ipcMain.handle('schema:compare', async (_event, left: CompareTarget, right: CompareTarget) => {
    const [leftMap, rightMap] = await Promise.all([
      fetchSchemaForConn(left.connectionId, left.database),
      fetchSchemaForConn(right.connectionId, right.database)
    ])

    const tables = compareTables(leftMap, rightMap)
    const modifiedTables = tables.filter((t) => t.status === 'modified')

    const summary = {
      total: tables.length,
      same: tables.filter((t) => t.status === 'same').length,
      modified: modifiedTables.length,
      leftOnly: tables.filter((t) => t.status === 'left_only').length,
      rightOnly: tables.filter((t) => t.status === 'right_only').length,
      fieldDiff: modifiedTables.filter((t) => t.columns.some((c) => c.status !== 'same')).length,
      columnMissing: modifiedTables.filter((t) =>
        t.columns.some((c) => c.status === 'left_only' || c.status === 'right_only')
      ).length,
      typeDiff: modifiedTables.filter((t) => t.columns.some((c) => c.changedFields.includes('类型'))).length,
      charsetDiff: modifiedTables.filter(
        (t) =>
          t.columns.some((c) => c.changedFields.includes('字符集') || c.changedFields.includes('排序规则')) ||
          t.metaDiffs.some((d) => d.field === 'charset' || d.field === 'collation')
      ).length,
      indexDiff: modifiedTables.filter((t) => t.indexes.some((i) => i.status !== 'same')).length
    }

    return { tables, summary }
  })
}
