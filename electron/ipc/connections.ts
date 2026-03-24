import { ipcMain } from 'electron'
import Store from 'electron-store'
import { createConnection } from 'mysql2/promise'
import { randomUUID } from 'crypto'
import type { Connection } from '../../src/types'

interface StoreSchema {
  connections: Connection[]
}

const store = new Store<StoreSchema>({
  name: 'connections',
  defaults: { connections: [] }
})

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', () => {
    return store.get('connections', [])
  })

  ipcMain.handle('connections:add', (_event, conn: Omit<Connection, 'id'>) => {
    const connections = store.get('connections', [])
    const newConn: Connection = { ...conn, id: randomUUID() }
    connections.push(newConn)
    store.set('connections', connections)
    return newConn
  })

  ipcMain.handle('connections:update', (_event, conn: Connection) => {
    const connections = store.get('connections', [])
    const idx = connections.findIndex((c) => c.id === conn.id)
    if (idx === -1) throw new Error('连接不存在')
    connections[idx] = conn
    store.set('connections', connections)
    return conn
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
    let connection
    try {
      connection = await createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        connectTimeout: 10000
      })
      await connection.ping()
      return { success: true, message: '连接成功' }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '连接失败'
      return { success: false, message }
    } finally {
      if (connection) {
        try {
          await connection.end()
        } catch {
          // ignore
        }
      }
    }
  })

  ipcMain.handle('schema:databases', async (_event, connId: string) => {
    const connections = store.get('connections', [])
    const conn = connections.find((c) => c.id === connId)
    if (!conn) throw new Error('连接不存在')

    let connection
    try {
      connection = await createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        connectTimeout: 10000
      })
      const [rows] = await connection.execute<{ Database: string }[]>(
        "SHOW DATABASES WHERE `Database` NOT IN ('information_schema','performance_schema','mysql','sys')"
      )
      return (rows as { Database: string }[]).map((r) => r.Database)
    } finally {
      if (connection) {
        try {
          await connection.end()
        } catch {
          // ignore
        }
      }
    }
  })
}
