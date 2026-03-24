import React, { useState } from 'react'
import type { IndexDiff } from '@/types'
import { Eye, EyeOff, Key } from 'lucide-react'
import { Button } from './ui/button'

interface IndexDiffTableProps {
  indexes: IndexDiff[]
  leftLabel: string
  rightLabel: string
}

export function IndexDiffTable({ indexes, leftLabel, rightLabel }: IndexDiffTableProps) {
  const [showSame, setShowSame] = useState(false)

  const diffCount = indexes.filter((i) => i.status !== 'same').length
  const sameCount = indexes.filter((i) => i.status === 'same').length

  if (indexes.length === 0) return null

  const visible = showSame ? indexes : indexes.filter((i) => i.status !== 'same')

  return (
    <div className="border-t">
      <div className="flex items-center gap-2 px-8 py-2 bg-muted/20 border-b">
        <Key className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          索引对比
        </span>
        {diffCount > 0 && (
          <span className="text-xs text-amber-600 font-medium">{diffCount} 个差异</span>
        )}
        {diffCount === 0 && (
          <span className="text-xs text-green-600">全部一致</span>
        )}
      </div>

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left py-2 pl-8 pr-2 font-medium text-muted-foreground w-[160px]">
                  索引名
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[28px]" />
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                  <span className="text-blue-600">{leftLabel}</span>
                </th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                  <span className="text-purple-600">{rightLabel}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((idx) => (
                <IndexRow key={idx.name} diff={idx} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sameCount > 0 && (
        <div className="flex items-center justify-between px-8 py-2 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            还有 {sameCount} 个相同索引已折叠
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setShowSame(!showSame)}
          >
            {showSame ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showSame ? '收起' : '展开'}
          </Button>
        </div>
      )}
    </div>
  )
}

function IndexRow({ diff }: { diff: IndexDiff }) {
  const rowBg =
    diff.status === 'left_only'
      ? 'bg-blue-50/60'
      : diff.status === 'right_only'
        ? 'bg-purple-50/60'
        : diff.status === 'modified'
          ? 'bg-amber-50/60'
          : 'hover:bg-muted/20'

  const indicator =
    diff.status === 'left_only' ? (
      <span className="text-blue-500 text-[10px] font-bold">←</span>
    ) : diff.status === 'right_only' ? (
      <span className="text-purple-500 text-[10px] font-bold">→</span>
    ) : diff.status === 'modified' ? (
      <span className="text-amber-500 text-[10px] font-bold">≠</span>
    ) : (
      <span className="text-green-500 text-[10px]">✓</span>
    )

  return (
    <tr className={`border-b last:border-0 ${rowBg} transition-colors`}>
      <td className="py-2 pl-8 pr-2 font-mono font-medium text-foreground">
        {diff.name}
        {diff.changedFields.length > 0 && (
          <span className="ml-1.5 text-[10px] text-amber-600 font-normal">
            ({diff.changedFields.join(', ')})
          </span>
        )}
      </td>
      <td className="py-2 px-2 text-center">{indicator}</td>
      <td className="py-2 px-3">
        {diff.left ? <IndexInfoCell info={diff.left} compare={diff.right} /> : <MissingCell />}
      </td>
      <td className="py-2 px-3">
        {diff.right ? <IndexInfoCell info={diff.right} compare={diff.left} /> : <MissingCell />}
      </td>
    </tr>
  )
}

function IndexInfoCell({ info, compare }: { info: NonNullable<IndexDiff['left']>; compare: IndexDiff['left'] }) {
  const colsStr = info.columns.join(', ')
  const colsChanged = compare && info.columns.join(',') !== compare.columns.join(',')
  const uniqueChanged = compare && info.unique !== compare.unique
  const typeChanged = compare && info.type !== compare.type

  const hl = (changed: boolean | null) =>
    changed ? 'bg-amber-100 text-amber-900 rounded px-1' : ''

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs leading-relaxed">
      <span className={`font-mono ${colsChanged ? hl(true) : ''}`}>
        ({colsStr})
      </span>
      <span className={`${uniqueChanged ? hl(true) : 'text-muted-foreground'}`}>
        {info.unique ? 'UNIQUE' : 'NON-UNIQUE'}
      </span>
      <span className={`${typeChanged ? hl(true) : 'text-muted-foreground'}`}>
        {info.type}
      </span>
    </div>
  )
}

function MissingCell() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground/60 italic">
      <div className="h-px flex-1 bg-muted-foreground/20 max-w-[32px]" />
      <span className="text-[11px]">缺失</span>
      <div className="h-px flex-1 bg-muted-foreground/20 max-w-[32px]" />
    </div>
  )
}
