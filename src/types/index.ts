export interface Connection {
  id: string
  name: string
  host: string
  port: number
  user: string
  password: string
}

export interface CompareTarget {
  connectionId: string
  database: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  key: string
  default: string | null
  extra: string
  comment: string
  ordinalPosition: number
  charset: string | null
  collation: string | null
}

export interface ColumnDiff {
  name: string
  status: 'same' | 'left_only' | 'right_only' | 'modified'
  left: ColumnInfo | null
  right: ColumnInfo | null
  orderChanged: boolean
  changedFields: string[]
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  type: string
}

export interface IndexDiff {
  name: string
  status: 'same' | 'left_only' | 'right_only' | 'modified'
  left: IndexInfo | null
  right: IndexInfo | null
  changedFields: string[]
}

export interface TableMeta {
  engine: string
  collation: string
  comment: string
  charset: string
}

export interface TableMetaDiff {
  field: string
  label: string
  left: string
  right: string
}

export interface TableDiff {
  name: string
  status: 'same' | 'left_only' | 'right_only' | 'modified'
  columns: ColumnDiff[]
  indexes: IndexDiff[]
  metaDiffs: TableMetaDiff[]
  orderChanged: boolean
}

export interface DiffSummary {
  total: number
  same: number
  modified: number
  leftOnly: number
  rightOnly: number
  /** 以下为 modified 表的细分统计（可重叠） */
  fieldDiff: number
  columnMissing: number
  typeDiff: number
  charsetDiff: number
  indexDiff: number
}

export interface DiffResult {
  tables: TableDiff[]
  summary: DiffSummary
}

export type DiffFilter =
  | 'all'
  | 'different'
  | 'left_only'
  | 'right_only'
  | 'same'
  | 'field_diff'
  | 'column_missing'
  | 'type_diff'
  | 'charset_diff'
  | 'index_diff'

export interface ForeignKeyInfo {
  constraintName: string
  column: string
  referencedTable: string
  referencedColumn: string
}

/** 单表结构（用于结构查看工具） */
export interface TableStructure {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  meta: TableMeta
  foreignKeys: ForeignKeyInfo[]
}

/** 数据库结构（所有表） */
export interface DatabaseStructure {
  tables: TableStructure[]
}

export interface ProjectTable {
  connectionId: string
  database: string
  tableName: string
}

export interface Project {
  id: string
  name: string
  tables: ProjectTable[]
  createdAt: number
  updatedAt: number
}

/** 快捷操作 */
export interface Shortcut {
  id: string
  name: string
  type: 'compare' | 'structure'
  createdAt: number
  updatedAt: number
  compare?: {
    left: CompareTarget
    right: CompareTarget
  }
  structure?: CompareTarget
}
