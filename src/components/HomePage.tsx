import React, { useState, useEffect, useCallback } from 'react'
import type { Shortcut, CompareTarget, Connection } from '@/types'
import { Button } from './ui/button'
import {
  GitCompare,
  LayoutGrid,
  Database,
  Zap,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowRight,
  Clock
} from 'lucide-react'

interface HomePageProps {
  connections: Connection[]
  onNavigateCompare: (left: CompareTarget, right: CompareTarget) => void
  onNavigateStructure: (target: CompareTarget) => void
}

export function HomePage({ connections, onNavigateCompare, onNavigateStructure }: HomePageProps) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])

  const loadShortcuts = useCallback(async () => {
    const list = await window.api.shortcuts.list()
    setShortcuts(list)
  }, [])

  useEffect(() => {
    loadShortcuts()
  }, [loadShortcuts])

  const handleDelete = async (id: string) => {
    await window.api.shortcuts.delete(id)
    setShortcuts((prev) => prev.filter((s) => s.id !== id))
  }

  const handleRename = async (id: string, name: string) => {
    const updated = await window.api.shortcuts.rename(id, name)
    setShortcuts((prev) => prev.map((s) => (s.id === id ? updated : s)))
  }

  const handleLaunch = (s: Shortcut) => {
    if (s.type === 'compare' && s.compare) {
      onNavigateCompare(s.compare.left, s.compare.right)
    } else if (s.type === 'structure' && s.structure) {
      onNavigateStructure(s.structure)
    }
  }

  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? id

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-10">
      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0">
          <GitCompare className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">DataDiff</h1>
          <p className="text-sm text-muted-foreground mt-1 break-words">
            MySQL 数据库结构对比工具 — 快速发现两个数据库之间的表、字段、索引差异，并支持查看单库表结构。
          </p>
        </div>
      </div>

      {/* 功能介绍 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">功能</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FeatureCard
            icon={<GitCompare className="h-4 w-4 text-amber-600" />}
            title="结构对比"
            desc="逐表、逐字段、逐索引对比两个 MySQL 数据库的结构差异，高亮变更点。"
            bg="bg-amber-50"
          />
          <FeatureCard
            icon={<LayoutGrid className="h-4 w-4 text-blue-600" />}
            title="结构查看"
            desc="浏览任意数据库的表结构，查看字段类型、索引、表属性，一键复制给 AI。"
            bg="bg-blue-50"
          />
          <FeatureCard
            icon={<Database className="h-4 w-4 text-green-600" />}
            title="多数据源"
            desc="本地保存多个 MySQL 连接配置，快速切换，密码不出本机。"
            bg="bg-green-50"
          />
        </div>
      </div>

      {/* 快捷操作 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">快捷操作</h2>
          {shortcuts.length > 0 && (
            <span className="text-xs text-muted-foreground ml-1">· {shortcuts.length} 条</span>
          )}
        </div>

        {shortcuts.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              每次执行对比或查看结构后会自动保存快捷操作，方便下次一键启动。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shortcuts.map((s) => (
              <ShortcutCard
                key={s.id}
                shortcut={s}
                connName={connName}
                onLaunch={() => handleLaunch(s)}
                onRename={(name) => handleRename(s.id, name)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
  bg
}: {
  icon: React.ReactNode
  title: string
  desc: string
  bg: string
}) {
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-2 ${bg}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}

interface ShortcutCardProps {
  shortcut: Shortcut
  connName: (id: string) => string
  onLaunch: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

function ShortcutCard({ shortcut, connName, onLaunch, onRename, onDelete }: ShortcutCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(shortcut.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== shortcut.name) onRename(trimmed)
    setEditing(false)
  }

  const isCompare = shortcut.type === 'compare'
  const icon = isCompare
    ? <GitCompare className="h-3.5 w-3.5 text-amber-600 shrink-0" />
    : <LayoutGrid className="h-3.5 w-3.5 text-blue-600 shrink-0" />
  const typeBadge = isCompare
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-blue-700 bg-blue-50 border-blue-200'
  const typeLabel = isCompare ? '对比' : '结构'

  const detail = isCompare && shortcut.compare
    ? `${connName(shortcut.compare.left.connectionId)} / ${shortcut.compare.left.database}  vs  ${connName(shortcut.compare.right.connectionId)} / ${shortcut.compare.right.database}`
    : shortcut.structure
      ? `${connName(shortcut.structure.connectionId)} / ${shortcut.structure.database}`
      : ''

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          {editing ? (
            <input
              autoFocus
              className="text-sm font-medium border-b border-primary bg-transparent outline-none flex-1 min-w-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setDraft(shortcut.name); setEditing(false) }
              }}
              onBlur={commitRename}
            />
          ) : (
            <span className="text-sm font-medium truncate">{shortcut.name}</span>
          )}
        </div>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${typeBadge}`}>
          {typeLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground font-mono truncate" title={detail}>{detail}</p>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          {confirmDelete ? (
            <>
              <span className="text-xs text-destructive mr-1">确认删除？</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-destructive hover:text-destructive" onClick={onDelete}>
                <Check className="h-3 w-3 mr-1" />确认
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setConfirmDelete(false)}>
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="重命名" onClick={() => { setDraft(shortcut.name); setEditing(true) }}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" title="删除" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={onLaunch}>
          启动
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
