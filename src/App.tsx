import React, { useState, useEffect, useCallback } from 'react'
import { ConnectionList } from './components/ConnectionList'
import { CompareSelector } from './components/CompareSelector'
import { TableDiffList } from './components/TableDiffList'
import { StructureViewer } from './components/StructureViewer'
import { HomePage } from './components/HomePage'
import { ProjectSidebar } from './components/ProjectSidebar'
import { TooltipProvider } from './components/ui/tooltip'
import type { Connection, CompareTarget, DiffResult, Project } from './types'
import { Database, GitCompare, Loader2, AlertCircle, LayoutGrid, Home } from 'lucide-react'

type Tab = 'home' | 'compare' | 'structure' | 'connections'

interface CompareState {
  left: CompareTarget
  right: CompareTarget
  result: DiffResult
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [connections, setConnections] = useState<Connection[]>([])
  const [comparing, setComparing] = useState(false)
  const [compareState, setCompareState] = useState<CompareState | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])

  // 快捷跳转预填状态
  const [presetCompare, setPresetCompare] = useState<{ left: CompareTarget; right: CompareTarget } | null>(null)
  const [presetStructure, setPresetStructure] = useState<CompareTarget | null>(null)

  const refreshProjects = useCallback(async () => {
    const list = await window.api.projects.list()
    setProjects(list)
    setActiveProjectId((cur) => (cur && !list.find((p) => p.id === cur) ? null : cur))
  }, [])

  useEffect(() => {
    window.api.connections.list().then(setConnections)
    refreshProjects()
  }, [refreshProjects])

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

  const handleCompare = async (left: CompareTarget, right: CompareTarget) => {
    setComparing(true)
    setCompareError(null)
    setCompareState(null)
    try {
      const result = await window.api.schema.compare(left, right)
      setCompareState({ left, right, result })
      // 自动保存快捷操作
      window.api.shortcuts.upsertCompare(left, right).catch(() => {})
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : '对比失败，请检查连接')
    } finally {
      setComparing(false)
    }
  }

  const handleStructureLoaded = (connId: string, database: string) => {
    window.api.shortcuts.upsertStructure({ connectionId: connId, database }).catch(() => {})
  }

  const handleReset = () => {
    setCompareState(null)
    setCompareError(null)
  }

  // 从首页快捷操作跳转
  const handleNavigateCompare = (left: CompareTarget, right: CompareTarget) => {
    setPresetCompare({ left, right })
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

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background">
        {/* 标题栏 */}
        <header className="flex items-center justify-between px-5 py-3 border-b bg-card shrink-0 select-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GitCompare className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm">DataDiff</span>
            <span className="text-xs text-muted-foreground">MySQL 结构对比</span>
          </div>
          {/* 标签切换 */}
          <div
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <TabBtn active={tab === 'home'} onClick={() => setTab('home')}>
              <Home className="h-3.5 w-3.5" />
              首页
            </TabBtn>
            <TabBtn active={tab === 'compare'} onClick={() => setTab('compare')}>
              <GitCompare className="h-3.5 w-3.5" />
              对比
            </TabBtn>
            <TabBtn active={tab === 'structure'} onClick={() => setTab('structure')}>
              <LayoutGrid className="h-3.5 w-3.5" />
              结构
            </TabBtn>
            <TabBtn active={tab === 'connections'} onClick={() => setTab('connections')}>
              <Database className="h-3.5 w-3.5" />
              数据源
              {connections.length > 0 && (
                <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                  {connections.length}
                </span>
              )}
            </TabBtn>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="flex-1 overflow-hidden flex flex-col">
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
          ) : tab === 'structure' ? (
            <div className="flex flex-1 overflow-hidden">
              <ProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                onSelect={setActiveProjectId}
                onProjectsChange={refreshProjects}
              />
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
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">
              {!compareState && !comparing && (
                <section>
                  <h2 className="text-base font-semibold mb-4">选择对比数据库</h2>
                  <CompareSelector
                    connections={connections}
                    onCompare={handleCompare}
                    comparing={comparing}
                    initialPreset={presetCompare ?? undefined}
                  />
                  {compareError && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{compareError}</span>
                    </div>
                  )}
                </section>
              )}

              {comparing && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="font-medium">正在扫描数据库结构...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      正在查询 information_schema，请稍候
                    </p>
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

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
