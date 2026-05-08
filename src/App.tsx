import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ConnectionList } from './components/ConnectionList'
import { CompareSelector } from './components/CompareSelector'
import { TableDiffList } from './components/TableDiffList'
import { StructureViewer } from './components/StructureViewer'
import { HomePage } from './components/HomePage'
import { AuditView } from './components/AuditView'
import { ProjectSidebarContent } from './components/ProjectSidebar'
import { AppSidebar, type SidebarTab } from './components/AppSidebar'
import { TooltipProvider } from './components/ui/tooltip'
import type { Connection, CompareTarget, DiffResult, DiffFilter, Project, AutoAuditPayload } from './types'
import { DiffSummaryBar } from './components/DiffSummaryBar'
import { Loader2, AlertCircle, ShieldCheck, X } from 'lucide-react'

type Tab = SidebarTab

interface CompareState {
  left: CompareTarget
  right: CompareTarget
  result: DiffResult
}

interface AuditToast {
  id: number
  payload: AutoAuditPayload
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [connections, setConnections] = useState<Connection[]>([])
  const [comparing, setComparing] = useState(false)
  const [compareState, setCompareState] = useState<CompareState | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [comparePresetNonce, setComparePresetNonce] = useState(0)
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('different')

  const [presetCompare, setPresetCompare] = useState<{ left: CompareTarget; right: CompareTarget } | null>(null)
  const [presetStructure, setPresetStructure] = useState<CompareTarget | null>(null)

  // 审计徽章：切到 audit tab 后归零
  const [newAuditCount, setNewAuditCount] = useState(0)
  // Toast 队列
  const [auditToasts, setAuditToasts] = useState<AuditToast[]>([])
  const toastIdRef = useRef(0)

  const refreshProjects = useCallback(async () => {
    const list = await window.api.projects.list()
    setProjects(list)
    setActiveProjectId((cur) => (cur && !list.find((p) => p.id === cur) ? null : cur))
  }, [])

  useEffect(() => {
    window.api.connections.list().then(setConnections)
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    setDiffFilter('different')
  }, [compareState])

  // 订阅自动审计推送事件
  useEffect(() => {
    const unsub = window.api.audit.onAutoCreated((payload) => {
      setNewAuditCount((n) => n + 1)
      const id = ++toastIdRef.current
      setAuditToasts((prev) => [...prev, { id, payload }])
      setTimeout(() => {
        setAuditToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    })
    return unsub
  }, [])

  const handleTabChange = (t: Tab) => {
    if (t === 'audit') setNewAuditCount(0)
    setTab(t)
  }

  const refreshConnections = useCallback(async () => {
    const list = await window.api.connections.list()
    setConnections(list)
  }, [])

  const handleAdd = async (conn: Omit<Connection, 'id'>) => {
    await window.api.connections.add(conn)
    await refreshConnections()
  }

  const handleUpdate = async (conn: Connection) => {
    await window.api.connections.update(conn)
    await refreshConnections()
  }

  const handleDelete = async (id: string) => {
    await window.api.connections.delete(id)
    await refreshConnections()
  }

  const handleCompare = useCallback(async (left: CompareTarget, right: CompareTarget) => {
    setComparing(true)
    setCompareError(null)
    setCompareState(null)
    try {
      const result = await window.api.schema.compare(left, right)
      setCompareState({ left, right, result })
      window.api.shortcuts.upsertCompare(left, right).catch(() => {})
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : '对比失败，请检查连接')
    } finally {
      setComparing(false)
    }
  }, [])

  const handleStructureLoaded = (connId: string, database: string) => {
    window.api.shortcuts.upsertStructure({ connectionId: connId, database }).catch(() => {})
  }

  const handleReset = () => {
    setCompareState(null)
    setCompareError(null)
  }

  const handleNavigateCompare = (left: CompareTarget, right: CompareTarget) => {
    setPresetCompare({ left, right })
    setComparePresetNonce((n) => n + 1)
    setPresetStructure(null)
    setCompareState(null)
    setCompareError(null)
    setTab('compare')
  }

  const handleNavigateStructure = (target: CompareTarget) => {
    setPresetStructure(target)
    setPresetCompare(null)
    setTab('structure')
  }

  const structurePanel =
    connections.length > 0 ? (
      <ProjectSidebarContent
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProjectId}
        onProjectsChange={refreshProjects}
      />
    ) : null

  const compareFiltersPanel =
    compareState != null ? (
      <DiffSummaryBar
        variant="sidebar"
        summary={compareState.result.summary}
        filter={diffFilter}
        onFilterChange={setDiffFilter}
      />
    ) : null

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar
          tab={tab}
          onTabChange={handleTabChange}
          connectionsCount={connections.length}
          newAuditCount={newAuditCount}
          structurePanel={structurePanel}
          compareFiltersPanel={compareFiltersPanel}
        />

        <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
          {/* 自动审计 Toast 通知 */}
          {auditToasts.length > 0 && (
            <div className="absolute top-3 right-3 z-50 flex flex-col gap-2 pointer-events-none">
              {auditToasts.map((toast) => (
                <div
                  key={toast.id}
                  className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm shadow-md max-w-[320px]"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground leading-snug">
                      {toast.payload.database} 检测到结构变更
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {toast.payload.recordName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      修改 {toast.payload.summary.modified} · 新增 {toast.payload.summary.rightOnly} · 删除 {toast.payload.summary.leftOnly}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setAuditToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'home' ? (
            <div className="flex-1 overflow-auto">
              <HomePage
                connections={connections}
                onNavigateCompare={handleNavigateCompare}
                onNavigateStructure={handleNavigateStructure}
              />
            </div>
          ) : tab === 'connections' ? (
            <div className="flex-1 overflow-auto">
              <ConnectionList
                connections={connections}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </div>
          ) : tab === 'audit' ? (
            <div className="flex-1 overflow-auto">
              <AuditView connections={connections} />
            </div>
          ) : tab === 'structure' ? (
            <div className="flex-1 overflow-auto">
              <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">
                <StructureViewer
                  connections={connections}
                  initialTarget={presetStructure ?? undefined}
                  onStructureLoaded={handleStructureLoaded}
                  activeProjectId={activeProjectId}
                  activeProject={projects.find((p) => p.id === activeProjectId) ?? null}
                  onProjectsChange={refreshProjects}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">
                <section>
                  <h2 className="text-base font-semibold mb-4">选择对比数据库</h2>
                  <CompareSelector
                    connections={connections}
                    onCompare={handleCompare}
                    comparing={comparing}
                    initialPreset={presetCompare ?? undefined}
                    presetNonce={comparePresetNonce}
                  />
                </section>

                {compareError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{compareError}</span>
                  </div>
                )}

                {comparing && (
                  <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div className="text-center">
                      <p className="font-medium">正在扫描数据库结构...</p>
                      <p className="text-sm text-muted-foreground mt-1">正在读取元数据，请稍候</p>
                    </div>
                  </div>
                )}

                {compareState && (
                  <TableDiffList
                    result={compareState.result}
                    leftTarget={compareState.left}
                    rightTarget={compareState.right}
                    connections={connections}
                    onReset={handleReset}
                    filter={diffFilter}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}
