/**
 * 精简版快捷操作卡片列表，用于对比视图和结构视图内嵌"最近"区域。
 * 参考 HomePage 的 ShortcutCard 样式，去掉重命名/删除操作，点击整张卡片即启动。
 */
import React from 'react'
import type { Shortcut, Connection } from '@/types'
import { GitCompare, LayoutGrid, Clock, ArrowRight } from 'lucide-react'

interface RecentShortcutsProps {
  shortcuts: Shortcut[]
  connections: Connection[]
  onLaunch: (s: Shortcut) => void
  /** 显示数量上限，默认 4 */
  maxItems?: number
  /** 过滤类型，不传则显示全部 */
  filterType?: 'compare' | 'structure'
}

export function RecentShortcuts({
  shortcuts,
  connections,
  onLaunch,
  maxItems = 4,
  filterType
}: RecentShortcutsProps) {
  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? id

  const items = (filterType ? shortcuts.filter((s) => s.type === filterType) : shortcuts).slice(0, maxItems)

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">最近</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((s) => (
          <MiniShortcutCard
            key={s.id}
            shortcut={s}
            connName={connName}
            onLaunch={() => onLaunch(s)}
          />
        ))}
      </div>
    </div>
  )
}

interface MiniShortcutCardProps {
  shortcut: Shortcut
  connName: (id: string) => string
  onLaunch: () => void
}

function MiniShortcutCard({ shortcut, connName, onLaunch }: MiniShortcutCardProps) {
  const isCompare = shortcut.type === 'compare'

  const icon = isCompare
    ? <GitCompare className="h-3.5 w-3.5 text-amber-600 shrink-0" />
    : <LayoutGrid className="h-3.5 w-3.5 text-blue-600 shrink-0" />

  const typeBadge = isCompare
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-blue-700 bg-blue-50 border-blue-200'

  const typeLabel = isCompare ? '对比' : '结构'

  const detail = isCompare && shortcut.compare
    ? `${connName(shortcut.compare.left.connectionId)} / ${shortcut.compare.left.database}  →  ${connName(shortcut.compare.right.connectionId)} / ${shortcut.compare.right.database}`
    : shortcut.structure
      ? `${connName(shortcut.structure.connectionId)} / ${shortcut.structure.database}`
      : ''

  return (
    <button
      onClick={onLaunch}
      className="group rounded-lg border bg-card p-3 text-left hover:border-primary/60 hover:bg-muted/20 transition-colors flex flex-col gap-1.5 w-full"
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-xs font-medium truncate flex-1 min-w-0">{shortcut.name}</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${typeBadge}`}>
          {typeLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <p className="text-[11px] text-muted-foreground font-mono truncate flex-1 min-w-0" title={detail}>
          {detail}
        </p>
        <ArrowRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary shrink-0 transition-colors" />
      </div>
    </button>
  )
}
