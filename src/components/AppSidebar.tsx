import React from 'react'
import { Database, GitCompare, Home, LayoutGrid } from 'lucide-react'

export type SidebarTab = 'home' | 'compare' | 'structure' | 'connections'

const isMac = typeof window !== 'undefined' && window.platform === 'darwin'

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties

interface AppSidebarProps {
  tab: SidebarTab
  onTabChange: (t: SidebarTab) => void
  connectionsCount: number
  /** 结构 tab 且已有数据源时：侧栏项目列表；对比选择在主内容区，此处不传 */
  structurePanel: React.ReactNode | null
  /** 对比 tab 且已有对比结果时：左侧表筛选 / 差异细分 */
  compareFiltersPanel: React.ReactNode | null
}

export function AppSidebar({
  tab,
  onTabChange,
  connectionsCount,
  structurePanel,
  compareFiltersPanel
}: AppSidebarProps) {
  const showStructureContext = tab === 'structure' && structurePanel != null
  const showCompareFilters = tab === 'compare' && compareFiltersPanel != null

  return (
    <aside className="w-[220px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-screen select-none">
      {/* macOS 交通灯区域：可拖动窗口 */}
      {isMac ? (
        <div className="h-11 shrink-0" style={drag} aria-hidden />
      ) : (
        <div className="h-2 shrink-0" style={drag} aria-hidden />
      )}

      {/* Logo */}
      <div className="px-3 py-2.5 border-b border-sidebar-border shrink-0" style={drag}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <GitCompare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight">DataDiff</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              多数据库结构对比
            </div>
          </div>
        </div>
      </div>

      {/* 垂直导航 */}
      <nav className="p-2 space-y-0.5 shrink-0 border-b border-sidebar-border" style={noDrag}>
        <SidebarNavItem
          active={tab === 'home'}
          onClick={() => onTabChange('home')}
          icon={<Home className="h-4 w-4" />}
          label="首页"
        />
        <SidebarNavItem
          active={tab === 'compare'}
          onClick={() => onTabChange('compare')}
          icon={<GitCompare className="h-4 w-4" />}
          label="对比"
        />
        <SidebarNavItem
          active={tab === 'structure'}
          onClick={() => onTabChange('structure')}
          icon={<LayoutGrid className="h-4 w-4" />}
          label="结构"
        />
        <SidebarNavItem
          active={tab === 'connections'}
          onClick={() => onTabChange('connections')}
          icon={<Database className="h-4 w-4" />}
          label="数据源"
          badge={connectionsCount > 0 ? connectionsCount : undefined}
        />
      </nav>

      {showStructureContext && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-t border-sidebar-border">
          <div className="flex flex-1 flex-col min-h-0 overflow-hidden">{structurePanel}</div>
        </div>
      )}

      {showCompareFilters && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-t border-sidebar-border">
          <div className="px-2 py-3 overflow-y-auto flex-1 min-h-0 text-sidebar-foreground">
            {compareFiltersPanel}
          </div>
        </div>
      )}
    </aside>
  )
}

function SidebarNavItem({
  active,
  onClick,
  icon,
  label,
  badge
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors text-left ${
        active
          ? 'bg-primary/14 text-primary font-semibold'
          : 'text-muted-foreground font-medium hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
      }`}
    >
      <span className={active ? 'shrink-0 text-primary' : 'shrink-0 opacity-90'}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null && (
        <span
          className={`text-[11px] font-bold tabular-nums shrink-0 ${
            active ? 'text-primary/70' : 'text-muted-foreground'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
