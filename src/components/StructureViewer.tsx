import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { Connection, TableStructure, ColumnInfo, IndexInfo, TableMeta, CompareTarget, Project } from '@/types'
import {
  Database, Loader2, AlertCircle, ChevronDown, ChevronRight, Table2, Key, Settings2,
  Copy, Check, Search, X, Bot, GitFork, FolderPlus, FolderOpen,
  Plus, Pencil, Trash2, Layers, LogOut
} from 'lucide-react'
import type { Shortcut } from '@/types'
import { RecentShortcuts } from './RecentShortcuts'
import { formatFullSchemaForAI, formatERDForAI } from '@/lib/schema-export'

interface StructureViewerProps {
  connections: Connection[]
  initialTarget?: CompareTarget
  onStructureLoaded?: (connId: string, database: string) => void
  activeProjectId?: string | null
  activeProject?: Project | null
  onProjectsChange?: () => void
}

export function StructureViewer({
  connections,
  initialTarget,
  onStructureLoaded,
  activeProjectId = null,
  activeProject = null,
  onProjectsChange
}: StructureViewerProps) {
  const [connectionId, setConnectionId] = useState(initialTarget?.connectionId ?? '')
  const [database, setDatabase] = useState(initialTarget?.database ?? '')
  const [databases, setDatabases] = useState<string[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  // 选择器面板默认折叠（有 initialTarget 时展开，加载完成后折叠）
  const [selectorOpen, setSelectorOpen] = useState(!initialTarget)
  const [loadingStruct, setLoadingStruct] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [structure, setStructure] = useState<TableStructure[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const initializedRef = useRef(false)
  // 结构数据缓存：connId::db → TableStructure[]，避免切换项目时重复请求
  const structureCacheRef = useRef<Map<string, TableStructure[]>>(new Map())
  // 数据库列表缓存：connId → string[]
  const databasesCacheRef = useRef<Map<string, string[]>>(new Map())

  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedERD, setCopiedERD] = useState(false)

  // 结构视图历史记录
  const [structureHistory, setStructureHistory] = useState<Shortcut[]>([])
  useEffect(() => {
    window.api.shortcuts.list().then((list) =>
      setStructureHistory(list.filter((s) => s.type === 'structure').slice(0, 6))
    )
  }, [])

  const handleApplyHistory = async (s: Shortcut) => {
    if (!s.structure) return
    const { connectionId: connId, database: db } = s.structure
    setConnectionId(connId)
    setDatabase(db)
    setLoadError(null)
    // 数据库列表与结构并行加载
    if (!databasesCacheRef.current.has(connId)) {
      window.api.schema.databases(connId)
        .then(dbs => { databasesCacheRef.current.set(connId, dbs); setDatabases(dbs) })
        .catch(() => {})
    } else {
      setDatabases(databasesCacheRef.current.get(connId)!)
    }
    doLoadStructure(connId, db)
  }

  // 切换项目时，若当前库与项目表不匹配，自动切换到项目所在数据库
  const prevProjectIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prevId = prevProjectIdRef.current
    prevProjectIdRef.current = activeProject?.id ?? null

    if (!activeProject || activeProject.tables.length === 0) return
    if (activeProject.id === prevId) return // 同一项目，非切换操作

    // 当前库已有项目表，无需切换
    const inCurrentDb = activeProject.tables.some(
      (t) => t.connectionId === connectionId && t.database === database
    )
    if (inCurrentDb) return

    // 自动切换到项目第一张表所在的库并加载结构
    const firstTable = activeProject.tables[0]
    const connId = firstTable.connectionId
    const db = firstTable.database
    setConnectionId(connId)
    setDatabase(db)
    setLoadError(null)
    // 数据库列表与结构并行加载
    if (!databasesCacheRef.current.has(connId)) {
      window.api.schema.databases(connId)
        .then(dbs => { databasesCacheRef.current.set(connId, dbs); setDatabases(dbs) })
        .catch(() => {})
    } else {
      setDatabases(databasesCacheRef.current.get(connId)!)
    }
    doLoadStructure(connId, db)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  // 仅"全部表"模式下需要的项目列表（用于 FolderPlus popover）
  const [projects, setProjects] = useState<Project[]>([])
  const refreshLocalProjects = useCallback(async () => {
    const list = await window.api.projects.list()
    setProjects(list)
    onProjectsChange?.()
  }, [onProjectsChange])
  useEffect(() => { refreshLocalProjects() }, [refreshLocalProjects])

  // 当有 initialTarget 时，自动加载数据库列表并触发查看结构
  useEffect(() => {
    if (!initialTarget || initializedRef.current) return
    initializedRef.current = true
    const { connectionId: connId, database: db } = initialTarget
    setConnectionId(connId)
    setDatabase(db)
    if (!databasesCacheRef.current.has(connId)) {
      setLoadingDbs(true)
      window.api.schema.databases(connId)
        .then(dbs => { databasesCacheRef.current.set(connId, dbs); setDatabases(dbs) })
        .catch(() => {})
        .finally(() => setLoadingDbs(false))
    } else {
      setDatabases(databasesCacheRef.current.get(connId)!)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget])

  useEffect(() => {
    if (!initialTarget || !connectionId || !database || structure !== null || loadingStruct) return
    if (connectionId === initialTarget.connectionId && database === initialTarget.database) {
      doLoadStructure(connectionId, database)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, databases])

  const loadDatabases = async (connId: string) => {
    setConnectionId(connId)
    setDatabase('')
    setStructure(null)
    setLoadError(null)
    initializedRef.current = true
    if (!connId) { setDatabases([]); return }
    // 命中缓存直接用
    if (databasesCacheRef.current.has(connId)) {
      setDatabases(databasesCacheRef.current.get(connId)!)
      return
    }
    setLoadingDbs(true)
    try {
      const dbs = await window.api.schema.databases(connId)
      databasesCacheRef.current.set(connId, dbs)
      setDatabases(dbs)
    } catch (err) {
      setDatabases([])
      setLoadError(err instanceof Error ? err.message : '加载失败')
    } finally { setLoadingDbs(false) }
  }

  const doLoadStructure = async (connId: string, db: string, forceRefresh = false) => {
    if (!connId || !db) return
    const cacheKey = `${connId}::${db}`

    // 命中缓存直接渲染，无需发请求
    if (!forceRefresh && structureCacheRef.current.has(cacheKey)) {
      const cached = structureCacheRef.current.get(cacheKey)!
      setStructure(cached)
      setSearch('')
      setExpanded(new Set())
      setSelectorOpen(false)
      return
    }

    setLoadError(null)
    setLoadingStruct(true)
    try {
      const { tables } = await window.api.schema.structure(connId, db)
      structureCacheRef.current.set(cacheKey, tables)
      setStructure(tables)
      setSearch('')
      setExpanded(new Set())
      setSelectorOpen(false)
      onStructureLoaded?.(connId, db)
    } catch (err) {
      setStructure(null)
      setLoadError(err instanceof Error ? err.message : '加载失败')
    } finally { setLoadingStruct(false) }
  }

  // 手动点"查看结构"时强制刷新并更新缓存
  const loadStructure = () => doLoadStructure(connectionId, database, true)

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const connName = connections.find((c) => c.id === connectionId)?.name ?? ''

  // 项目模式：当前库中属于该项目的表名集合
  const projectTableNames = useMemo<Set<string> | null>(() => {
    if (!activeProject) return null
    return new Set(
      activeProject.tables
        .filter((t) => t.connectionId === connectionId && t.database === database)
        .map((t) => t.tableName)
    )
  }, [activeProject, connectionId, database])

  const filteredStructure = useMemo(() => {
    if (!structure) return null
    let result = structure
    if (projectTableNames) result = result.filter((t) => projectTableNames.has(t.name))
    const q = search.trim().toLowerCase()
    if (q) result = result.filter((t) =>
      t.name.toLowerCase().includes(q) || (t.meta.comment && t.meta.comment.toLowerCase().includes(q))
    )
    return result
  }, [structure, search, projectTableNames])

  // 项目模式：未加入当前项目的表
  const unaddedTables = useMemo<TableStructure[]>(() => {
    if (!structure || !projectTableNames) return []
    return structure.filter((t) => !projectTableNames.has(t.name))
  }, [structure, projectTableNames])

  // 项目模式：按 (connectionId, database) 分组，用于多库切换 chip
  const projectDbGroups = useMemo(() => {
    if (!activeProject) return []
    const map = new Map<string, { connectionId: string; database: string; count: number }>()
    for (const t of activeProject.tables) {
      const key = `${t.connectionId}::${t.database}`
      if (!map.has(key)) map.set(key, { connectionId: t.connectionId, database: t.database, count: 0 })
      map.get(key)!.count++
    }
    return Array.from(map.values())
  }, [activeProject])

  const switchToProjectDb = (connId: string, db: string) => {
    setConnectionId(connId)
    setDatabase(db)
    setLoadError(null)
    // 数据库列表与结构并行加载
    if (!databasesCacheRef.current.has(connId)) {
      window.api.schema.databases(connId)
        .then(dbs => { databasesCacheRef.current.set(connId, dbs); setDatabases(dbs) })
        .catch(() => {})
    } else {
      setDatabases(databasesCacheRef.current.get(connId)!)
    }
    doLoadStructure(connId, db)
  }

  const copyText = async (text: string) => {
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
  }

  const handleExportAll = async () => {
    if (!filteredStructure || !database) return
    await copyText(formatFullSchemaForAI(filteredStructure, database))
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const handleExportERD = async () => {
    if (!filteredStructure || !database) return
    await copyText(formatERDForAI(filteredStructure, database))
    setCopiedERD(true)
    setTimeout(() => setCopiedERD(false), 2000)
  }

  const exportAllLabel = activeProject
    ? '项目 Schema'
    : search.trim() ? '导出搜索结果' : '导出全库'

  const exportERDLabel = activeProject
    ? '项目 ER 图'
    : search.trim() ? 'ER 图（筛选）' : '导出 ER 图'

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-medium">请先在"数据源"页面添加数据库连接</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 选择器（可折叠） */}
      <div className="rounded-lg border bg-muted/30 overflow-hidden">
        {/* 折叠头部 */}
        <button
          onClick={() => setSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium">选择数据库</span>
            {connectionId && database && (
              <span className="text-xs text-muted-foreground font-mono ml-1">
                {connections.find((c) => c.id === connectionId)?.name} / {database}
              </span>
            )}
          </div>
          {selectorOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </button>

        {/* 展开内容 */}
        {selectorOpen && (
          <div className="border-t px-4 py-4">
            <div className="flex gap-6 items-start">
              {/* 左侧：表单 */}
              <div className="w-72 shrink-0 flex flex-col gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">数据源</Label>
                  <Select value={connectionId} onValueChange={loadDatabases}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择数据源..." />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          <span className="ml-1 text-xs text-muted-foreground">({c.user}@{c.host})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">数据库</Label>
                  {loadingDbs ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />加载中...
                    </div>
                  ) : (
                    <Select
                      value={database}
                      onValueChange={(v) => { setDatabase(v); setStructure(null) }}
                      disabled={!connectionId || databases.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !connectionId ? '请先选择数据源' : databases.length === 0 ? '无可用数据库' : '选择数据库...'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {databases.map((db) => (
                          <SelectItem key={db} value={db}>{db}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  onClick={loadStructure}
                  disabled={!connectionId || !database || loadingStruct}
                  className="self-start"
                >
                  {loadingStruct
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Table2 className="h-4 w-4" />查看结构</>
                  }
                </Button>
              </div>

              {/* 分隔线 + 右侧：最近查看 */}
              {structureHistory.length > 0 && (
                <>
                  <div className="w-px self-stretch bg-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <RecentShortcuts
                      shortcuts={structureHistory}
                      connections={connections}
                      onLaunch={handleApplyHistory}
                      filterType="structure"
                      maxItems={4}
                    />
                  </div>
                </>
              )}
            </div>

            {loadError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{loadError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 结构列表 */}
      {structure && filteredStructure && (
        <div className="flex flex-col gap-3">
          {/* 信息栏 + 工具栏 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {activeProject ? (
                <>
                  <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="font-medium text-amber-600 shrink-0">{activeProject.name}</span>
                  {projectDbGroups.length > 1 ? (
                    /* 多库：显示可点击的数据库切换 chip */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {projectDbGroups.map((g) => {
                        const isActive = g.connectionId === connectionId && g.database === database
                        const label = `${connections.find((c) => c.id === g.connectionId)?.name ?? g.connectionId} / ${g.database}`
                        return (
                          <button
                            key={`${g.connectionId}::${g.database}`}
                            onClick={() => { if (!isActive) switchToProjectDb(g.connectionId, g.database) }}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              isActive
                                ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                                : 'border-border text-muted-foreground hover:bg-muted/50 cursor-pointer'
                            }`}
                            title={label}
                          >
                            {isActive && <Check className="h-2.5 w-2.5 shrink-0" />}
                            <span className="font-mono truncate max-w-[140px]">{label}</span>
                            <span className="tabular-nums shrink-0">({g.count})</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    /* 单库：原有统计 */
                    <span className="text-muted-foreground">
                      · {filteredStructure.length} 张
                      {activeProject.tables.length !== filteredStructure.length &&
                        ` / 共 ${activeProject.tables.length} 张`}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-mono font-medium text-foreground">{connName} / {database}</span>
                  <span className="text-muted-foreground">· {search.trim()
                    ? `${filteredStructure.length} / ${structure.length} 张表`
                    : `${structure.length} 张表`}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索表名或注释..."
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0"
                onClick={handleExportAll}
                title="导出 Schema，可直接粘贴给 AI"
              >
                {copiedAll ? (
                  <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">已复制</span></>
                ) : (
                  <><Bot className="h-3.5 w-3.5" />{exportAllLabel}</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0"
                onClick={handleExportERD}
                title="导出 Mermaid ER 关系图，可直接粘贴给 AI"
              >
                {copiedERD ? (
                  <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">已复制</span></>
                ) : (
                  <><GitFork className="h-3.5 w-3.5" />{exportERDLabel}</>
                )}
              </Button>
            </div>
          </div>

          {filteredStructure.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {activeProject ? '该项目在当前库中暂无表' : '未找到匹配的表'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredStructure.map((table) => (
                <TableStructureRow
                  key={table.name}
                  table={table}
                  database={database}
                  connectionId={connectionId}
                  expanded={expanded.has(table.name)}
                  onToggle={() => toggleExpand(table.name)}
                  projects={projects}
                  onProjectsChange={refreshLocalProjects}
                  activeProjectId={activeProjectId}
                  onRemoveFromProject={activeProjectId ? async () => {
                    await window.api.projects.removeTable(activeProjectId, {
                      connectionId, database, tableName: table.name
                    })
                    refreshLocalProjects()
                  } : null}
                />
              ))}
            </div>
          )}

          {/* 项目模式：从当前库添加表 */}
          {activeProject && (
            <AddTablesSection
              unaddedTables={unaddedTables}
              activeProject={activeProject}
              connectionId={connectionId}
              database={database}
              onAdded={refreshLocalProjects}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── AddTablesSection ─────────────────────────────────────────

interface AddTablesSectionProps {
  unaddedTables: TableStructure[]
  activeProject: Project
  connectionId: string
  database: string
  onAdded: () => void
}

function AddTablesSection({ unaddedTables, activeProject, connectionId, database, onAdded }: AddTablesSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [addSearch, setAddSearch] = useState('')

  if (unaddedTables.length === 0) return null

  const filtered = addSearch.trim()
    ? unaddedTables.filter((t) => t.name.toLowerCase().includes(addSearch.trim().toLowerCase()))
    : unaddedTables

  const handleAdd = async (tableName: string) => {
    await window.api.projects.addTable(activeProject.id, { connectionId, database, tableName })
    onAdded()
  }

  return (
    <div className="rounded-lg border border-dashed">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" />
          <span>从当前库添加表</span>
          <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 tabular-nums">{unaddedTables.length}</span>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="border-t rounded-b-lg overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="搜索表名..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="w-full h-7 pl-7 pr-3 text-xs rounded-md border bg-background outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="divide-y max-h-52 overflow-y-auto">
            {filtered.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors"
              >
                <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs flex-1 truncate">{t.name}</span>
                {t.meta.comment && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[120px] hidden sm:block">
                    {t.meta.comment}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {t.columns.length} 字段
                </span>
                <button
                  onClick={() => handleAdd(t.name)}
                  className="h-6 w-6 rounded border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0"
                  title="添加到当前项目"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">无匹配结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TableStructureRow ────────────────────────────────────────

interface TableStructureRowProps {
  table: TableStructure
  database: string
  connectionId: string
  expanded: boolean
  onToggle: () => void
  projects: Project[]
  onProjectsChange: () => void
  activeProjectId: string | null
  onRemoveFromProject: (() => Promise<void>) | null
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch { return false }
  }
}

function TableStructureRow({
  table, database, connectionId, expanded, onToggle,
  projects, onProjectsChange, activeProjectId, onRemoveFromProject
}: TableStructureRowProps) {
  const [copiedName, setCopiedName] = useState(false)
  const [copiedStruct, setCopiedStruct] = useState(false)
  const [showProjectPopover, setShowProjectPopover] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const fullName = `${database}.${table.name}`
  const projectEntry = { connectionId, database, tableName: table.name }

  useEffect(() => {
    if (!showProjectPopover) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setShowProjectPopover(false)
        setCreatingProject(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProjectPopover])

  const isInProject = (project: Project) =>
    project.tables.some(
      (t) => t.connectionId === connectionId && t.database === database && t.tableName === table.name
    )

  const handleToggleProject = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation()
    if (isInProject(project)) {
      await window.api.projects.removeTable(project.id, projectEntry)
    } else {
      await window.api.projects.addTable(project.id, projectEntry)
    }
    onProjectsChange()
  }

  const handleCreateAndAdd = async () => {
    const name = newProjectName.trim()
    if (!name) return
    const created = await window.api.projects.create(name)
    await window.api.projects.addTable(created.id, projectEntry)
    onProjectsChange()
    setNewProjectName('')
    setCreatingProject(false)
  }

  const handleCopyName = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = await copyToClipboard(fullName)
    if (ok) { setCopiedName(true); setTimeout(() => setCopiedName(false), 1500) }
  }

  const handleCopyStruct = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = await copyToClipboard(formatFullSchemaForAI([table], database))
    if (ok) { setCopiedStruct(true); setTimeout(() => setCopiedStruct(false), 1500) }
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="group flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors">
        <button
          className="flex-1 flex items-center gap-3 text-left min-w-0"
          onClick={onToggle}
        >
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <Table2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-mono font-medium text-sm truncate">{table.name}</span>
          {table.meta.comment && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[200px]">
              {table.meta.comment}
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {table.columns.length} 字段 · {table.indexes.length} 索引
          </span>
        </button>

        {/* 复制表名 */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 shrink-0 text-xs text-muted-foreground"
          onClick={handleCopyName}
          title={`复制表名（${fullName}）`}
        >
          {copiedName ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {!copiedName && <span>表名</span>}
        </Button>

        {/* 复制表结构 */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 shrink-0 text-xs text-muted-foreground"
          onClick={handleCopyStruct}
          title="复制完整表结构（可粘贴给 AI）"
        >
          {copiedStruct ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {!copiedStruct && <span>结构</span>}
        </Button>

        {/* 项目模式：移出按钮（hover 才显示） */}
        {activeProjectId && onRemoveFromProject && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 shrink-0 text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={async (e) => { e.stopPropagation(); await onRemoveFromProject() }}
            title="从项目中移出"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>移出</span>
          </Button>
        )}

        {/* 全部表模式：加入项目 */}
        {!activeProjectId && (
          <>
            <Button
              ref={triggerRef}
              variant="ghost"
              size="sm"
              className={`h-7 px-2 gap-1 shrink-0 text-xs ${projects.some(isInProject) ? 'text-amber-500' : 'text-muted-foreground'}`}
              title="加入项目"
              onClick={(e) => {
                e.stopPropagation()
                if (!showProjectPopover) {
                  const rect = triggerRef.current?.getBoundingClientRect()
                  if (rect) setPopoverPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                }
                setShowProjectPopover((v) => !v)
              }}
            >
              {projects.some(isInProject)
                ? <FolderOpen className="h-3.5 w-3.5" />
                : <FolderPlus className="h-3.5 w-3.5" />}
              <span>项目</span>
            </Button>

            {showProjectPopover && popoverPos && createPortal(
              <div
                ref={popoverRef}
                style={{ top: popoverPos.top, right: popoverPos.right }}
                className="fixed z-[9999] w-52 rounded-lg border bg-popover shadow-lg text-sm overflow-hidden"
              >
                <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">加入项目</div>
                {projects.length === 0 && !creatingProject && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">暂无项目</div>
                )}
                {projects.map((p) => {
                  const inProject = isInProject(p)
                  return (
                    <button
                      key={p.id}
                      onClick={(e) => handleToggleProject(e, p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${inProject ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                        {inProject && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </span>
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{p.tables.length}</span>
                    </button>
                  )
                })}
                {creatingProject ? (
                  <div className="px-2 py-2 border-t flex gap-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="项目名称..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') handleCreateAndAdd()
                        if (e.key === 'Escape') setCreatingProject(false)
                      }}
                      className="flex-1 h-7 px-2 text-xs rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCreateAndAdd() }}
                      disabled={!newProjectName.trim()}
                      className="h-7 w-7 rounded border bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCreatingProject(true); setNewProjectName('') }}
                    className="w-full flex items-center gap-2 px-3 py-2 border-t text-left hover:bg-muted/50 transition-colors text-muted-foreground"
                  >
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs">新建项目...</span>
                  </button>
                )}
              </div>,
              document.body
            )}
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t divide-y">
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">表属性</span>
            </div>
            <TableMetaGrid meta={table.meta} />
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">字段 ({table.columns.length})</span>
            </div>
            <ColumnTable columns={table.columns} />
          </div>
          {table.indexes.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">索引 ({table.indexes.length})</span>
              </div>
              <IndexTable indexes={table.indexes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TableMetaGrid ────────────────────────────────────────────

function TableMetaGrid({ meta }: { meta: TableMeta }) {
  const items = [
    { label: '存储引擎', value: meta.engine || '—' },
    { label: '字符集', value: meta.charset || '—' },
    { label: '排序规则', value: meta.collation || '—' },
    { label: '表注释', value: meta.comment || '—' }
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono truncate" title={value}>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── ColumnTable ──────────────────────────────────────────────

function ColumnTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="text-left py-2 pl-4 pr-2 font-medium text-muted-foreground w-[140px]">字段名</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">类型</th>
            <th className="text-center py-2 px-2 font-medium text-muted-foreground w-[80px]">可空</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[60px]">键</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">默认值</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Extra</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground min-w-[160px]">注释</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name} className="border-b last:border-0 hover:bg-muted/20">
              <td className="py-2 pl-4 pr-2 font-mono font-medium whitespace-nowrap">{col.name}</td>
              <td className="py-2 px-2 font-mono whitespace-nowrap">{col.type}</td>
              <td className="py-2 px-2 text-center text-muted-foreground whitespace-nowrap">{col.nullable ? 'YES' : 'NO'}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                {col.key === 'PRI' && <span className="text-amber-600 font-semibold">PRI</span>}
                {col.key === 'UNI' && <span className="text-blue-600">UNI</span>}
                {col.key === 'MUL' && <span className="text-slate-500">MUL</span>}
                {!col.key && '—'}
              </td>
              <td className="py-2 px-2 font-mono text-muted-foreground whitespace-nowrap">
                {col.default !== null && col.default !== undefined ? (col.default === '' ? "''" : col.default) : '—'}
              </td>
              <td className="py-2 px-2 text-indigo-600 italic whitespace-nowrap">{col.extra || '—'}</td>
              <td className="py-2 px-2 text-muted-foreground break-words">{col.comment || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── IndexTable ───────────────────────────────────────────────

function IndexTable({ indexes }: { indexes: IndexInfo[] }) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="text-left py-2 pl-4 pr-2 font-medium text-muted-foreground w-[160px]">索引名</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">列</th>
            <th className="text-center py-2 px-2 font-medium text-muted-foreground w-[80px]">唯一</th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[80px]">类型</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx) => (
            <tr key={idx.name} className="border-b last:border-0 hover:bg-muted/20">
              <td className="py-2 pl-4 pr-2 font-mono font-medium">{idx.name}</td>
              <td className="py-2 px-2 font-mono">({idx.columns.join(', ')})</td>
              <td className="py-2 px-2 text-center text-muted-foreground">{idx.unique ? 'YES' : 'NO'}</td>
              <td className="py-2 px-2 text-muted-foreground">{idx.type || 'BTREE'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
