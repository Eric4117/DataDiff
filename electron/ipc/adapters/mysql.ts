import { createConnection, type RowDataPacket } from 'mysql2/promise'
import type { Connection, ColumnInfo, ForeignKeyInfo, IndexInfo, TableMeta } from '../../../src/types'
import type { SchemaMap } from './types'

interface RawColumnRow extends RowDataPacket {
  TABLE_NAME: string
  COLUMN_NAME: string
  ORDINAL_POSITION: number
  COLUMN_DEFAULT: string | null
  IS_NULLABLE: string
  COLUMN_TYPE: string
  COLUMN_KEY: string
  EXTRA: string
  COLUMN_COMMENT: string
  CHARACTER_SET_NAME: string | null
  COLLATION_NAME: string | null
}

interface RawIndexRow extends RowDataPacket {
  TABLE_NAME: string
  INDEX_NAME: string
  NON_UNIQUE: number
  SEQ_IN_INDEX: number
  COLUMN_NAME: string
  INDEX_TYPE: string
}

interface RawTableRow extends RowDataPacket {
  TABLE_NAME: string
  ENGINE: string
  TABLE_COLLATION: string
  TABLE_COMMENT: string
}

interface RawForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string
  COLUMN_NAME: string
  CONSTRAINT_NAME: string
  REFERENCED_TABLE_NAME: string
  REFERENCED_COLUMN_NAME: string
}

export async function testMysql(conn: Connection): Promise<{ success: boolean; message: string }> {
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
}

export async function listMysqlDatabases(conn: Connection): Promise<string[]> {
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
}

export async function fetchMysqlSchema(conn: Connection, database: string): Promise<SchemaMap> {
  const connection = await createConnection({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: 'information_schema',
    connectTimeout: 15000
  })

  try {
    const [colRows] = await connection.execute<RawColumnRow[]>(
      `SELECT
        TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION,
        COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE,
        COLUMN_KEY, EXTRA, COLUMN_COMMENT,
        CHARACTER_SET_NAME, COLLATION_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database]
    )

    const [indexRows] = await connection.execute<RawIndexRow[]>(
      `SELECT
        TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      [database]
    )

    const [tableRows] = await connection.execute<RawTableRow[]>(
      `SELECT
        TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_COMMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
      [database]
    )

    const [fkRows] = await connection.execute<RawForeignKeyRow[]>(
      `SELECT
        TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
      [database]
    )

    const result = new Map<string, {
      columns: ColumnInfo[]
      indexes: IndexInfo[]
      meta: TableMeta
      foreignKeys: ForeignKeyInfo[]
    }>()

    const metaMap = new Map<string, TableMeta>()
    for (const row of tableRows) {
      const collation = row.TABLE_COLLATION || ''
      const charset = collation.split('_')[0] || ''
      metaMap.set(row.TABLE_NAME, {
        engine: row.ENGINE || '',
        collation,
        comment: row.TABLE_COMMENT || '',
        charset
      })
    }

    const indexMap = new Map<string, Map<string, { nonUnique: number; columns: string[]; type: string }>>()
    for (const ir of indexRows) {
      if (!indexMap.has(ir.TABLE_NAME)) indexMap.set(ir.TABLE_NAME, new Map())
      const tbl = indexMap.get(ir.TABLE_NAME)!
      if (!tbl.has(ir.INDEX_NAME)) {
        tbl.set(ir.INDEX_NAME, { nonUnique: ir.NON_UNIQUE, columns: [], type: ir.INDEX_TYPE })
      }
      tbl.get(ir.INDEX_NAME)!.columns.push(ir.COLUMN_NAME)
    }

    for (const row of colRows) {
      if (!result.has(row.TABLE_NAME)) {
        const meta = metaMap.get(row.TABLE_NAME) || { engine: '', collation: '', comment: '', charset: '' }
        const rawIndexes = indexMap.get(row.TABLE_NAME) || new Map()
        const indexes: IndexInfo[] = []
        for (const [name, info] of rawIndexes) {
          indexes.push({
            name,
            columns: info.columns,
            unique: info.nonUnique === 0,
            type: info.type
          })
        }
        result.set(row.TABLE_NAME, { columns: [], indexes, meta, foreignKeys: [] })
      }
      result.get(row.TABLE_NAME)!.columns.push({
        name: row.COLUMN_NAME,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === 'YES',
        key: row.COLUMN_KEY,
        default: row.COLUMN_DEFAULT,
        extra: row.EXTRA,
        comment: row.COLUMN_COMMENT,
        ordinalPosition: row.ORDINAL_POSITION,
        charset: row.CHARACTER_SET_NAME,
        collation: row.COLLATION_NAME
      })
    }

    for (const [name, meta] of metaMap) {
      if (!result.has(name)) {
        const rawIndexes = indexMap.get(name) || new Map()
        const indexes: IndexInfo[] = []
        for (const [idxName, info] of rawIndexes) {
          indexes.push({ name: idxName, columns: info.columns, unique: info.nonUnique === 0, type: info.type })
        }
        result.set(name, { columns: [], indexes, meta, foreignKeys: [] })
      }
    }

    for (const row of fkRows) {
      const tableSchema = result.get(row.TABLE_NAME)
      if (!tableSchema) continue
      tableSchema.foreignKeys.push({
        constraintName: row.CONSTRAINT_NAME,
        column: row.COLUMN_NAME,
        referencedTable: row.REFERENCED_TABLE_NAME,
        referencedColumn: row.REFERENCED_COLUMN_NAME
      })
    }

    return result
  } finally {
    try {
      await connection.end()
    } catch {
      // ignore
    }
  }
}
