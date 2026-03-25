import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import type { Connection, ColumnInfo, ForeignKeyInfo, IndexInfo, TableMeta } from '../../../src/types'
import type { SchemaMap } from './types'

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function testSqlite(conn: Connection): { success: boolean; message: string } {
  const path = conn.filePath?.trim() ?? ''
  if (!path) {
    return { success: false, message: '请填写数据库文件路径' }
  }
  if (!existsSync(path)) {
    return { success: false, message: '文件不存在' }
  }
  let db: Database.Database | undefined
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    db.prepare('SELECT 1').get()
    return { success: true, message: '连接成功' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '连接失败'
    return { success: false, message }
  } finally {
    try {
      db?.close()
    } catch {
      // ignore
    }
  }
}

export function listSqliteDatabases(_conn: Connection): string[] {
  return ['main']
}

export function fetchSqliteSchema(conn: Connection, _database: string): SchemaMap {
  const path = conn.filePath?.trim() ?? ''
  if (!path || !existsSync(path)) {
    throw new Error('SQLite 文件不存在或路径无效')
  }

  const db = new Database(path, { readonly: true, fileMustExist: true })

  try {
    const tableRows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[]

    const result = new Map<
      string,
      { columns: ColumnInfo[]; indexes: IndexInfo[]; meta: TableMeta; foreignKeys: ForeignKeyInfo[] }
    >()

    for (const { name: tableName } of tableRows) {
      const meta: TableMeta = {
        engine: 'sqlite',
        collation: '',
        comment: '',
        charset: ''
      }

      const colStmt = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`)
      const pragmaCols = colStmt.all() as {
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }[]

      const columns: ColumnInfo[] = pragmaCols.map((row) => ({
        name: row.name,
        type: row.type || 'TEXT',
        nullable: row.notnull === 0,
        key: row.pk > 0 ? 'PRI' : '',
        default: row.dflt_value,
        extra: '',
        comment: '',
        ordinalPosition: row.cid + 1,
        charset: null,
        collation: null
      }))

      const pkColNames = pragmaCols
        .filter((r) => r.pk > 0)
        .sort((a, b) => a.pk - b.pk || a.cid - b.cid)
        .map((r) => r.name)

      const indexList = db.prepare(`PRAGMA index_list(${quoteIdent(tableName)})`).all() as {
        seq: number
        name: string
        unique: number
        origin: string
        partial: number
      }[]

      const indexes: IndexInfo[] = []

      if (pkColNames.length > 0) {
        indexes.push({
          name: 'PRIMARY',
          columns: pkColNames,
          unique: true,
          type: 'BTREE'
        })
      }

      for (const idx of indexList.sort((a, b) => a.seq - b.seq)) {
        if (idx.origin === 'pk') continue
        const infoRows = db.prepare(`PRAGMA index_info(${quoteIdent(idx.name)})`).all() as {
          seqno: number
          cid: number
          name: string
        }[]
        const colNames = infoRows.sort((a, b) => a.seqno - b.seqno).map((r) => r.name)
        indexes.push({
          name: idx.name,
          columns: colNames,
          unique: idx.unique === 1,
          type: 'BTREE'
        })
      }

      const fkRows = db.prepare(`PRAGMA foreign_key_list(${quoteIdent(tableName)})`).all() as {
        id: number
        seq: number
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
        match: string
      }[]

      const fkById = new Map<number, typeof fkRows>()
      for (const fk of fkRows) {
        if (!fkById.has(fk.id)) fkById.set(fk.id, [])
        fkById.get(fk.id)!.push(fk)
      }

      const foreignKeys: ForeignKeyInfo[] = []
      for (const [, rows] of fkById) {
        rows.sort((a, b) => a.seq - b.seq)
        const first = rows[0]
        foreignKeys.push({
          constraintName: `fk_${tableName}_${first.id}`,
          column: first.from,
          referencedTable: first.table,
          referencedColumn: first.to
        })
      }

      result.set(tableName, { columns, indexes, meta, foreignKeys })
    }

    return result
  } finally {
    try {
      db.close()
    } catch {
      // ignore
    }
  }
}
