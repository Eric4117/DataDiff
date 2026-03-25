import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import type { Project } from '@/types'
import { Layers, FolderOpen, Pencil, Trash2, Plus, Check, X, MoreHorizontal } from 'lucide-react'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string | null) => void
  onProjectsChange: () => void
}

/** 纯内容（嵌入统一侧栏的 Context 区，无 aside 外壳） */
export function ProjectSidebarContent({ projects, activeProjectId, onSelect, onProjectsChange }: ProjectSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  // 当前打开 "···" 菜单的项目 id
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const handleRename = async (id: string) => {
    const name = renameValue.trim()
    if (name) await window.api.projects.rename(id, name)
    setRenamingId(null)
    onProjectsChange()
  }

  const handleDelete = async (id: string) => {
    await window.api.projects.delete(id)
    if (activeProjectId === id) onSelect(null)
    setDeletingId(null)
    onProjectsChange()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const created = await window.api.projects.create(name)
    onProjectsChange()
    onSelect(created.id)
    setNewName('')
    setCreating(false)
  }

  const openMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (menuOpenId === id) {
      setMenuOpenId(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setMenuOpenId(id)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-transparent">
      <div className="px-3 pt-4 pb-2 shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">项目</span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5">
        {/* 全部表 */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left rounded-md ${
            activeProjectId === null
              ? 'bg-primary/14 text-primary font-semibold'
              : 'text-muted-foreground font-medium hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
          }`}
        >
          <Layers className={`h-3.5 w-3.5 shrink-0 ${activeProjectId === null ? 'text-primary' : ''}`} />
          <span className="truncate">全部表</span>
        </button>

        {/* 项目列表 */}
        {projects.map((p) => {
          // 重命名状态
          if (renamingId === p.id) {
            return (
              <div key={p.id} className="px-2 py-1.5 flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(p.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  className="flex-1 h-6 px-2 text-xs rounded border bg-background outline-none focus:ring-1 focus:ring-primary min-w-0"
                />
                <button
                  onClick={() => handleRename(p.id)}
                  className="h-6 w-6 rounded flex items-center justify-center bg-primary text-primary-foreground shrink-0"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setRenamingId(null)}
                  className="h-6 w-6 rounded flex items-center justify-center border text-muted-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          }

          // 删除确认状态
          if (deletingId === p.id) {
            return (
              <div key={p.id} className="px-3 py-2 bg-destructive/5 border-l-2 border-destructive">
                <p className="text-[11px] text-destructive mb-1.5 leading-tight">删除"{p.name}"？</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-[11px] text-destructive font-medium hover:underline"
                  >
                    删除
                  </button>
                  <span className="text-muted-foreground text-[11px]">/</span>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </button>
                </div>
              </div>
            )
          }

          const isActive = activeProjectId === p.id

          return (
            <div
              key={p.id}
              className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors rounded-md ${
                isActive
                  ? 'bg-primary/14 text-primary font-semibold'
                  : 'text-muted-foreground font-medium hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
              }`}
              onClick={() => onSelect(p.id)}
            >
              <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
              <span className="truncate text-xs flex-1 min-w-0">{p.name}</span>
              {/* 数量 badge（hover 时隐藏，让出空间给 ··· 按钮）*/}
              <span
                className={`text-[10px] tabular-nums shrink-0 group-hover:hidden ${
                  isActive ? 'text-primary/70' : 'text-muted-foreground'
                }`}
              >
                {p.tables.length}
              </span>
              {/* ··· 更多按钮，hover 才显示 */}
              <button
                onClick={(e) => openMenu(e, p.id)}
                className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded hover:bg-muted shrink-0 text-muted-foreground hover:text-foreground"
                title="更多操作"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* 新建项目 */}
      <div className="border-t px-2 py-2 shrink-0">
        {creating ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              placeholder="项目名称..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              className="flex-1 h-7 px-2 text-xs rounded border bg-background outline-none focus:ring-1 focus:ring-primary min-w-0"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="h-7 w-7 rounded flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 justify-start gap-1.5 text-xs text-muted-foreground"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            新建项目
          </Button>
        )}
      </div>

      {/* ··· 操作菜单（Portal 渲染，不受 overflow:hidden 影响）*/}
      {menuOpenId && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ top: menuPos.top, left: menuPos.left }}
          className="fixed z-[9999] w-32 rounded-lg border bg-popover shadow-lg overflow-hidden py-1"
        >
          <button
            onClick={() => {
              const p = projects.find((p) => p.id === menuOpenId)
              if (p) { setRenamingId(p.id); setRenameValue(p.name) }
              setMenuOpenId(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/60 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            重命名
          </button>
          <button
            onClick={() => {
              setDeletingId(menuOpenId)
              setMenuOpenId(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/60 transition-colors text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除项目
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

/** @deprecated 使用 ProjectSidebarContent + 外层布局；保留兼容导出 */
export function ProjectSidebar(props: ProjectSidebarProps) {
  return (
    <aside className="w-44 shrink-0 border-r flex flex-col overflow-hidden">
      <ProjectSidebarContent {...props} />
    </aside>
  )
}
