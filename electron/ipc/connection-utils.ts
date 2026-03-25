import type { Connection, DbType } from '../../src/types'

/** 兼容 electron-store 中无 type 的旧连接 */
export function normalizeConnection(c: Connection): Connection {
  const type: DbType = c.type ?? 'mysql'
  if (type === 'mysql') {
    return {
      ...c,
      type: 'mysql',
      host: c.host || '127.0.0.1',
      port: c.port || 3306,
      user: c.user || 'root',
      password: c.password ?? ''
    }
  }
  if (type === 'sqlite') {
    return {
      ...c,
      type: 'sqlite',
      filePath: c.filePath ?? '',
      host: '',
      port: 0,
      user: '',
      password: ''
    }
  }
  if (type === 'postgresql') {
    return {
      ...c,
      type: 'postgresql',
      host: c.host || '127.0.0.1',
      port: c.port || 5432,
      user: c.user || 'postgres',
      password: c.password ?? '',
      database: c.database || 'postgres',
      ssl: c.ssl ?? false
    }
  }
  return { ...c, type: 'mysql' }
}

export function normalizeConnections(list: Connection[]): Connection[] {
  return list.map(normalizeConnection)
}
