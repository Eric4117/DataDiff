import type { ColumnInfo, ForeignKeyInfo, IndexInfo, TableMeta } from '../../../src/types'

export interface TableSchemaPayload {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  meta: TableMeta
  foreignKeys: ForeignKeyInfo[]
}

export type SchemaMap = Map<string, TableSchemaPayload>
