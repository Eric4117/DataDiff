import React from 'react'
import type { DiffSummary, DiffFilter } from '@/types'

interface DiffSummaryBarProps {
  summary: DiffSummary
  filter: DiffFilter
  onFilterChange: (f: DiffFilter) => void
  /** 侧栏纵向布局，用于对比 tab 左侧 */
  variant?: 'default' | 'sidebar'
}

interface FilterBtn {
  key: DiffFilter
  label: string
  count: number
  activeClass: string
  dotClass: string
}

export function DiffSummaryBar({
  summary,
  filter,
  onFilterChange,
  variant = 'default'
}: DiffSummaryBarProps) {
  const mainFilters: FilterBtn[] = [
    {
      key: 'all',
      label: '全部',
      count: summary.total,
      activeClass: 'bg-slate-100 border-slate-300 text-slate-900',
      dotClass: 'bg-slate-400'
    },
    {
      key: 'different',
      label: '有差异',
      count: summary.modified + summary.leftOnly + summary.rightOnly,
      activeClass: 'bg-amber-50 border-amber-300 text-amber-900',
      dotClass: 'bg-amber-500'
    },
    {
      key: 'left_only',
      label: '仅左侧',
      count: summary.leftOnly,
      activeClass: 'bg-blue-50 border-blue-300 text-blue-900',
      dotClass: 'bg-blue-500'
    },
    {
      key: 'right_only',
      label: '仅右侧',
      count: summary.rightOnly,
      activeClass: 'bg-purple-50 border-purple-300 text-purple-900',
      dotClass: 'bg-purple-500'
    },
    {
      key: 'same',
      label: '相同',
      count: summary.same,
      activeClass: 'bg-green-50 border-green-300 text-green-900',
      dotClass: 'bg-green-500'
    }
  ]

  const subFilters: FilterBtn[] = [
    {
      key: 'field_diff',
      label: '字段差异',
      count: summary.fieldDiff,
      activeClass: 'bg-orange-50 border-orange-300 text-orange-900',
      dotClass: 'bg-orange-400'
    },
    {
      key: 'column_missing',
      label: '字段缺失',
      count: summary.columnMissing,
      activeClass: 'bg-red-50 border-red-300 text-red-900',
      dotClass: 'bg-red-400'
    },
    {
      key: 'type_diff',
      label: '类型/长度',
      count: summary.typeDiff,
      activeClass: 'bg-rose-50 border-rose-300 text-rose-900',
      dotClass: 'bg-rose-400'
    },
    {
      key: 'charset_diff',
      label: '字符集',
      count: summary.charsetDiff,
      activeClass: 'bg-sky-50 border-sky-300 text-sky-900',
      dotClass: 'bg-sky-400'
    },
    {
      key: 'index_diff',
      label: '索引差异',
      count: summary.indexDiff,
      activeClass: 'bg-violet-50 border-violet-300 text-violet-900',
      dotClass: 'bg-violet-400'
    }
  ]

  const renderBtn = (f: FilterBtn) => (
    <button
      key={f.key}
      type="button"
      onClick={() => onFilterChange(f.key)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        filter === f.key
          ? f.activeClass + ' shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${f.dotClass}`} />
      {f.label}
      <span className={`ml-0.5 tabular-nums font-bold ${filter === f.key ? '' : 'text-foreground'}`}>
        {f.count}
      </span>
    </button>
  )

  if (variant === 'sidebar') {
    const renderSidebarBtn = (f: FilterBtn) => (
      <button
        key={f.key}
        type="button"
        onClick={() => onFilterChange(f.key)}
        className={`flex w-full items-center gap-2 px-2 py-1.5 rounded-md border text-left text-[11px] font-medium transition-colors ${
          filter === f.key
            ? `${f.activeClass} shadow-sm`
            : 'border-transparent bg-transparent text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${f.dotClass}`} />
        <span className="truncate flex-1 min-w-0">{f.label}</span>
        <span className={`tabular-nums font-bold shrink-0 ${filter === f.key ? '' : 'text-foreground'}`}>
          {f.count}
        </span>
      </button>
    )

    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">
          表筛选
        </div>
        <div className="flex flex-col gap-1">{mainFilters.map(renderSidebarBtn)}</div>
        <div className="pt-2 mt-0.5 border-t border-sidebar-border/80">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5 mb-1">
            差异细分
          </div>
          <div className="flex flex-col gap-1">{subFilters.map(renderSidebarBtn)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 主过滤 */}
      <div className="flex items-center gap-2 flex-wrap">
        {mainFilters.map(renderBtn)}
      </div>
      {/* 差异细分（仅 modified 表的子分组） */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground shrink-0">差异细分</span>
        {subFilters.map(renderBtn)}
      </div>
    </div>
  )
}
