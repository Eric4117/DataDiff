import type { TableStructure, TableDiff, DiffSummary, ForeignKeyInfo } from '@/types'

function formatDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatFullSchemaForAI(tables: TableStructure[], dbName: string): string {
  const lines: string[] = []

  lines.push(`# 数据库 Schema：${dbName}（${tables.length} 张表）`)
  lines.push(`生成时间：${formatDate()}`)

  for (const table of tables) {
    lines.push('')
    lines.push('---')
    const titleComment = table.meta.comment ? `（${table.meta.comment}）` : ''
    lines.push(`## ${table.name}${titleComment}`)

    if (table.columns.length > 0) {
      lines.push('字段：')
      for (const col of table.columns) {
        const parts: string[] = [col.type]
        parts.push(col.nullable ? 'NULL' : 'NOT NULL')
        if (col.key === 'PRI') parts.push('PRI')
        else if (col.key === 'UNI') parts.push('UNIQUE')
        else if (col.key === 'MUL') parts.push('INDEX')
        if (col.extra) parts.push(col.extra)
        if (col.default !== null && col.default !== undefined) {
          parts.push(`DEFAULT ${col.default === '' ? "''" : col.default}`)
        }
        const comment = col.comment ? ` — ${col.comment}` : ''
        lines.push(`- ${col.name}: ${parts.join(', ')}${comment}`)
      }
    }

    if (table.indexes.length > 0) {
      lines.push('')
      const idxParts = table.indexes.map((idx) => {
        const unique = idx.unique && idx.name !== 'PRIMARY' ? ', UNIQUE' : ''
        return `${idx.name}(${idx.columns.join(', ')}${unique})`
      })
      lines.push(`索引：${idxParts.join(', ')}`)
    }
  }

  return lines.join('\n')
}

export function formatDiffForAI(
  tables: TableDiff[],
  leftLabel: string,
  rightLabel: string,
  summary: DiffSummary
): string {
  const lines: string[] = []

  lines.push('# Schema Diff 摘要')
  lines.push(`左库：${leftLabel}`)
  lines.push(`右库：${rightLabel}`)
  lines.push(`生成时间：${formatDate()}`)
  lines.push(
    `差异：${summary.modified} 修改 · ${summary.leftOnly} 仅左侧 · ${summary.rightOnly} 仅右侧`
  )

  const diffTables = tables.filter((t) => t.status !== 'same')

  for (const table of diffTables) {
    lines.push('')
    lines.push('---')

    if (table.status === 'left_only') {
      lines.push(`## [仅左侧] ${table.name}`)
      lines.push(`该表仅存在于左库（${leftLabel}），右库中不存在`)
      if (table.columns.length > 0) {
        const cols = table.columns
          .map((c) => {
            const info = c.left!
            const key = info.key === 'PRI' ? ' PRI' : info.key === 'UNI' ? ' UNIQUE' : ''
            return `${info.name}(${info.type}${key})`
          })
          .join(', ')
        lines.push(`字段：${cols}`)
      }
    } else if (table.status === 'right_only') {
      lines.push(`## [仅右侧] ${table.name}`)
      lines.push(`该表仅存在于右库（${rightLabel}），左库中不存在`)
      if (table.columns.length > 0) {
        const cols = table.columns
          .map((c) => {
            const info = c.right!
            const key = info.key === 'PRI' ? ' PRI' : info.key === 'UNI' ? ' UNIQUE' : ''
            return `${info.name}(${info.type}${key})`
          })
          .join(', ')
        lines.push(`字段：${cols}`)
      }
    } else {
      lines.push(`## [有差异] ${table.name}`)

      const diffCols = table.columns.filter((c) => c.status !== 'same')
      if (diffCols.length > 0) {
        lines.push('变更字段：')
        for (const col of diffCols) {
          if (col.status === 'left_only') {
            const info = col.left!
            const comment = info.comment ? ` — ${info.comment}` : ''
            lines.push(`  + ${col.name}: ${info.type} ${info.nullable ? 'NULL' : 'NOT NULL'}${comment}（新增）`)
          } else if (col.status === 'right_only') {
            lines.push(`  - ${col.name}（已删除）`)
          } else {
            const changed = col.changedFields.join(', ')
            lines.push(
              `  ~ ${col.name}: ${col.left?.type ?? '?'} → ${col.right?.type ?? '?'}（变更：${changed}）`
            )
          }
        }
      }

      const diffIdxs = table.indexes.filter((i) => i.status !== 'same')
      if (diffIdxs.length > 0) {
        lines.push('变更索引：')
        for (const idx of diffIdxs) {
          if (idx.status === 'left_only') {
            const info = idx.left!
            lines.push(`  + ${idx.name}(${info.columns.join(', ')})（新增）`)
          } else if (idx.status === 'right_only') {
            lines.push(`  - ${idx.name}（已删除）`)
          } else {
            lines.push(
              `  ~ ${idx.name}: (${idx.left?.columns.join(', ') ?? '?'}) → (${idx.right?.columns.join(', ') ?? '?'})（变更）`
            )
          }
        }
      }

      if (table.metaDiffs.length > 0) {
        lines.push('表属性变更：')
        for (const meta of table.metaDiffs) {
          lines.push(`  ~ ${meta.label}: ${meta.left || '（空）'} → ${meta.right || '（空）'}`)
        }
      }
    }
  }

  return lines.join('\n')
}

// ─── ERD (Mermaid) 导出 ────────────────────────────────────

/** 从 MySQL 完整类型中提取 Mermaid 可接受的基础类型名（不含括号） */
function toMermaidType(mysqlType: string): string {
  return mysqlType.replace(/\(.*\)/, '').trim().replace(/\s+/g, '_')
}

export function formatERDForAI(tables: TableStructure[], dbName: string): string {
  const tableSet = new Set(tables.map((t) => t.name))

  const lines: string[] = []
  lines.push(`# ER 关系图：${dbName}（${tables.length} 张表）`)
  lines.push(`生成时间：${formatDate()}`)
  lines.push('')
  lines.push('```mermaid')
  lines.push('erDiagram')

  const relationLines: string[] = []

  for (const table of tables) {
    const fkColumnSet = new Set(table.foreignKeys.map((fk: ForeignKeyInfo) => fk.column))

    lines.push(`    ${table.name} {`)
    for (const col of table.columns) {
      const mType = toMermaidType(col.type)
      let marker = ''
      if (col.key === 'PRI') marker = ' PK'
      else if (fkColumnSet.has(col.name)) marker = ' FK'
      lines.push(`        ${mType} ${col.name}${marker}`)
    }
    lines.push(`    }`)

    for (const fk of table.foreignKeys) {
      if (!tableSet.has(fk.referencedTable)) continue
      relationLines.push(
        `    ${fk.referencedTable} ||--o{ ${table.name} : "${fk.column}"`
      )
    }
  }

  if (relationLines.length > 0) {
    lines.push('')
    lines.push(...relationLines)
  }

  lines.push('```')

  return lines.join('\n')
}
