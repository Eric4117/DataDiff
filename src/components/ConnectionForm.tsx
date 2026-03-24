import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog'
import type { Connection } from '@/types'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface ConnectionFormProps {
  open: boolean
  onClose: () => void
  onSave: (conn: Omit<Connection, 'id'>) => void
  initialData?: Connection | null
}

const defaultForm: Omit<Connection, 'id'> = {
  name: '',
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: ''
}

export function ConnectionForm({ open, onClose, onSave, initialData }: ConnectionFormProps) {
  const [form, setForm] = useState<Omit<Connection, 'id'>>(defaultForm)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...initialData } : { ...defaultForm })
      setTestResult(null)
    }
  }, [open, initialData])

  const handleChange = (field: keyof Omit<Connection, 'id'>, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.connections.test(form)
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{initialData ? '编辑数据源' : '添加数据源'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">名称 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              placeholder="如：生产环境、测试环境"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="host">主机地址</Label>
              <Input
                id="host"
                placeholder="127.0.0.1"
                value={form.host}
                onChange={(e) => handleChange('host', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="port">端口</Label>
              <Input
                id="port"
                type="number"
                placeholder="3306"
                value={form.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value) || 3306)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="user">用户名</Label>
              <Input
                id="user"
                placeholder="root"
                value={form.user}
                onChange={(e) => handleChange('user', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="密码"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                testResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              {testResult.message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            测试连接
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
