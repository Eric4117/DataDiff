import React, { useState } from 'react'
import type { ColumnDiff, ColumnInfo } from '@/types'
import { Eye, EyeOff, ArrowUpDown } from 'lucide-react'
import { Button } from './ui/button'

interface ColumnDiffTableProps {
  columns: ColumnDiff[]
  leftLabel: string
  rightLabel: string
  orderChanged?: boolean
}

export function ColumnDiffTable({ columns, leftLabel, rightLabel, orderChanged }: ColumnDiffTableProps) {
  const [showSame, setShowSame] = useState(false)

  const diffCount = columns.filter((c) => c.status !== 'same').length
  const sameCount = columns.filter((c) => c.status === 'same' && !c.orderChanged).length
  const orderDiffCount = columns.filter((c) => c.orderChanged).length
  const visible = showSame ? columns : columns.filter((c) => c.status !== 'same' || c.orderChanged)

  return (
    <div className="border-t">
      {orderChanged && (
        <div className="flex items-center gap-2 px-8 py-2 bg-orange-50 border-b border-orange-200 text-xs text-orange-700">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
          <span>
            两侧字段顺序不一致（{orderDiffCount} 个字段位置不同），当前按左侧顺序显示，
            <span className="font-mono font-medium">#序号</span> 列标注了各自原始位置
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-left py-2 pl-8 pr-2 font-medium text-muted-foreground w-[140px]">
                字段名
              </th>
              {orderChanged && (
                <th className="text-center py-2 px-1 font-medium text-muted-foreground w-[64px]" title="左侧#序号 / 右侧#序号">
                  #序号
                </th>
              )}
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
            {visible.map((col, i) => (
              <ColumnRow key={col.name + i} col={col} showOrder={!!orderChanged} />
            ))}
          </tbody>
        </table>
      </div>

      {sameCount > 0 && (
        <div className="flex items-center justify-between px-8 py-2 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            还有 {sameCount} 个相同字段已折叠
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setShowSame(!showSame)}
          >
            {showSame ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showSame ? '收起相同字段' : '展开相同字段'}
          </Button>
        </div>
      )}

      {diffCount === 0 && !orderChanged && columns.length > 0 && (
        <div className="px-8 py-2 text-xs text-green-600 bg-green-50/50 border-t">
          所有字段完全一致
        </div>
      )}
    </div>
  )
}

function ColumnRow({ col, showOrder }: { col: ColumnDiff; showOrder: boolean }) {
  const rowBg =
    col.status === 'left_only'
      ? 'bg-blue-50/60 hover:bg-blue-50'
      : col.status === 'right_only'
        ? 'bg-purple-50/60 hover:bg-purple-50'
        : col.status === 'modified' || col.orderChanged
          ? 'bg-amber-50/60 hover:bg-amber-50'
          : 'hover:bg-muted/20'

  const indicator =
    col.status === 'left_only' ? (
      <span className="text-blue-500 text-[10px] font-bold">←</span>
    ) : col.status === 'right_only' ? (
      <span className="text-purple-500 text-[10px] font-bold">→</span>
    ) : col.orderChanged && col.changedFields.length === 0 ? (
      <span className="text-orange-500 text-[10px] font-bold" title="仅顺序不同">↕</span>
    ) : col.status === 'modified' ? (
      <span className="text-amber-500 text-[10px] font-bold">≠</span>
    ) : (
      <span className="text-green-500 text-[10px]">✓</span>
    )

  return (
    <tr className={`border-b last:border-0 ${rowBg} transition-colors`}>
      <td className="py-2 pl-8 pr-2 font-mono font-medium text-foreground">
        {col.name}
        {col.changedFields.length > 0 && (
          <span className="ml-1.5 text-[10px] text-amber-600 font-normal">
            ({col.changedFields.join(', ')})
          </span>
        )}
      </td>
      {showOrder && (
        <td className="py-2 px-1 text-center font-mono text-[10px]">
          <OrderBadge left={col.left?.ordinalPosition} right={col.right?.ordinalPosition} changed={col.orderChanged} />
        </td>
      )}
      <td className="py-2 px-2 text-center">{indicator}</td>
      <td className="py-2 px-3">
        {col.left ? (
          <ColumnInfoCell info={col.left} compare={col.right} isLeft />
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="py-2 px-3">
        {col.right ? (
          <ColumnInfoCell info={col.right} compare={col.left} isLeft={false} />
        ) : (
          <MissingCell />
        )}
      </td>
    </tr>
  )
}

function OrderBadge({
  left,
  right,
  changed
}: {
  left?: number
  right?: number
  changed: boolean
}) {
  if (left == null && right == null) return null

  if (left != null && right == null) {
    return <span className="text-blue-500">#{left}</span>
  }
  if (left == null && right != null) {
    return <span className="text-purple-500">#{right}</span>
  }

  if (!changed) {
    return <span className="text-muted-foreground">#{left}</span>
  }

  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-100 text-orange-700" title={`左侧#${left} / 右侧#${right}`}>
      {left}<span className="text-orange-400">/</span>{right}
    </span>
  )
}

function ColumnInfoCell({
  info,
  compare,
  isLeft
}: {
  info: ColumnInfo
  compare: ColumnInfo | null
  isLeft: boolean
}) {
  const typeChanged = compare && info.type !== compare.type
  const nullChanged = compare && info.nullable !== compare.nullable
  const keyChanged = compare && info.key !== compare.key
  const defaultChanged = compare && (info.default ?? '') !== (compare.default ?? '')
  const extraChanged = compare && info.extra !== compare.extra
  const commentChanged = compare && info.comment !== compare.comment
  const charsetChanged = compare && (info.charset ?? '') !== (compare.charset ?? '')
  const collationChanged = compare && (info.collation ?? '') !== (compare.collation ?? '')

  const hl = (changed: boolean | null) =>
    changed ? 'bg-amber-100 text-amber-900 rounded px-1' : ''

  const parts: React.ReactNode[] = []

  parts.push(
    <span key="type" className={`font-mono ${typeChanged ? hl(true) : ''}`}>
      {info.type}
    </span>
  )

  parts.push(
    <span key="null" className={`${nullChanged ? hl(true) : 'text-muted-foreground'}`}>
      {info.nullable ? ' NULL' : ' NOT NULL'}
    </span>
  )

  if (info.key === 'PRI') {
    parts.push(
      <span key="key" className={`ml-1 text-amber-600 font-semibold ${keyChanged ? hl(true) : ''}`}>
        PK
      </span>
    )
  } else if (info.key === 'UNI') {
    parts.push(
      <span key="key" className={`ml-1 text-blue-600 ${keyChanged ? hl(true) : ''}`}>
        UNI
      </span>
    )
  } else if (info.key === 'MUL') {
    parts.push(
      <span key="key" className={`ml-1 text-slate-500 ${keyChanged ? hl(true) : ''}`}>
        IDX
      </span>
    )
  }

  if (info.extra) {
    parts.push(
      <span key="extra" className={`ml-1 text-indigo-600 italic ${extraChanged ? hl(true) : ''}`}>
        {info.extra}
      </span>
    )
  }

  if (info.default !== null && info.default !== undefined) {
    parts.push(
      <span key="default" className={`ml-1 ${defaultChanged ? hl(true) : 'text-muted-foreground'}`}>
        ={info.default === '' ? "''" : info.default}
      </span>
    )
  }

  if (info.charset && (charsetChanged || collationChanged)) {
    parts.push(
      <span key="charset" className={`ml-1 ${charsetChanged ? hl(true) : 'text-muted-foreground'}`}>
        [{info.charset}]
      </span>
    )
  }

  if (info.collation && collationChanged) {
    parts.push(
      <span key="collation" className={`ml-1 ${hl(true)}`}>
        {info.collation}
      </span>
    )
  }

  if (info.comment) {
    parts.push(
      <span
        key="comment"
        className={`ml-1 ${commentChanged ? hl(true) : 'text-muted-foreground'} max-w-[120px] truncate`}
        title={info.comment}
      >
        /* {info.comment} */
      </span>
    )
  }

  return <div className="flex flex-wrap items-center gap-px leading-relaxed">{parts}</div>
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
