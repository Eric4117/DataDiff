import { ipcMain } from 'electron'
import Store from 'electron-store'
import type {
  Connection,
  CompareTarget,
  ColumnInfo,
  IndexInfo,
  TableMeta,
  ForeignKeyInfo
} from '../../src/types'
import { normalizeConnection } from './connection-utils'
import { fetchSchema } from './adapters/dispatch'
import type { TableSchemaPayload } from './adapters/types'
import { compareTables, buildSummary } from './schema-diff'
import { autoAuditDatabase } from './audit'

interface StoreSchema {
  connections: Connection[]
}

const store = new Store<StoreSchema>({
  name: 'connections',
  defaults: { connections: [] }
})

export async function fetchSchemaForConn(
  connId: string,
  database: string
): Promise<Map<string, TableSchemaPayload>> {
  const connections = store.get('connections', [])
  const conn = connections.find((c) => c.id === connId)
  if (!conn) throw new Error('连接不存在')
  const normalized = normalizeConnection(conn)
  return fetchSchema(normalized, database)
}

export function registerSchemaHandlers(): void {
  ipcMain.handle('schema:structure', async (event, connId: string, database: string) => {
    const map = await fetchSchemaForConn(connId, database)

    // 异步自动审计，不阻塞响应
    autoAuditDatabase(event.sender, connId, database, map).catch(() => {})

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

  ipcMain.handle('schema:compare', async (event, left: CompareTarget, right: CompareTarget) => {
    const [leftMap, rightMap] = await Promise.all([
      fetchSchemaForConn(left.connectionId, left.database),
      fetchSchemaForConn(right.connectionId, right.database)
    ])

    // 去重：相同库只审计一次
    type AuditTarget = { connId: string; db: string; map: Map<string, TableSchemaPayload> }
    const targets = new Map<string, AuditTarget>()
    targets.set(`${left.connectionId}:${left.database}`, {
      connId: left.connectionId,
      db: left.database,
      map: leftMap
    })
    const rightKey = `${right.connectionId}:${right.database}`
    if (!targets.has(rightKey)) {
      targets.set(rightKey, { connId: right.connectionId, db: right.database, map: rightMap })
    }
    for (const { connId, db, map } of targets.values()) {
      autoAuditDatabase(event.sender, connId, db, map).catch(() => {})
    }

    const tables = compareTables(leftMap, rightMap)
    const summary = buildSummary(tables)

    return { tables, summary }
  })
}
