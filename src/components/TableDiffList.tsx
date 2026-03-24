import React, { useState, useMemo } from 'react'
import type { TableDiff, DiffFilter, DiffResult, CompareTarget, Connection } from '@/types'
import { DiffSummaryBar } from './DiffSummaryBar'
import { ColumnDiffTable } from './ColumnDiffTable'
import { IndexDiffTable } from './IndexDiffTable'
import { SqlGeneratorDialog } from './SqlGeneratorDialog'
import { Button } from './ui/button'
import {
  ChevronDown,
  ChevronRight,
  Table2,
  RefreshCw,
  ArrowUpDown,
  Settings2,
  Wand2,
  Search,
  X,
  Bot,
  Check
} from 'lucide-react'
import { formatDiffForAI } from '@/lib/schema-export'

interface TableDiffListProps {
  result: DiffResult
  leftTarget: CompareTarget
  rightTarget: CompareTarget
  connections: Connection[]
  onReset: () => void
}

const STATUS_CONFIG = {
  same: {
    label: '相同',
    rowClass: 'border-l-2 border-l-green-400',
    labelClass: 'text-green-600 bg-green-50 border-green-200',
    iconClass: 'text-green-500'
  },
  modified: {
    label: '有差异',
    rowClass: 'border-l-2 border-l-amber-400',
    labelClass: 'text-amber-700 bg-amber-50 border-amber-200',
    iconClass: 'text-amber-500'
  },
  left_only: {
    label: '仅左侧',
    rowClass: 'border-l-2 border-l-blue-400',
    labelClass: 'text-blue-700 bg-blue-50 border-blue-200',
    iconClass: 'text-blue-500'
  },
  right_only: {
    label: '仅右侧',
    rowClass: 'border-l-2 border-l-purple-400',
    labelClass: 'text-purple-700 bg-purple-50 border-purple-200',
    iconClass: 'text-purple-500'
  }
}

export function TableDiffList({
  result,
  leftTarget,
  rightTarget,
  connections,
  onReset
}: TableDiffListProps) {
  const [filter, setFilter] = useState<DiffFilter>('different')
  const [search, setSearch] = useState('')
  const [copiedDiff, setCopiedDiff] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    result.tables.forEach((t) => {
      if (t.status !== 'same') s.add(t.name)
    })
    return s
  })

  const leftConn = connections.find((c) => c.id === leftTarget.connectionId)
  const rightConn = connections.find((c) => c.id === rightTarget.connectionId)
  const leftLabel = `${leftConn?.name ?? ''} / ${leftTarget.database}`
  const rightLabel = `${rightConn?.name ?? ''} / ${rightTarget.database}`

  const filtered = useMemo(() => {
    switch (filter) {
      case 'different':
        return result.tables.filter(
          (t) => t.status === 'modified' || t.status === 'left_only' || t.status === 'right_only'
        )
      case 'left_only':
        return result.tables.filter((t) => t.status === 'left_only')
      case 'right_only':
        return result.tables.filter((t) => t.status === 'right_only')
      case 'same':
        return result.tables.filter((t) => t.status === 'same')
      case 'field_diff':
        return result.tables.filter(
          (t) => t.status === 'modified' && t.columns.some((c) => c.status !== 'same')
        )
      case 'column_missing':
        return result.tables.filter(
          (t) => t.status === 'modified' && t.columns.some((c) => c.status === 'left_only' || c.status === 'right_only')
        )
      case 'type_diff':
        return result.tables.filter(
          (t) => t.status === 'modified' && t.columns.some((c) => c.changedFields.includes('类型'))
        )
      case 'charset_diff':
        return result.tables.filter(
          (t) =>
            t.status === 'modified' &&
            (t.columns.some((c) => c.changedFields.includes('字符集') || c.changedFields.includes('排序规则')) ||
              t.metaDiffs.some((d) => d.field === 'charset' || d.field === 'collation'))
        )
      case 'index_diff':
        return result.tables.filter(
          (t) => t.status === 'modified' && t.indexes.some((i) => i.status !== 'same')
        )
      default:
        return result.tables
    }
  }, [result.tables, filter])

  const displayTables = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((t) => t.name.toLowerCase().includes(q))
  }, [filtered, search])

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(displayTables.map((t) => t.name)))
  const collapseAll = () => setExpanded(new Set())

  const handleExportDiff = async () => {
    const text = formatDiffForAI(result.tables, leftLabel, rightLabel, result.summary)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedDiff(true)
    setTimeout(() => setCopiedDiff(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部对比信息栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4 text-sm min-w-0">
          <span className="flex items-center gap-1.5 font-medium text-blue-700 min-w-0">
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            <span className="truncate max-w-[200px]" title={leftLabel}>{leftLabel}</span>
          </span>
          <span className="text-muted-foreground shrink-0">vs</span>
          <span className="flex items-center gap-1.5 font-medium text-purple-700 min-w-0">
            <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
            <span className="truncate max-w-[200px]" title={rightLabel}>{rightLabel}</span>
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onReset} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" />
          重新对比
        </Button>
      </div>

      {/* 过滤条 */}
      <DiffSummaryBar
        summary={result.summary}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* 搜索 + 操作栏 */}
      <div className="flex items-center justify-between gap-3">
        {/* 左：搜索框 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="搜索表名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs rounded-md border bg-background outline-none focus:ring-1 focus:ring-primary w-52"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* 右：操作按钮组 */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExportDiff}
            title="导出差异摘要，可直接粘贴给 AI"
          >
            {copiedDiff ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600">已复制</span>
              </>
            ) : (
              <>
                <Bot className="h-3.5 w-3.5" />
                导出差异
              </>
            )}
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>
            全部展开
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>
            全部折叠
          </Button>
        </div>
      </div>

      {/* 表格列表 */}
      <div className="flex flex-col gap-2">
        {displayTables.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            {search.trim() ? `没有匹配"${search}"的表` : '该过滤条件下没有匹配的表'}
          </div>
        ) : (
          displayTables.map((table) => (
            <TableDiffRow
              key={table.name}
              table={table}
              expanded={expanded.has(table.name)}
              onToggle={() => toggleExpand(table.name)}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              leftDb={leftTarget.database}
              rightDb={rightTarget.database}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface TableDiffRowProps {
  table: TableDiff
  expanded: boolean
  onToggle: () => void
  leftLabel: string
  rightLabel: string
  leftDb: string
  rightDb: string
}

function TableDiffRow({ table, expanded, onToggle, leftLabel, rightLabel, leftDb, rightDb }: TableDiffRowProps) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const cfg = STATUS_CONFIG[table.status]
  const diffColCount = table.columns.filter((c) => c.status !== 'same').length
  const diffIdxCount = table.indexes.filter((i) => i.status !== 'same').length
  const metaDiffCount = table.metaDiffs.length

  const badges: string[] = []
  if (diffColCount > 0) badges.push(`${diffColCount}字段`)
  if (diffIdxCount > 0) badges.push(`${diffIdxCount}索引`)
  if (metaDiffCount > 0) badges.push(`${metaDiffCount}属性`)

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${cfg.rowClass}`}>
      <div className="flex items-center">
        <button
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left min-w-0"
          onClick={onToggle}
        >
          <span className="text-muted-foreground shrink-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <Table2 className={`h-4 w-4 shrink-0 ${cfg.iconClass}`} />
          <span className="font-mono font-medium text-sm flex-1 min-w-0 truncate">{table.name}</span>

          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${cfg.labelClass}`}
          >
            {cfg.label}
          </span>

          {table.orderChanged && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-orange-200 bg-orange-50 text-orange-600 text-xs shrink-0" title="字段顺序不一致">
              <ArrowUpDown className="h-3 w-3" />
              顺序不同
            </span>
          )}

          {table.status === 'modified' && badges.length > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {badges.join(' · ')} 差异
            </span>
          )}
          {(table.status === 'left_only' || table.status === 'right_only') && (
            <span className="text-xs text-muted-foreground shrink-0">
              {table.columns.length} 个字段
            </span>
          )}
          {table.status === 'same' && (
            <span className="text-xs text-muted-foreground shrink-0">
              {table.columns.length} 个字段，完全相同
            </span>
          )}
        </button>

        {/* 生成 SQL 按钮（仅非 same 表） */}
        {table.status !== 'same' && (
          <button
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-md text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors font-medium"
            onClick={(e) => { e.stopPropagation(); setSqlOpen(true) }}
            title="生成同步 SQL"
          >
            <Wand2 className="h-3.5 w-3.5" />
            生成 SQL
          </button>
        )}
      </div>

      <SqlGeneratorDialog
        open={sqlOpen}
        onClose={() => setSqlOpen(false)}
        table={table}
        leftDb={leftDb}
        rightDb={rightDb}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
      />

      {expanded && (
        <>
          {(table.status === 'left_only' || table.status === 'right_only') ? (
            <TableOnlyRow table={table} leftLabel={leftLabel} rightLabel={rightLabel} />
          ) : (
            <>
              {/* 表元信息差异 */}
              {table.metaDiffs.length > 0 && (
                <TableMetaDiffSection diffs={table.metaDiffs} leftLabel={leftLabel} rightLabel={rightLabel} />
              )}

              {/* 字段对比 */}
              <ColumnDiffTable
                columns={table.columns}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
                orderChanged={table.orderChanged}
              />

              {/* 索引对比 */}
              <IndexDiffTable
                indexes={table.indexes}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

function TableMetaDiffSection({
  diffs,
  leftLabel,
  rightLabel
}: {
  diffs: import('@/types').TableMetaDiff[]
  leftLabel: string
  rightLabel: string
}) {
  return (
    <div className="border-t">
      <div className="flex items-center gap-2 px-8 py-2 bg-amber-50/50 border-b">
        <Settings2 className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-xs font-medium text-amber-700">
          表属性差异（{diffs.length} 项）
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th className="text-left py-2 pl-8 pr-2 font-medium text-muted-foreground w-[140px]">属性</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                <span className="text-blue-600">{leftLabel}</span>
              </th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                <span className="text-purple-600">{rightLabel}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.field} className="border-b last:border-0 bg-amber-50/40">
                <td className="py-2 pl-8 pr-2 font-medium text-foreground">{d.label}</td>
                <td className="py-2 px-3">
                  <span className="font-mono bg-amber-100 text-amber-900 rounded px-1">
                    {d.left || <span className="italic text-muted-foreground">（空）</span>}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className="font-mono bg-amber-100 text-amber-900 rounded px-1">
                    {d.right || <span className="italic text-muted-foreground">（空）</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TableOnlyRow({
  table,
  leftLabel,
  rightLabel
}: {
  table: TableDiff
  leftLabel: string
  rightLabel: string
}) {
  const isLeft = table.status === 'left_only'

  return (
    <div className="border-t grid grid-cols-2 divide-x text-sm">
      <div className={`px-6 py-4 ${isLeft ? 'bg-blue-50/50' : 'bg-muted/20'}`}>
        {isLeft ? (
          <div>
            <div className="text-xs text-blue-600 font-medium mb-2">{leftLabel}</div>
            <div className="font-mono text-sm font-medium">{table.name}</div>
            <div className="mt-2 flex flex-col gap-1">
              {table.columns.slice(0, 8).map((c) => (
                <div key={c.name} className="text-xs text-muted-foreground font-mono">
                  {c.name} <span className="text-muted-foreground/70">{c.left?.type}</span>
                  {c.left?.key === 'PRI' && <span className="ml-1 text-amber-600 font-semibold">PK</span>}
                </div>
              ))}
              {table.columns.length > 8 && (
                <div className="text-xs text-muted-foreground">
                  ...还有 {table.columns.length - 8} 个字段
                </div>
              )}
            </div>
          </div>
        ) : (
          <MissingTablePlaceholder />
        )}
      </div>
      <div className={`px-6 py-4 ${!isLeft ? 'bg-purple-50/50' : 'bg-muted/20'}`}>
        {!isLeft ? (
          <div>
            <div className="text-xs text-purple-600 font-medium mb-2">{rightLabel}</div>
            <div className="font-mono text-sm font-medium">{table.name}</div>
            <div className="mt-2 flex flex-col gap-1">
              {table.columns.slice(0, 8).map((c) => (
                <div key={c.name} className="text-xs text-muted-foreground font-mono">
                  {c.name} <span className="text-muted-foreground/70">{c.right?.type}</span>
                  {c.right?.key === 'PRI' && <span className="ml-1 text-amber-600 font-semibold">PK</span>}
                </div>
              ))}
              {table.columns.length > 8 && (
                <div className="text-xs text-muted-foreground">
                  ...还有 {table.columns.length - 8} 个字段
                </div>
              )}
            </div>
          </div>
        ) : (
          <MissingTablePlaceholder />
        )}
      </div>
    </div>
  )
}

function MissingTablePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-4 gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground/50">
        <div className="h-px w-8 bg-muted-foreground/30" />
        <span className="text-xs italic">该数据库中不存在此表</span>
        <div className="h-px w-8 bg-muted-foreground/30" />
      </div>
    </div>
  )
}
