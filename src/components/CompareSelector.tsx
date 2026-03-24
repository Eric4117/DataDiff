import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { RecentShortcuts } from './RecentShortcuts'
import type { Connection, CompareTarget, Shortcut } from '@/types'
import { ArrowLeftRight, Loader2, Database, AlertCircle } from 'lucide-react'

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
}

export function CompareSelector({ connections, onCompare, comparing, initialPreset }: CompareSelectorProps) {
  const [left, setLeft] = useState<SideState>({ ...defaultSide })
  const [right, setRight] = useState<SideState>({ ...defaultSide })
  const presetApplied = React.useRef(false)
  const [recentShortcuts, setRecentShortcuts] = useState<Shortcut[]>([])

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
    onCompare(s.compare.left, s.compare.right)
  }

  // 收到快捷操作预填时，自动加载数据库列表并触发对比
  useEffect(() => {
    if (!initialPreset || presetApplied.current) return
    presetApplied.current = true

    const applyPreset = async () => {
      const [leftDbs, rightDbs] = await Promise.all([
        window.api.schema.databases(initialPreset.left.connectionId).catch(() => [] as string[]),
        window.api.schema.databases(initialPreset.right.connectionId).catch(() => [] as string[])
      ])
      setLeft({ connectionId: initialPreset.left.connectionId, database: initialPreset.left.database, databases: leftDbs, loading: false, error: null })
      setRight({ connectionId: initialPreset.right.connectionId, database: initialPreset.right.database, databases: rightDbs, loading: false, error: null })
      onCompare(initialPreset.left, initialPreset.right)
    }
    applyPreset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPreset])

  const loadDatabases = async (side: 'left' | 'right', connectionId: string) => {
    const setter = side === 'left' ? setLeft : setRight
    setter((prev) => ({ ...prev, connectionId, database: '', databases: [], loading: true, error: null }))
    try {
      const dbs = await window.api.schema.databases(connectionId)
      setter((prev) => ({ ...prev, databases: dbs, loading: false }))
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
    onCompare(
      { connectionId: left.connectionId, database: left.database },
      { connectionId: right.connectionId, database: right.database }
    )
  }

  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? ''

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-medium">请先在"数据源"页面添加数据库连接</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 最近对比历史 */}
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

      <div className="flex justify-center pt-2">
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

      {left.database && right.database && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded bg-muted font-mono">
            {connName(left.connectionId)} / {left.database}
          </span>
          <ArrowLeftRight className="h-3 w-3" />
          <span className="px-2 py-1 rounded bg-muted font-mono">
            {connName(right.connectionId)} / {right.database}
          </span>
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
}

function SidePanel({
  title,
  state,
  connections,
  onConnectionChange,
  onDatabaseChange
}: SidePanelProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{title}</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">数据源</Label>
        <Select value={state.connectionId} onValueChange={onConnectionChange}>
          <SelectTrigger>
            <SelectValue placeholder="选择数据源..." />
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({c.user}@{c.host})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">数据库</Label>
        {state.loading ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中...
          </div>
        ) : state.error ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-destructive/50 text-sm text-destructive bg-destructive/5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{state.error}</span>
          </div>
        ) : (
          <Select
            value={state.database}
            onValueChange={onDatabaseChange}
            disabled={!state.connectionId || state.databases.length === 0}
          >
            <SelectTrigger>
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
