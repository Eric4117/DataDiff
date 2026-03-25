import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { RecentShortcuts } from './RecentShortcuts'
import type { Connection, CompareTarget, Shortcut } from '@/types'
import { ArrowLeftRight, Loader2, Database, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

interface SideState {
  connectionId: string
  database: string
  databases: string[]
  loading: boolean
  error: string | null
}

const defaultSide: SideState = {
  connectionId: '',
  database: '',
  databases: [],
  loading: false,
  error: null
}

interface CompareSelectorProps {
  connections: Connection[]
  onCompare: (left: CompareTarget, right: CompareTarget) => void
  comparing: boolean
  initialPreset?: { left: CompareTarget; right: CompareTarget }
  /** 侧栏纵向紧凑布局，不展示 RecentShortcuts */
  compact?: boolean
  /** 主区点击「最近」时递增，用于相同预填仍能重新触发对比 */
  presetNonce?: number
}

export function CompareSelector({
  connections,
  onCompare,
  comparing,
  initialPreset,
  compact = false,
  presetNonce = 0
}: CompareSelectorProps) {
  const [left, setLeft] = useState<SideState>({ ...defaultSide })
  const [right, setRight] = useState<SideState>({ ...defaultSide })
  const [recentShortcuts, setRecentShortcuts] = useState<Shortcut[]>([])
  /** 与结构视图一致：有预填或两侧已选库后默认折叠 */
  const [selectorOpen, setSelectorOpen] = useState(() => !initialPreset)
  const prevBothSelectedRef = useRef(false)

  useEffect(() => {
    window.api.shortcuts.list().then((list) =>
      setRecentShortcuts(list.filter((s) => s.type === 'compare').slice(0, 6))
    )
  }, [])

  const handleApplyShortcut = async (s: Shortcut) => {
    if (!s.compare) return
    const [leftDbs, rightDbs] = await Promise.all([
      window.api.schema.databases(s.compare.left.connectionId).catch(() => [] as string[]),
      window.api.schema.databases(s.compare.right.connectionId).catch(() => [] as string[])
    ])
    setLeft({ connectionId: s.compare.left.connectionId, database: s.compare.left.database, databases: leftDbs, loading: false, error: null })
    setRight({ connectionId: s.compare.right.connectionId, database: s.compare.right.database, databases: rightDbs, loading: false, error: null })
    setSelectorOpen(false)
    onCompare(s.compare.left, s.compare.right)
  }

  // 首页 / 主区快捷方式预填：依赖变化时重新应用，便于侧栏与主区同步
  useEffect(() => {
    if (!initialPreset) return
    let cancelled = false
    const applyPreset = async () => {
      const [leftDbs, rightDbs] = await Promise.all([
        window.api.schema.databases(initialPreset.left.connectionId).catch(() => [] as string[]),
        window.api.schema.databases(initialPreset.right.connectionId).catch(() => [] as string[])
      ])
      if (cancelled) return
      setLeft({
        connectionId: initialPreset.left.connectionId,
        database: initialPreset.left.database,
        databases: leftDbs,
        loading: false,
        error: null
      })
      setRight({
        connectionId: initialPreset.right.connectionId,
        database: initialPreset.right.database,
        databases: rightDbs,
        loading: false,
        error: null
      })
      setSelectorOpen(false)
      onCompare(initialPreset.left, initialPreset.right)
    }
    applyPreset()
    return () => {
      cancelled = true
    }
    // onCompare 由父组件传入，避免未 memo 时造成重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialPreset?.left.connectionId,
    initialPreset?.left.database,
    initialPreset?.right.connectionId,
    initialPreset?.right.database,
    presetNonce
  ])

  // 从「两侧已选齐」退回到未选齐时自动展开，便于改选；选齐后不自动折叠（避免挡住「开始对比」）
  useEffect(() => {
    const complete =
      Boolean(left.connectionId && left.database && right.connectionId && right.database)
    if (!complete && prevBothSelectedRef.current) {
      setSelectorOpen(true)
    }
    prevBothSelectedRef.current = complete
  }, [left.connectionId, left.database, right.connectionId, right.database])

  const loadDatabases = async (side: 'left' | 'right', connectionId: string) => {
    const setter = side === 'left' ? setLeft : setRight
    setter((prev) => ({ ...prev, connectionId, database: '', databases: [], loading: true, error: null }))
    try {
      const dbs = await window.api.schema.databases(connectionId)
      setter((prev) => ({
        ...prev,
        databases: dbs,
        loading: false,
        database: dbs.length === 1 ? dbs[0] : ''
      }))
    } catch (err) {
      setter((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '加载失败'
      }))
    }
  }

  const handleConnectionChange = (side: 'left' | 'right', connId: string) => {
    if (connId) loadDatabases(side, connId)
    else {
      const setter = side === 'left' ? setLeft : setRight
      setter({ ...defaultSide })
    }
  }

  const handleDatabaseChange = (side: 'left' | 'right', db: string) => {
    const setter = side === 'left' ? setLeft : setRight
    setter((prev) => ({ ...prev, database: db }))
  }

  const canCompare =
    !comparing &&
    left.connectionId &&
    left.database &&
    right.connectionId &&
    right.database

  const handleCompare = () => {
    if (!canCompare) return
    setSelectorOpen(false)
    onCompare(
      { connectionId: left.connectionId, database: left.database },
      { connectionId: right.connectionId, database: right.database }
    )
  }

  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? ''

  if (connections.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6 px-2' : 'py-12'}`}
      >
        <AlertCircle className={`text-muted-foreground/50 mb-2 ${compact ? 'h-8 w-8' : 'h-10 w-10 mb-3'}`} />
        <p className={`text-muted-foreground font-medium ${compact ? 'text-xs' : ''}`}>
          请先在「数据源」添加连接
        </p>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-3 px-2 pb-3 min-h-0">
        <SidePanel
          title="源数据库"
          side="left"
          state={left}
          connections={connections}
          onConnectionChange={(id) => handleConnectionChange('left', id)}
          onDatabaseChange={(db) => handleDatabaseChange('left', db)}
          compact
        />

        <div className="flex flex-col items-center justify-center gap-1 py-0.5">
          <div className="w-px h-3 bg-border" />
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <div className="w-px h-3 bg-border" />
        </div>

        <SidePanel
          title="目标数据库"
          side="right"
          state={right}
          connections={connections}
          onConnectionChange={(id) => handleConnectionChange('right', id)}
          onDatabaseChange={(db) => handleDatabaseChange('right', db)}
          compact
        />

        <Button
          size="sm"
          onClick={handleCompare}
          disabled={!canCompare}
          className="w-full shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {comparing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              对比中…
            </>
          ) : (
            <>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              开始对比
            </>
          )}
        </Button>

        {left.database && right.database && (
          <p className="text-[10px] text-muted-foreground leading-snug text-center font-mono px-1 break-all">
            {connName(left.connectionId)} / {left.database}
            <span className="inline-block mx-1">↔</span>
            {connName(right.connectionId)} / {right.database}
          </p>
        )}
      </div>
    )
  }

  const selectionSummary =
    left.database && right.database && left.connectionId && right.connectionId ? (
      <span className="text-xs text-muted-foreground font-mono ml-1 truncate">
        {connName(left.connectionId)} / {left.database}
        <span className="mx-1 inline-block">↔</span>
        {connName(right.connectionId)} / {right.database}
      </span>
    ) : null

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setSelectorOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium shrink-0">选择对比数据库</span>
          {!selectorOpen && selectionSummary}
        </div>
        {selectorOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {selectorOpen && (
        <div className="border-t px-4 py-4 flex flex-col gap-5">
          <RecentShortcuts
            shortcuts={recentShortcuts}
            connections={connections}
            onLaunch={handleApplyShortcut}
            filterType="compare"
            maxItems={4}
          />

          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <SidePanel
              title="左侧数据库"
              side="left"
              state={left}
              connections={connections}
              onConnectionChange={(id) => handleConnectionChange('left', id)}
              onDatabaseChange={(db) => handleDatabaseChange('left', db)}
            />

            <div className="flex flex-col items-center justify-center pt-8 gap-2">
              <div className="w-px h-6 bg-border" />
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              <div className="w-px h-6 bg-border" />
            </div>

            <SidePanel
              title="右侧数据库"
              side="right"
              state={right}
              connections={connections}
              onConnectionChange={(id) => handleConnectionChange('right', id)}
              onDatabaseChange={(db) => handleDatabaseChange('right', db)}
            />
          </div>

          <div className="flex justify-center pt-1">
            <Button
              size="lg"
              onClick={handleCompare}
              disabled={!canCompare}
              className="min-w-[160px]"
            >
              {comparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在对比...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-4 w-4" />
                  开始对比
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SidePanelProps {
  title: string
  side: 'left' | 'right'
  state: SideState
  connections: Connection[]
  onConnectionChange: (id: string) => void
  onDatabaseChange: (db: string) => void
  compact?: boolean
}

function SidePanel({
  title,
  state,
  connections,
  onConnectionChange,
  onDatabaseChange,
  compact = false
}: SidePanelProps) {
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
  return (
    <div
      className={`rounded-lg border bg-card space-y-2 ${compact ? 'p-2.5' : 'p-4 space-y-3'}`}
      style={noDrag}
    >
      <div className="flex items-center gap-1.5">
        <Database className={`text-primary shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
        <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{title}</span>
      </div>

      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <Label className={`text-muted-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}>数据源</Label>
        <Select value={state.connectionId} onValueChange={onConnectionChange}>
          <SelectTrigger className={compact ? 'h-8 text-xs' : ''}>
            <SelectValue placeholder="选择数据源..." />
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                <span className="ml-1 text-xs text-muted-foreground">
                  (
                  {(c.type ?? 'mysql') === 'sqlite'
                    ? (c.filePath || 'SQLite').slice(0, 40) + (c.filePath && c.filePath.length > 40 ? '…' : '')
                    : `${c.user}@${c.host}`}
                  )
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <Label className={`text-muted-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}>数据库</Label>
        {state.loading ? (
          <div
            className={`flex items-center gap-2 px-2 rounded-md border text-muted-foreground ${
              compact ? 'h-8 text-xs' : 'h-9 px-3 text-sm'
            }`}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中...
          </div>
        ) : state.error ? (
          <div
            className={`flex items-center gap-2 rounded-md border border-destructive/50 text-destructive bg-destructive/5 ${
              compact ? 'h-8 px-2 text-[11px]' : 'h-9 px-3 text-sm'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{state.error}</span>
          </div>
        ) : (
          <Select
            value={state.database}
            onValueChange={onDatabaseChange}
            disabled={!state.connectionId || state.databases.length === 0}
          >
            <SelectTrigger className={compact ? 'h-8 text-xs' : ''}>
              <SelectValue
                placeholder={
                  !state.connectionId ? '请先选择数据源' : state.databases.length === 0 ? '无可用数据库' : '选择数据库...'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {state.databases.map((db) => (
                <SelectItem key={db} value={db}>
                  {db}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
