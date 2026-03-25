import type { Connection } from '../../../src/types'
import { testMysql, listMysqlDatabases, fetchMysqlSchema } from './mysql'
import { testSqlite, listSqliteDatabases, fetchSqliteSchema } from './sqlite'
import { testPostgresql, listPostgresqlDatabases, fetchPostgresqlSchema } from './postgresql'
import type { SchemaMap } from './types'

export async function testConnection(
  conn: Connection
): Promise<{ success: boolean; message: string }> {
  switch (conn.type) {
    case 'mysql':
      return testMysql(conn)
    case 'sqlite':
      return Promise.resolve(testSqlite(conn))
    case 'postgresql':
      return testPostgresql(conn)
    default:
      return testMysql({ ...conn, type: 'mysql' })
  }
}

export async function listDatabases(conn: Connection): Promise<string[]> {
  switch (conn.type) {
    case 'mysql':
      return listMysqlDatabases(conn)
    case 'sqlite':
      return listSqliteDatabases(conn)
    case 'postgresql':
      return listPostgresqlDatabases(conn)
    default:
      return listMysqlDatabases({ ...conn, type: 'mysql' })
  }
}

export async function fetchSchema(conn: Connection, database: string): Promise<SchemaMap> {
  switch (conn.type) {
    case 'mysql':
      return fetchMysqlSchema(conn, database)
    case 'sqlite':
      return Promise.resolve(fetchSqliteSchema(conn, database))
    case 'postgresql':
      return fetchPostgresqlSchema(conn, database)
    default:
      return fetchMysqlSchema({ ...conn, type: 'mysql' }, database)
  }
}

export type { SchemaMap }
