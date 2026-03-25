import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import type { TableDiff, ColumnDiff, IndexDiff, ColumnInfo, IndexInfo, DbType } from '@/types'
import { Copy, Check, AlertTriangle, Code2, ArrowRight } from 'lucide-react'

export type SqlDirection = 'left_to_right' | 'right_to_left'

interface SqlGeneratorDialogProps {
  open: boolean
  onClose: () => void
  table: TableDiff
  leftDb: string
  rightDb: string
  leftLabel: string
  rightLabel: string
  /** 左侧数据源类型，用于按目标库方言生成 SQL */
  leftSqlDialect: DbType
  rightSqlDialect: DbType
}

// ─── SQL 生成辅助函数 ─────────────────────────────────────

function escapeId(name: string, dialect: DbType): string {
  if (dialect === 'postgresql') return `"${name.replace(/"/g, '""')}"`
  return `\`${name.replace(/`/g, '``')}\``
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildColumnDef(col: ColumnInfo, dialect: DbType): string {
  const q = (n: string) => escapeId(n, dialect)
  let def = `${q(col.name)} ${col.type}`
  if (dialect === 'mysql') {
    if (col.charset) def += ` CHARACTER SET ${col.charset}`
    if (col.collation) def += ` COLLATE ${col.collation}`
  }
  def += col.nullable ? ' NULL' : ' NOT NULL'

  if (col.default !== null && col.default !== undefined) {
    const isRaw =
      /^(tiny|small|medium|big)?int|^float|^double|^decimal|^numeric|^bit|^serial|^bigserial|^smallserial|^boolean|^bool/i.test(
        col.type
      ) ||
      /^(CURRENT_TIMESTAMP|NULL|TRUE|FALSE|now\(\))$/i.test(col.default) ||
      /\(/.test(col.default)
    def += isRaw ? ` DEFAULT ${col.default}` : ` DEFAULT '${escapeStr(col.default)}'`
  }

  if (dialect === 'mysql' && col.extra) def += ` ${col.extra.toUpperCase()}`
  if (dialect === 'mysql' && col.comment) def += ` COMMENT '${escapeStr(col.comment)}'`
  return def
}

function buildMysqlIndexAddClause(idx: IndexInfo): string {
  const cols = idx.columns.map((c) => escapeId(c, 'mysql')).join(', ')
  if (idx.name === 'PRIMARY') return `ADD PRIMARY KEY (${cols})`
  const unique = idx.unique ? 'UNIQUE ' : ''
  const using = idx.type && idx.type.toUpperCase() !== 'BTREE' ? ` USING ${idx.type}` : ''
  return `ADD ${unique}INDEX ${escapeId(idx.name, 'mysql')} (${cols})${using}`
}

function buildMysqlIndexDropClause(name: string): string {
  return name === 'PRIMARY' ? 'DROP PRIMARY KEY' : `DROP INDEX ${escapeId(name, 'mysql')}`
}

function headerUseDb(targetDb: string, dialect: DbType): string[] {
  if (dialect === 'mysql') {
    return [`USE ${escapeId(targetDb, 'mysql')};`, '']
  }
  if (dialect === 'postgresql') {
    return [`-- 目标数据库: ${targetDb}（请先 \\connect ${targetDb} 或在客户端选中该库）`, '']
  }
  return [`-- SQLite 单文件库，无需 USE；以下为逻辑库名参考: ${targetDb}`, '']
}

function generateAlterSqlMysql(
  tableName: string,
  targetDb: string,
  table: TableDiff,
  direction: SqlDirection,
  selectedCols: Set<string>,
  selectedIdxs: Set<string>,
  selectedMeta: Set<string>
): string {
  const isLTR = direction === 'left_to_right'
  const clauses: string[] = []

  for (const col of table.columns) {
    if (!selectedCols.has(col.name) || col.status === 'same') continue
    if (isLTR) {
      if (col.status === 'left_only') clauses.push(`  ADD COLUMN ${buildColumnDef(col.left!, 'mysql')}`)
      else if (col.status === 'right_only') clauses.push(`  DROP COLUMN ${escapeId(col.name, 'mysql')}`)
      else if (col.status === 'modified') clauses.push(`  MODIFY COLUMN ${buildColumnDef(col.left!, 'mysql')}`)
    } else {
      if (col.status === 'right_only') clauses.push(`  ADD COLUMN ${buildColumnDef(col.right!, 'mysql')}`)
      else if (col.status === 'left_only') clauses.push(`  DROP COLUMN ${escapeId(col.name, 'mysql')}`)
      else if (col.status === 'modified') clauses.push(`  MODIFY COLUMN ${buildColumnDef(col.right!, 'mysql')}`)
    }
  }

  const dropIdxClauses: string[] = []
  const addIdxClauses: string[] = []
  for (const idx of table.indexes) {
    if (!selectedIdxs.has(idx.name) || idx.status === 'same') continue
    if (isLTR) {
      if (idx.status === 'left_only') addIdxClauses.push(`  ${buildMysqlIndexAddClause(idx.left!)}`)
      else if (idx.status === 'right_only') dropIdxClauses.push(`  ${buildMysqlIndexDropClause(idx.name)}`)
      else if (idx.status === 'modified') {
        dropIdxClauses.push(`  ${buildMysqlIndexDropClause(idx.name)}`)
        addIdxClauses.push(`  ${buildMysqlIndexAddClause(idx.left!)}`)
      }
    } else {
      if (idx.status === 'right_only') addIdxClauses.push(`  ${buildMysqlIndexAddClause(idx.right!)}`)
      else if (idx.status === 'left_only') dropIdxClauses.push(`  ${buildMysqlIndexDropClause(idx.name)}`)
      else if (idx.status === 'modified') {
        dropIdxClauses.push(`  ${buildMysqlIndexDropClause(idx.name)}`)
        addIdxClauses.push(`  ${buildMysqlIndexAddClause(idx.right!)}`)
      }
    }
  }
  clauses.push(...dropIdxClauses, ...addIdxClauses)

  for (const meta of table.metaDiffs) {
    if (!selectedMeta.has(meta.field)) continue
    const value = isLTR ? meta.left : meta.right
    if (!value) continue
    if (meta.field === 'engine') clauses.push(`  ENGINE = ${value}`)
    else if (meta.field === 'charset') clauses.push(`  DEFAULT CHARACTER SET ${value}`)
    else if (meta.field === 'collation') clauses.push(`  DEFAULT COLLATE ${value}`)
    else if (meta.field === 'comment') clauses.push(`  COMMENT = '${escapeStr(value)}'`)
  }

  if (clauses.length === 0) return '-- 未选择任何变更项'

  const lines: string[] = [
    ...headerUseDb(targetDb, 'mysql'),
    `-- ${tableName}（${clauses.length} 处变更）`,
    `ALTER TABLE ${escapeId(tableName, 'mysql')}`,
  ]
  clauses.forEach((c, i) => lines.push(c + (i < clauses.length - 1 ? ',' : ';')))
  return lines.join('\n')
}

function generateAlterSqlPostgresql(
  tableName: string,
  targetDb: string,
  table: TableDiff,
  direction: SqlDirection,
  selectedCols: Set<string>,
  selectedIdxs: Set<string>,
  selectedMeta: Set<string>
): string {
  const isLTR = direction === 'left_to_right'
  const t = escapeId(tableName, 'postgresql')
  const stmts: string[] = []

  for (const col of table.columns) {
    if (!selectedCols.has(col.name) || col.status === 'same') continue
    if (isLTR) {
      if (col.status === 'left_only') {
        stmts.push(`ALTER TABLE ${t} ADD COLUMN ${buildColumnDef(col.left!, 'postgresql')};`)
      } else if (col.status === 'right_only') {
        stmts.push(`ALTER TABLE ${t} DROP COLUMN ${escapeId(col.name, 'postgresql')};`)
      } else if (col.status === 'modified' && col.left && col.right) {
        const cq = escapeId(col.name, 'postgresql')
        if (col.left.type !== col.right.type) {
          stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${cq} TYPE ${col.left.type};`)
        }
        if (col.left.nullable !== col.right.nullable) {
          stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${cq} ${col.left.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`)
        }
        const lDef = col.left.default
        const rDef = col.right.default
        if (lDef !== rDef) {
          stmts.push(
            lDef !== null && lDef !== undefined
              ? `ALTER TABLE ${t} ALTER COLUMN ${cq} SET DEFAULT ${lDef};`
              : `ALTER TABLE ${t} ALTER COLUMN ${cq} DROP DEFAULT;`
          )
        }
        if (col.left.comment !== col.right.comment) {
          stmts.push(
            col.left.comment
              ? `COMMENT ON COLUMN ${t}.${cq} IS '${escapeStr(col.left.comment)}';`
              : `COMMENT ON COLUMN ${t}.${cq} IS NULL;`
          )
        }
      }
    } else {
      if (col.status === 'right_only') {
        stmts.push(`ALTER TABLE ${t} ADD COLUMN ${buildColumnDef(col.right!, 'postgresql')};`)
      } else if (col.status === 'left_only') {
        stmts.push(`ALTER TABLE ${t} DROP COLUMN ${escapeId(col.name, 'postgresql')};`)
      } else if (col.status === 'modified' && col.left && col.right) {
        const cq = escapeId(col.name, 'postgresql')
        if (col.right.type !== col.left.type) {
          stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${cq} TYPE ${col.right.type};`)
        }
        if (col.right.nullable !== col.left.nullable) {
          stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${cq} ${col.right.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`)
        }
        const lDef = col.left.default
        const rDef = col.right.default
        if (rDef !== lDef) {
          stmts.push(
            rDef !== null && rDef !== undefined
              ? `ALTER TABLE ${t} ALTER COLUMN ${cq} SET DEFAULT ${rDef};`
              : `ALTER TABLE ${t} ALTER COLUMN ${cq} DROP DEFAULT;`
          )
        }
        if (col.right.comment !== col.left.comment) {
          stmts.push(
            col.right.comment
              ? `COMMENT ON COLUMN ${t}.${cq} IS '${escapeStr(col.right.comment)}';`
              : `COMMENT ON COLUMN ${t}.${cq} IS NULL;`
          )
        }
      }
    }
  }

  for (const idx of table.indexes) {
    if (!selectedIdxs.has(idx.name) || idx.status === 'same') continue
    const addIdx = isLTR ? idx.left : idx.right
    const dropName = idx.name
    const colsOf = (info: IndexInfo) => info.columns.map((c) => escapeId(c, 'postgresql')).join(', ')

    if (isLTR) {
      if (idx.status === 'left_only' && addIdx) {
        if (addIdx.name === 'PRIMARY') {
          stmts.push(`ALTER TABLE ${t} ADD PRIMARY KEY (${colsOf(addIdx)});`)
        } else {
          const u = addIdx.unique ? 'UNIQUE ' : ''
          stmts.push(
            `CREATE ${u}INDEX ${escapeId(addIdx.name, 'postgresql')} ON ${t} (${colsOf(addIdx)});`
          )
        }
      } else if (idx.status === 'right_only') {
        if (dropName === 'PRIMARY') {
          const cname = escapeId(`${tableName}_pkey`, 'postgresql')
          stmts.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${cname};`)
        } else {
          stmts.push(`DROP INDEX IF EXISTS ${escapeId(dropName, 'postgresql')};`)
        }
      } else if (idx.status === 'modified' && idx.left) {
        if (dropName === 'PRIMARY') {
          stmts.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${escapeId(`${tableName}_pkey`, 'postgresql')};`)
          stmts.push(`ALTER TABLE ${t} ADD PRIMARY KEY (${colsOf(idx.left)});`)
        } else {
          stmts.push(`DROP INDEX IF EXISTS ${escapeId(dropName, 'postgresql')};`)
          const u = idx.left.unique ? 'UNIQUE ' : ''
          stmts.push(
            `CREATE ${u}INDEX ${escapeId(idx.left.name, 'postgresql')} ON ${t} (${colsOf(idx.left)});`
          )
        }
      }
    } else {
      if (idx.status === 'right_only' && addIdx) {
        if (addIdx.name === 'PRIMARY') {
          stmts.push(`ALTER TABLE ${t} ADD PRIMARY KEY (${colsOf(addIdx)});`)
        } else {
          const u = addIdx.unique ? 'UNIQUE ' : ''
          stmts.push(
            `CREATE ${u}INDEX ${escapeId(addIdx.name, 'postgresql')} ON ${t} (${colsOf(addIdx)});`
          )
        }
      } else if (idx.status === 'left_only') {
        if (dropName === 'PRIMARY') {
          stmts.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${escapeId(`${tableName}_pkey`, 'postgresql')};`)
        } else {
          stmts.push(`DROP INDEX IF EXISTS ${escapeId(dropName, 'postgresql')};`)
        }
      } else if (idx.status === 'modified' && idx.right) {
        if (dropName === 'PRIMARY') {
          stmts.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${escapeId(`${tableName}_pkey`, 'postgresql')};`)
          stmts.push(`ALTER TABLE ${t} ADD PRIMARY KEY (${colsOf(idx.right)});`)
        } else {
          stmts.push(`DROP INDEX IF EXISTS ${escapeId(dropName, 'postgresql')};`)
          const u = idx.right.unique ? 'UNIQUE ' : ''
          stmts.push(
            `CREATE ${u}INDEX ${escapeId(idx.right.name, 'postgresql')} ON ${t} (${colsOf(idx.right)});`
          )
        }
      }
    }
  }

  for (const meta of table.metaDiffs) {
    if (!selectedMeta.has(meta.field)) continue
    const value = isLTR ? meta.left : meta.right
    if (meta.field === 'comment' && value) {
      stmts.push(`COMMENT ON TABLE ${t} IS '${escapeStr(value)}';`)
    }
  }

  if (stmts.length === 0) return '-- 未选择任何变更项'

  return [...headerUseDb(targetDb, 'postgresql'), `-- ${tableName}`, ...stmts].join('\n')
}

function generateAlterSqlSqlite(
  tableName: string,
  targetDb: string,
  table: TableDiff,
  direction: SqlDirection,
  selectedCols: Set<string>,
  selectedIdxs: Set<string>,
  selectedMeta: Set<string>
): string {
  const isLTR = direction === 'left_to_right'
  const t = escapeId(tableName, 'mysql')
  const stmts: string[] = []

  for (const col of table.columns) {
    if (!selectedCols.has(col.name) || col.status === 'same') continue
    if (isLTR) {
      if (col.status === 'left_only') {
        stmts.push(`ALTER TABLE ${t} ADD COLUMN ${buildColumnDef(col.left!, 'mysql')};`)
      } else if (col.status === 'right_only') {
        stmts.push(`ALTER TABLE ${t} DROP COLUMN ${escapeId(col.name, 'mysql')};`)
      } else if (col.status === 'modified') {
        stmts.push(
          `-- SQLite 无法直接 MODIFY 列 "${col.name}"，请使用表重建或迁移工具同步类型/约束`
        )
      }
    } else {
      if (col.status === 'right_only') {
        stmts.push(`ALTER TABLE ${t} ADD COLUMN ${buildColumnDef(col.right!, 'mysql')};`)
      } else if (col.status === 'left_only') {
        stmts.push(`ALTER TABLE ${t} DROP COLUMN ${escapeId(col.name, 'mysql')};`)
      } else if (col.status === 'modified') {
        stmts.push(
          `-- SQLite 无法直接 MODIFY 列 "${col.name}"，请使用表重建或迁移工具同步类型/约束`
        )
      }
    }
  }

  for (const idx of table.indexes) {
    if (!selectedIdxs.has(idx.name) || idx.status === 'same') continue
    const addIdx = isLTR ? idx.left : idx.right
    const colsOf = (info: IndexInfo) => info.columns.map((c) => escapeId(c, 'mysql')).join(', ')
    if (idx.name === 'PRIMARY') {
      stmts.push(`-- 主键变更（${idx.name}）请在 SQLite 中手动处理`)
      continue
    }
    if (isLTR) {
      if (idx.status === 'left_only' && addIdx) {
        const u = addIdx.unique ? 'UNIQUE ' : ''
        stmts.push(
          `CREATE ${u}INDEX ${escapeId(addIdx.name, 'mysql')} ON ${t} (${colsOf(addIdx)});`
        )
      } else if (idx.status === 'right_only') {
        stmts.push(`DROP INDEX IF EXISTS ${escapeId(idx.name, 'mysql')};`)
      } else if (idx.status === 'modified' && idx.left) {
        stmts.push(`DROP INDEX IF EXISTS ${escapeId(idx.name, 'mysql')};`)
        const u = idx.left.unique ? 'UNIQUE ' : ''
        stmts.push(
          `CREATE ${u}INDEX ${escapeId(idx.left.name, 'mysql')} ON ${t} (${colsOf(idx.left)});`
        )
      }
    } else {
      if (idx.status === 'right_only' && addIdx) {
        const u = addIdx.unique ? 'UNIQUE ' : ''
        stmts.push(
          `CREATE ${u}INDEX ${escapeId(addIdx.name, 'mysql')} ON ${t} (${colsOf(addIdx)});`
        )
      } else if (idx.status === 'left_only') {
        stmts.push(`DROP INDEX IF EXISTS ${escapeId(idx.name, 'mysql')};`)
      } else if (idx.status === 'modified' && idx.right) {
        stmts.push(`DROP INDEX IF EXISTS ${escapeId(idx.name, 'mysql')};`)
        const u = idx.right.unique ? 'UNIQUE ' : ''
        stmts.push(
          `CREATE ${u}INDEX ${escapeId(idx.right.name, 'mysql')} ON ${t} (${colsOf(idx.right)});`
        )
      }
    }
  }

  for (const meta of table.metaDiffs) {
    if (!selectedMeta.has(meta.field)) continue
    if (meta.field === 'comment') {
      stmts.push(`-- SQLite 表注释需通过迁移工具维护（无标准 COMMENT ON）`)
    }
  }

  if (stmts.length === 0) return '-- 未选择任何变更项'

  return [...headerUseDb(targetDb, 'sqlite'), `-- ${tableName}`, ...stmts].join('\n')
}

function generateAlterSql(
  tableName: string,
  targetDb: string,
  table: TableDiff,
  direction: SqlDirection,
  selectedCols: Set<string>,
  selectedIdxs: Set<string>,
  selectedMeta: Set<string>,
  dialect: DbType
): string {
  if (dialect === 'postgresql') {
    return generateAlterSqlPostgresql(
      tableName,
      targetDb,
      table,
      direction,
      selectedCols,
      selectedIdxs,
      selectedMeta
    )
  }
  if (dialect === 'sqlite') {
    return generateAlterSqlSqlite(
      tableName,
      targetDb,
      table,
      direction,
      selectedCols,
      selectedIdxs,
      selectedMeta
    )
  }
  return generateAlterSqlMysql(
    tableName,
    targetDb,
    table,
    direction,
    selectedCols,
    selectedIdxs,
    selectedMeta
  )
}

function generateCreateTableSql(
  tableName: string,
  targetDb: string,
  table: TableDiff,
  direction: SqlDirection,
  selectedCols: Set<string>,
  selectedIdxs: Set<string>,
  dialect: DbType
): string {
  const isLTR = direction === 'left_to_right'
  const getCol = (c: ColumnDiff): ColumnInfo | null => (isLTR ? c.left : c.right)
  const getIdx = (i: IndexDiff): IndexInfo | null => (isLTR ? i.left : i.right)

  const colLines: string[] = []
  const pkCols: string[] = []

  for (const col of table.columns) {
    if (!selectedCols.has(col.name)) continue
    const info = getCol(col)
    if (!info) continue
    if (info.key === 'PRI') pkCols.push(escapeId(info.name, dialect))
    colLines.push(`  ${buildColumnDef({ ...info, key: '' }, dialect)}`)
  }
  if (pkCols.length > 0) colLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`)

  const afterStmts: string[] = []
  const tq = escapeId(tableName, dialect)

  for (const idx of table.indexes) {
    if (!selectedIdxs.has(idx.name) || idx.name === 'PRIMARY') continue
    const info = getIdx(idx)
    if (!info) continue
    if (dialect === 'mysql') {
      const unique = info.unique ? 'UNIQUE ' : ''
      const using = info.type && info.type.toUpperCase() !== 'BTREE' ? ` USING ${info.type}` : ''
      colLines.push(
        `  ${unique}INDEX ${escapeId(info.name, 'mysql')} (${info.columns.map((c) => escapeId(c, 'mysql')).join(', ')})${using}`
      )
    } else {
      const u = info.unique ? 'UNIQUE ' : ''
      afterStmts.push(
        `CREATE ${u}INDEX ${escapeId(info.name, dialect)} ON ${tq} (${info.columns.map((c) => escapeId(c, dialect)).join(', ')});`
      )
    }
  }

  if (colLines.length === 0) return '-- 未选择任何字段'

  const head = headerUseDb(targetDb, dialect)
  const tail =
    dialect === 'mysql'
      ? ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
      : ');'

  const createBlock = [
    ...head,
    `CREATE TABLE ${tq} (`,
    colLines.join(',\n'),
    tail,
  ].join('\n')

  return afterStmts.length > 0 ? [createBlock, '', ...afterStmts].join('\n') : createBlock
}

function generateDropTableSql(tableName: string, targetDb: string, dialect: DbType): string {
  return [
    `-- ⚠️  警告：此操作将删除整张表及其所有数据，执行前请务必备份！`,
    ...headerUseDb(targetDb, dialect),
    `DROP TABLE IF EXISTS ${escapeId(tableName, dialect)};`,
  ].join('\n')
}

// ─── 判断当前方向下 table_only 表的操作类型 ─────────────

function tableOnlyAction(
  status: 'left_only' | 'right_only',
  direction: SqlDirection
): 'create' | 'drop' {
  if (status === 'left_only' && direction === 'left_to_right') return 'create'
  if (status === 'right_only' && direction === 'right_to_left') return 'create'
  return 'drop'
}

// ─── 主组件 ───────────────────────────────────────────────

export function SqlGeneratorDialog({
  open,
  onClose,
  table,
  leftDb,
  rightDb,
  leftLabel,
  rightLabel,
  leftSqlDialect,
  rightSqlDialect,
}: SqlGeneratorDialogProps) {
  const [direction, setDirection] = useState<SqlDirection>('left_to_right')
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set())
  const [selectedIdxs, setSelectedIdxs] = useState<Set<string>>(new Set())
  const [selectedMeta, setSelectedMeta] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const diffCols = useMemo(() => table.columns.filter((c) => c.status !== 'same'), [table])
  const diffIdxs = useMemo(() => table.indexes.filter((i) => i.status !== 'same'), [table])
  const isTableOnly = table.status === 'left_only' || table.status === 'right_only'

  // 打开时初始化选中状态
  useEffect(() => {
    if (!open) return
    if (isTableOnly) {
      setSelectedCols(new Set(table.columns.map((c) => c.name)))
      setSelectedIdxs(new Set(table.indexes.map((i) => i.name)))
    } else {
      setSelectedCols(new Set(diffCols.map((c) => c.name)))
      setSelectedIdxs(new Set(diffIdxs.map((i) => i.name)))
      setSelectedMeta(new Set(table.metaDiffs.map((m) => m.field)))
    }
    setDirection('left_to_right')
    setCopied(false)
  }, [open, table, isTableOnly, diffCols, diffIdxs])

  const targetDb = direction === 'left_to_right' ? rightDb : leftDb
  const targetDialect = direction === 'left_to_right' ? rightSqlDialect : leftSqlDialect
  const sourceLabel = direction === 'left_to_right' ? leftLabel : rightLabel
  const targetLabel = direction === 'left_to_right' ? rightLabel : leftLabel

  const action = isTableOnly
    ? tableOnlyAction(table.status as 'left_only' | 'right_only', direction)
    : null

  const sql = useMemo(() => {
    if (isTableOnly) {
      if (action === 'create') {
        return generateCreateTableSql(
          table.name,
          targetDb,
          table,
          direction,
          selectedCols,
          selectedIdxs,
          targetDialect
        )
      } else {
        return generateDropTableSql(table.name, targetDb, targetDialect)
      }
    }
    return generateAlterSql(
      table.name,
      targetDb,
      table,
      direction,
      selectedCols,
      selectedIdxs,
      selectedMeta,
      targetDialect
    )
  }, [
    table,
    direction,
    selectedCols,
    selectedIdxs,
    selectedMeta,
    targetDb,
    targetDialect,
    isTableOnly,
    action
  ])

  const toggleCol = (name: string) => {
    setSelectedCols((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }
  const toggleIdx = (name: string) => {
    setSelectedIdxs((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }
  const toggleMeta = (field: string) => {
    setSelectedMeta((prev) => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  const allDiffItems = diffCols.length + diffIdxs.length + table.metaDiffs.length
  const selectedCount = selectedCols.size + selectedIdxs.size + selectedMeta.size
  const allSelected = !isTableOnly && selectedCount === allDiffItems
  const toggleAll = () => {
    if (allSelected) {
      setSelectedCols(new Set())
      setSelectedIdxs(new Set())
      setSelectedMeta(new Set())
    } else {
      setSelectedCols(new Set(diffCols.map((c) => c.name)))
      setSelectedIdxs(new Set(diffIdxs.map((i) => i.name)))
      setSelectedMeta(new Set(table.metaDiffs.map((m) => m.field)))
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const colStatusLabel = (col: typeof diffCols[0]) => {
    if (col.status === 'left_only') return { text: '新增', cls: 'text-blue-600 bg-blue-50' }
    if (col.status === 'right_only') return { text: '删除', cls: 'text-red-600 bg-red-50' }
    return { text: col.changedFields.join('/'), cls: 'text-amber-700 bg-amber-50' }
  }
  const idxStatusLabel = (idx: typeof diffIdxs[0]) => {
    if (idx.status === 'left_only') return { text: '新增', cls: 'text-blue-600 bg-blue-50' }
    if (idx.status === 'right_only') return { text: '删除', cls: 'text-red-600 bg-red-50' }
    return { text: '变更', cls: 'text-amber-700 bg-amber-50' }
  }

  // 针对当前方向，字段/索引的语义变化（left_only 在 LTR 方向是新增到右库，在 RTL 方向是删除自左库）
  const colActionLabel = (col: typeof diffCols[0]) => {
    const isLTR = direction === 'left_to_right'
    if (col.status === 'left_only') return isLTR ? { text: '新增', cls: 'text-blue-600 bg-blue-50' } : { text: '删除', cls: 'text-red-600 bg-red-50' }
    if (col.status === 'right_only') return isLTR ? { text: '删除', cls: 'text-red-600 bg-red-50' } : { text: '新增', cls: 'text-blue-600 bg-blue-50' }
    return { text: '修改', cls: 'text-amber-700 bg-amber-50' }
  }
  const idxActionLabel = (idx: typeof diffIdxs[0]) => {
    const isLTR = direction === 'left_to_right'
    if (idx.status === 'left_only') return isLTR ? { text: '新增', cls: 'text-blue-600 bg-blue-50' } : { text: '删除', cls: 'text-red-600 bg-red-50' }
    if (idx.status === 'right_only') return isLTR ? { text: '删除', cls: 'text-red-600 bg-red-50' } : { text: '新增', cls: 'text-blue-600 bg-blue-50' }
    return { text: '修改', cls: 'text-amber-700 bg-amber-50' }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* 标题栏 */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Code2 className="h-4 w-4 text-primary" />
            生成同步 SQL
            <span className="font-mono text-sm text-muted-foreground font-normal">— {table.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5 min-h-0">
          {/* 同步方向 */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">同步方向</p>
            <div className="grid grid-cols-2 gap-2">
              {(['left_to_right', 'right_to_left'] as const).map((d) => {
                const src = d === 'left_to_right' ? leftLabel : rightLabel
                const tgt = d === 'left_to_right' ? rightLabel : leftLabel
                const active = direction === d
                return (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs text-left transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-primary/40 hover:bg-muted/30'
                    }`}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 ${
                        active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}
                    />
                    <span className="truncate min-w-0">{src}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate min-w-0">{tgt}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              以 <span className="font-medium text-foreground">{sourceLabel}</span> 为准，
              生成在 <span className="font-medium text-foreground">{targetLabel}</span> 执行的 SQL
            </p>
          </div>

          {/* 差异项选择 */}
          {!isTableOnly && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  差异项选择
                  <span className="ml-1.5 text-foreground normal-case font-normal">
                    （已选 {selectedCount} / {allDiffItems}）
                  </span>
                </p>
                <button
                  onClick={toggleAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  {allSelected ? '取消全选' : '全选'}
                </button>
              </div>

              <div className="rounded-lg border divide-y overflow-hidden">
                {/* 字段差异 */}
                {diffCols.map((col) => {
                  const lbl = colActionLabel(col)
                  return (
                    <label
                      key={`col-${col.name}`}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCols.has(col.name)}
                        onChange={() => toggleCol(col.name)}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${lbl.cls}`}>
                        {lbl.text}
                      </span>
                      <span className="text-xs font-mono font-medium">{col.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[200px]">
                        {col.status === 'modified'
                          ? direction === 'left_to_right'
                            ? `${col.left?.type ?? '?'} → ${col.right?.type ?? '?'}`
                            : `${col.right?.type ?? '?'} → ${col.left?.type ?? '?'}`
                          : col.status === 'left_only'
                            ? col.left?.type ?? ''
                            : col.right?.type ?? ''}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">字段</span>
                    </label>
                  )
                })}

                {/* 索引差异 */}
                {diffIdxs.map((idx) => {
                  const lbl = idxActionLabel(idx)
                  return (
                    <label
                      key={`idx-${idx.name}`}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIdxs.has(idx.name)}
                        onChange={() => toggleIdx(idx.name)}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${lbl.cls}`}>
                        {lbl.text}
                      </span>
                      <span className="text-xs font-mono font-medium">{idx.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[200px]">
                        {(() => {
                          const src = direction === 'left_to_right' ? (idx.left ?? idx.right) : (idx.right ?? idx.left)
                          return `(${src!.columns.join(', ')})`
                        })()}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">索引</span>
                    </label>
                  )
                })}

                {/* 表属性差异 */}
                {table.metaDiffs.map((meta) => {
                  const isLTR = direction === 'left_to_right'
                  const fromVal = isLTR ? meta.left : meta.right
                  const toVal = isLTR ? meta.right : meta.left
                  return (
                    <label
                      key={`meta-${meta.field}`}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMeta.has(meta.field)}
                        onChange={() => toggleMeta(meta.field)}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 text-amber-700 bg-amber-50">
                        修改
                      </span>
                      <span className="text-xs font-medium">{meta.label}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        <span className="font-mono">{fromVal || '（空）'}</span>
                        <span className="mx-1">→</span>
                        <span className="font-mono">{toVal || '（空）'}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">属性</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* DROP TABLE 警告 */}
          {isTableOnly && action === 'drop' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700">
                <p className="font-medium">此方向将删除整张表</p>
                <p className="mt-0.5 text-red-600/80">
                  在 <span className="font-mono font-medium">{targetDb}</span> 中执行 DROP TABLE，
                  将永久删除表 <span className="font-mono font-medium">{table.name}</span> 及其所有数据。
                </p>
              </div>
            </div>
          )}

          {/* 生成的 SQL */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                生成的 SQL
                <span className="ml-1.5 normal-case font-normal text-foreground">
                  （在 <span className="font-mono">{targetDb}</span> 执行）
                </span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-green-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    复制 SQL
                  </>
                )}
              </Button>
            </div>
            <pre className="text-[11px] leading-relaxed font-mono bg-muted/40 border rounded-lg px-4 py-3 overflow-x-auto whitespace-pre text-foreground/90 min-h-[80px]">
              {sql}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
