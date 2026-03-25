import { ipcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { Connection } from '../../src/types'
import { normalizeConnection, normalizeConnections } from './connection-utils'
import { testConnection, listDatabases } from './adapters/dispatch'

interface StoreSchema {
  connections: Connection[]
}

const store = new Store<StoreSchema>({
  name: 'connections',
  defaults: { connections: [] }
})

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', () => {
    const list = store.get('connections', [])
    return normalizeConnections(list)
  })

  ipcMain.handle('connections:add', (_event, conn: Omit<Connection, 'id'>) => {
    const connections = store.get('connections', [])
    const normalized = normalizeConnection({ ...conn, id: '' } as Connection)
    const newConn: Connection = { ...normalized, id: randomUUID() }
    connections.push(newConn)
    store.set('connections', connections)
    return newConn
  })

  ipcMain.handle('connections:update', (_event, conn: Connection) => {
    const connections = store.get('connections', [])
    const idx = connections.findIndex((c) => c.id === conn.id)
    if (idx === -1) throw new Error('连接不存在')
    const normalized = normalizeConnection(conn)
    connections[idx] = normalized
    store.set('connections', connections)
    return normalized
  })

  ipcMain.handle('connections:delete', (_event, id: string) => {
    const connections = store.get('connections', [])
    store.set(
      'connections',
      connections.filter((c) => c.id !== id)
    )
    return true
  })

  ipcMain.handle('connections:test', async (_event, conn: Omit<Connection, 'id'>) => {
    const normalized = normalizeConnection({ ...conn, id: 'temp' } as Connection)
    return testConnection(normalized)
  })

  ipcMain.handle('schema:databases', async (_event, connId: string) => {
    const connections = store.get('connections', [])
    const conn = connections.find((c) => c.id === connId)
    if (!conn) throw new Error('连接不存在')
    const normalized = normalizeConnection(conn)
    return listDatabases(normalized)
  })
}
