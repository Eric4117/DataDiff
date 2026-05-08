import React, { useState, useEffect, useCallback } from 'react'
import type { Connection, SchemaSnapshot, AuditRecord, DiffFilter, DiffSummary } from '@/types'

/** recordList 返回的轻量记录（含 summary，不含 diff.tables 详情） */
type AuditRecordMeta = Omit<AuditRecord, 'diff'> & {
  diff: { tables: never[]; summary: DiffSummary }
}
import { TableDiffList } from './TableDiffList'
import { DiffSummaryBar } from './DiffSummaryBar'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import {
  Camera,
  ClipboardList,
  FileDown,
  Loader2,
  Trash2,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  X
} from 'lucide-react'

interface AuditViewProps {
  connections: Connection[]
}

// ─── Markdown 导出 ─────────────────────────────────────────

function exportToMarkdown(record: AuditRecord): string {
  const { diff, snapshotName, database, createdAt } = record
  const { tables, summary } = diff

  const lines: string[] = [
    '# DataDiff 变更审计报告',
    '',
    `**数据库**: ${database}`,
    `**基线快照**: ${snapshotName}`,
    `**生成时间**: ${new Date(createdAt).toLocaleString('zh-CN')}`,
    '',
    '## 变更摘要',
    `- 新增表: ${summary.rightOnly} | 删除表: ${summary.leftOnly} | 修改表: ${summary.modified} | 无变化: ${summary.same}`,
    `- 字段差异: ${summary.fieldDiff} | 索引差异: ${summary.indexDiff} | 字符集差异: ${summary.charsetDiff}`,
    ''
  ]

  const leftOnly = tables.filter((t) => t.status === 'left_only')
  const rightOnly = tables.filter((t) => t.status === 'right_only')
  const modified = tables.filter((t) => t.status === 'modified')

  if (leftOnly.length > 0) {
    lines.push(`## 已删除表 (${leftOnly.length})`)
    for (const t of leftOnly) lines.push(`- \`${t.name}\``)
    lines.push('')
  }

  if (rightOnly.length > 0) {
    lines.push(`## 新增表 (${rightOnly.length})`)
    for (const t of rightOnly) {
      lines.push(`### \`${t.name}\``)
      for (const c of t.columns) {
        const col = c.right!
        lines.push(`- \`${col.name}\` ${col.type}${col.nullable ? '' : ' NOT NULL'}`)
      }
      lines.push('')
    }
  }

  if (modified.length > 0) {
    lines.push(`## 修改表 (${modified.length})`)
    for (const t of modified) {
      lines.push(`### \`${t.name}\``)

      const added = t.columns.filter((c) => c.status === 'right_only')
      const removed = t.columns.filter((c) => c.status === 'left_only')
      const changed = t.columns.filter((c) => c.status === 'modified')

      for (const c of added) {
        const col = c.right!
        lines.push(`- **新增字段**: \`${col.name}\` ${col.type}${col.nullable ? '' : ' NOT NULL'}`)
      }
      for (const c of removed) {
        lines.push(`- **删除字段**: \`${c.name}\``)
      }
      for (const c of changed) {
        const fields = c.changedFields.join(', ')
        lines.push(`- **修改字段**: \`${c.name}\` [${fields}] ${c.left?.type ?? ''} → ${c.right?.type ?? ''}`)
      }

      const addedIdx = t.indexes.filter((i) => i.status === 'right_only')
      const removedIdx = t.indexes.filter((i) => i.status === 'left_only')
      const changedIdx = t.indexes.filter((i) => i.status === 'modified')
      for (const i of addedIdx) lines.push(`- **新增索引**: \`${i.name}\``)
      for (const i of removedIdx) lines.push(`- **删除索引**: \`${i.name}\``)
      for (const i of changedIdx) lines.push(`- **修改索引**: \`${i.name}\``)

      if (t.metaDiffs.length > 0) {
        for (const m of t.metaDiffs) {
          lines.push(`- **表属性变更**: ${m.label} ${m.left} → ${m.right}`)
        }
      }

      lines.push('')
    }
  }

  return lines.join('\n')
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 子组件 ───────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="font-semibold text-sm">{title}</h3>
      {count != null && (
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  )
}

function SummaryChips({ summary }: { summary: AuditRecord['diff']['summary'] }) {
  const chips = [
    { label: '新增', value: summary.rightOnly, color: 'text-blue-600 bg-blue-50' },
    { label: '删除', value: summary.leftOnly, color: 'text-red-600 bg-red-50' },
    { label: '修改', value: summary.modified, color: 'text-amber-700 bg-amber-50' },
    { label: '相同', value: summary.same, color: 'text-green-600 bg-green-50' }
  ]
  return (
    <div className="flex gap-1.5 flex-wrap">
      {chips.map(({ label, value, color }) => (
        <span key={label} className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${color}`}>
          {label} {value}
        </span>
      ))}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────

export function AuditView({ connections }: AuditViewProps) {
  const [snapshots, setSnapshots] = useState<Omit<SchemaSnapshot, 'tables'>[]>([])
  const [records, setRecords] = useState<AuditRecordMeta[]>([])
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null)
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('different')

  // 保存快照所需状态
  const [saveConnId, setSaveConnId] = useState('')
  const [saveDbs, setSaveDbs] = useState<string[]>([])
  const [saveDb, setSaveDb] = useState('')
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 生成报告状态
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // 报告详情面板是否折叠
  const [detailOpen, setDetailOpen] = useState(true)

  const connName = useCallback(
    (connId: string) => connections.find((c) => c.id === connId)?.name ?? connId,
    [connections]
  )

  const refreshSnapshots = useCallback(async () => {
    const list = await window.api.audit.snapshotList()
    setSnapshots(list)
  }, [])

  const refreshRecords = useCallback(async () => {
    const list = await window.api.audit.recordList()
    setRecords(list)
  }, [])

  useEffect(() => {
    refreshSnapshots()
    refreshRecords()
  }, [refreshSnapshots, refreshRecords])

  // 自动审计事件：刷新快照和报告列表
  useEffect(() => {
    const unsub = window.api.audit.onAutoCreated(() => {
      refreshSnapshots()
      refreshRecords()
    })
    return unsub
  }, [refreshSnapshots, refreshRecords])

  // 当选择连接后加载数据库列表
  useEffect(() => {
    setSaveDb('')
    setSaveDbs([])
    if (!saveConnId) return
    window.api.schema.databases(saveConnId).then(setSaveDbs).catch(() => {})
  }, [saveConnId])

  const handleSaveSnapshot = async () => {
    if (!saveConnId || !saveDb) return
    setSaving(true)
    setSaveError(null)
    try {
      await window.api.audit.snapshotSave(saveConnId, saveDb, saveName || undefined)
      setSaveName('')
      await refreshSnapshots()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSnapshot = async (id: string) => {
    await window.api.audit.snapshotDelete(id)
    await refreshSnapshots()
    await refreshRecords()
    if (selectedRecord?.snapshotId === id) setSelectedRecord(null)
  }

  const handleGenerate = async (snapshotId: string) => {
    setGeneratingId(snapshotId)
    setGenerateError(null)
    try {
      const record = await window.api.audit.generate(snapshotId)
      await refreshRecords()
      setSelectedRecord(record)
      setDiffFilter('different')
      setDetailOpen(true)
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGeneratingId(null)
    }
  }

  const handleViewRecord = async (id: string) => {
    if (selectedRecord?.id === id) {
      setDetailOpen((v) => !v)
      return
    }
    const record = await window.api.audit.recordGet(id)
    setSelectedRecord(record)
    setDiffFilter('different')
    setDetailOpen(true)
  }

  const handleDeleteRecord = async (id: string) => {
    await window.api.audit.recordDelete(id)
    await refreshRecords()
    if (selectedRecord?.id === id) setSelectedRecord(null)
  }

  const handleExportMd = (record: AuditRecord) => {
    const content = exportToMarkdown(record)
    const ts = new Date(record.createdAt).toISOString().slice(0, 10)
    downloadMarkdown(content, `audit-${record.database}-${ts}.md`)
  }

  const handleExportMdById = async (id: string) => {
    const record = selectedRecord?.id === id ? selectedRecord : await window.api.audit.recordGet(id)
    handleExportMd(record)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">

      {/* ── 快照管理 ── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          icon={<Camera className="h-4 w-4" />}
          title="快照管理"
          count={snapshots.length}
        />

        {/* 保存新快照 */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={saveConnId} onValueChange={setSaveConnId}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="选择连接" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={saveDb} onValueChange={setSaveDb} disabled={!saveConnId || saveDbs.length === 0}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="选择数据库" />
            </SelectTrigger>
            <SelectContent>
              {saveDbs.map((db) => (
                <SelectItem key={db} value={db}>
                  {db}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            className="h-8 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring min-w-[160px]"
            placeholder="快照名称（可选）"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />

          <Button
            size="sm"
            disabled={!saveConnId || !saveDb || saving}
            onClick={handleSaveSnapshot}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
            保存快照
          </Button>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-sm text-destructive mb-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        {snapshots.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            暂无快照，选择数据库后点击「保存快照」开始记录基线
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {snapshots.map((snap) => (
              <div key={snap.id} className="flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-muted/40 transition-colors">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{snap.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {connName(snap.connectionId)} · {snap.database} ·{' '}
                    {new Date(snap.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  disabled={generatingId === snap.id}
                  onClick={() => handleGenerate(snap.id)}
                >
                  {generatingId === snap.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <BarChart3 className="h-3 w-3 mr-1" />
                  )}
                  生成报告
                </Button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors shrink-0"
                  onClick={() => handleDeleteSnapshot(snap.id)}
                  title="删除快照"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {generateError && (
          <div className="flex items-center gap-2 text-sm text-destructive mt-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {generateError}
          </div>
        )}
      </section>

      {/* ── 审计报告列表 ── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          icon={<ClipboardList className="h-4 w-4" />}
          title="变更报告"
          count={records.length}
        />

        {records.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            暂无报告，点击快照的「生成报告」对比当前结构变化
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {records.map((rec) => {
              const isActive = selectedRecord?.id === rec.id
              return (
                <div
                  key={rec.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                    isActive ? 'bg-primary/5' : 'bg-background hover:bg-muted/40'
                  }`}
                >
                  {isActive && detailOpen ? (
                    <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{rec.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rec.database} · {new Date(rec.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <SummaryChips summary={rec.diff.summary} />
                  <Button
                    variant={isActive && detailOpen ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => handleViewRecord(rec.id)}
                  >
                    {isActive && detailOpen ? '收起' : '查看'}
                  </Button>
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0"
                    onClick={() => handleExportMdById(rec.id)}
                    title="导出 Markdown"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors shrink-0"
                    onClick={() => handleDeleteRecord(rec.id)}
                    title="删除报告"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 报告详情 ── */}
      {selectedRecord && detailOpen && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h3 className="font-semibold text-sm">{selectedRecord.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedRecord.database} · 快照基线：{selectedRecord.snapshotName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleExportMd(selectedRecord)}
              >
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                导出 MD
              </Button>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                onClick={() => setDetailOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4">
            <DiffSummaryBar
              variant="inline"
              summary={selectedRecord.diff.summary}
              filter={diffFilter}
              onFilterChange={setDiffFilter}
            />
            <TableDiffList
              result={selectedRecord.diff}
              leftTarget={{ connectionId: selectedRecord.connectionId, database: selectedRecord.database }}
              rightTarget={{ connectionId: selectedRecord.connectionId, database: selectedRecord.database }}
              connections={connections}
              onReset={() => setSelectedRecord(null)}
              filter={diffFilter}
            />
          </div>
        </section>
      )}
    </div>
  )
}
