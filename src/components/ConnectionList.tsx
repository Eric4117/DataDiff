import React, { useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { ConnectionForm } from './ConnectionForm'
import type { Connection } from '@/types'
import { Plus, Pencil, Trash2, Database, ServerCrash } from 'lucide-react'

interface ConnectionListProps {
  connections: Connection[]
  onAdd: (conn: Omit<Connection, 'id'>) => Promise<void>
  onUpdate: (conn: Connection) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function ConnectionList({ connections, onAdd, onUpdate, onDelete }: ConnectionListProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSave = async (data: Omit<Connection, 'id'>) => {
    if (editing) {
      await onUpdate({ ...editing, ...data })
    } else {
      await onAdd(data)
    }
    setEditing(null)
  }

  const handleEdit = (conn: Connection) => {
    setEditing(conn)
    setFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleClose = () => {
    setFormOpen(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">数据源管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">配置 MySQL、SQLite、PostgreSQL（含 Supabase）连接</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          添加数据源
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ServerCrash className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">暂无数据源</p>
            <p className="text-sm text-muted-foreground mt-1">点击右上角"添加数据源"开始配置</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{conn.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {conn.type === 'sqlite' ? 'SQLite' : conn.type === 'postgresql' ? 'PostgreSQL' : 'MySQL'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conn.type === 'sqlite'
                        ? conn.filePath || '（未设置路径）'
                        : `${conn.user}@${conn.host}:${conn.port}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(conn)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(conn.id)}
                    disabled={deletingId === conn.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConnectionForm
        open={formOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  )
}
