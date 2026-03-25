import { Client } from 'pg'
import type { Connection, ColumnInfo, ForeignKeyInfo, IndexInfo, TableMeta } from '../../../src/types'
import type { SchemaMap } from './types'

function sslConfig(conn: Connection): boolean | { rejectUnauthorized: boolean } {
  if (!conn.ssl) return false
  return { rejectUnauthorized: false }
}

async function connectClient(conn: Connection, database: string): Promise<Client> {
  const client = new Client({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database,
    connectionTimeoutMillis: 15000,
    ssl: sslConfig(conn)
  })
  await client.connect()
  return client
}

export async function testPostgresql(conn: Connection): Promise<{ success: boolean; message: string }> {
  const db = conn.database || 'postgres'
  let client: Client | undefined
  try {
    client = await connectClient(conn, db)
    await client.query('SELECT 1')
    return { success: true, message: '连接成功' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '连接失败'
    return { success: false, message }
  } finally {
    if (client) {
      try {
        await client.end()
      } catch {
        // ignore
      }
    }
  }
}

export async function listPostgresqlDatabases(conn: Connection): Promise<string[]> {
  const db = conn.database || 'postgres'
  const client = await connectClient(conn, db)
  try {
    const r = await client.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
    )
    return r.rows.map((x) => x.datname)
  } finally {
    await client.end().catch(() => {})
  }
}

export async function fetchPostgresqlSchema(conn: Connection, database: string): Promise<SchemaMap> {
  const client = await connectClient(conn, database)
  try {
    const [colResult, idxResult, tblResult, fkResult] = await Promise.all([
      client.query<{
        table_name: string
        column_name: string
        ordinal_position: number
        column_default: string | null
        att_not_null: boolean
        column_type: string
        is_pk: boolean
        col_comment: string | null
      }>(`
        SELECT
          c.relname AS table_name,
          a.attname AS column_name,
          a.attnum AS ordinal_position,
          pg_get_expr(def.adbin, def.adrelid) AS column_default,
          a.attnotnull AS att_not_null,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type,
          EXISTS (
            SELECT 1 FROM pg_index i
            WHERE i.indrelid = a.attrelid AND i.indisprimary
              AND a.attnum = ANY (i.indkey)
          ) AS is_pk,
          pg_catalog.col_description(a.attrelid, a.attnum) AS col_comment
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef def ON def.adrelid = a.attrelid AND def.adnum = a.attnum
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum
      `),
      client.query<{
        table_name: string
        index_name: string
        indisunique: boolean
        indisprimary: boolean
        index_type: string
        column_name: string
        key_order: number
      }>(`
        SELECT
          t.relname AS table_name,
          CASE WHEN ix.indisprimary THEN 'PRIMARY' ELSE i.relname END AS index_name,
          ix.indisunique AS indisunique,
          ix.indisprimary AS indisprimary,
          am.amname AS index_type,
          a.attname AS column_name,
          k.ord AS key_order
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON i.relam = am.oid
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum AND NOT a.attisdropped
        WHERE t.relkind = 'r' AND n.nspname = 'public'
        ORDER BY t.relname, index_name, k.ord
      `),
      client.query<{ table_name: string; table_comment: string }>(`
        SELECT
          c.relname AS table_name,
          COALESCE(obj_description(c.oid, 'pg_class'), '') AS table_comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        ORDER BY c.relname
      `),
      client.query<{
        table_name: string
        column_name: string
        constraint_name: string
        referenced_table: string
        referenced_column: string
      }>(`
        SELECT
          tc.table_name::text,
          kcu.column_name::text,
          tc.constraint_name::text,
          ccu.table_name::text AS referenced_table,
          ccu.column_name::text AS referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_name
      `)
    ])

    const metaMap = new Map<string, TableMeta>()
    for (const row of tblResult.rows) {
      metaMap.set(row.table_name, {
        engine: '',
        collation: '',
        comment: row.table_comment || '',
        charset: ''
      })
    }

    const indexMap = new Map<string, Map<string, { unique: boolean; columns: string[]; type: string }>>()
    for (const ir of idxResult.rows) {
      if (!indexMap.has(ir.table_name)) indexMap.set(ir.table_name, new Map())
      const tbl = indexMap.get(ir.table_name)!
      if (!tbl.has(ir.index_name)) {
        tbl.set(ir.index_name, {
          unique: ir.indisunique || ir.indisprimary,
          columns: [],
          type: ir.index_type || 'btree'
        })
      }
      tbl.get(ir.index_name)!.columns.push(ir.column_name)
    }

    const result = new Map<
      string,
      { columns: ColumnInfo[]; indexes: IndexInfo[]; meta: TableMeta; foreignKeys: ForeignKeyInfo[] }
    >()

    for (const row of colResult.rows) {
      if (!result.has(row.table_name)) {
        const meta = metaMap.get(row.table_name) || { engine: '', collation: '', comment: '', charset: '' }
        const rawIndexes = indexMap.get(row.table_name) || new Map()
        const indexes: IndexInfo[] = []
        for (const [name, info] of rawIndexes) {
          indexes.push({
            name,
            columns: info.columns,
            unique: info.unique,
            type: info.type
          })
        }
        result.set(row.table_name, { columns: [], indexes, meta, foreignKeys: [] })
      }
      result.get(row.table_name)!.columns.push({
        name: row.column_name,
        type: row.column_type,
        nullable: !row.att_not_null,
        key: row.is_pk ? 'PRI' : '',
        default: row.column_default,
        extra: '',
        comment: row.col_comment || '',
        ordinalPosition: row.ordinal_position,
        charset: null,
        collation: null
      })
    }

    for (const [name, meta] of metaMap) {
      if (!result.has(name)) {
        const rawIndexes = indexMap.get(name) || new Map()
        const indexes: IndexInfo[] = []
        for (const [idxName, info] of rawIndexes) {
          indexes.push({
            name: idxName,
            columns: info.columns,
            unique: info.unique,
            type: info.type
          })
        }
        result.set(name, { columns: [], indexes, meta, foreignKeys: [] })
      }
    }

    for (const row of fkResult.rows) {
      const ts = result.get(row.table_name)
      if (!ts) continue
      ts.foreignKeys.push({
        constraintName: row.constraint_name,
        column: row.column_name,
        referencedTable: row.referenced_table,
        referencedColumn: row.referenced_column
      })
    }

    return result
  } finally {
    await client.end().catch(() => {})
  }
}
