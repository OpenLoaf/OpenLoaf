/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import type { CanvasNodeDefinition, CanvasNodeViewProps, CanvasToolbarContext } from '../engine/types'
import type { KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import i18next from 'i18next'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import {
  Columns2,
  Grid3X3,
  Merge,
  Minus,
  Rows3,
  Split,
  Trash2,
} from 'lucide-react'
import { cn } from '@udecode/cn'
import { NodeFrame } from './NodeFrame'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TableVariant = 'default' | 'striped' | 'bordered'

export type TableCell = {
  /** Cell unique id */
  id: string
  /** Cell text content */
  content: string
  /** Column span for merged cells */
  colSpan?: number
  /** Row span for merged cells */
  rowSpan?: number
  /** Whether this cell is hidden (covered by a merge) */
  hidden?: boolean
}

export type TableRow = {
  /** Row unique id */
  id: string
  /** Cells in this row */
  cells: TableCell[]
  /** Optional explicit row height */
  height?: number
}

export type TableColumn = {
  /** Column unique id */
  id: string
  /** Column width in pixels */
  width: number
}

export type TableNodeProps = {
  /** Column definitions (widths) */
  columns: TableColumn[]
  /** Row data */
  rows: TableRow[]
  /** Whether to show the header row with special styling */
  showHeader: boolean
  /** Visual variant */
  variant: TableVariant
}

// ---------------------------------------------------------------------------
// Cell key helper
// ---------------------------------------------------------------------------

function cellKey(rowIdx: number, colIdx: number) {
  return `${rowIdx}:${colIdx}`
}

// ---------------------------------------------------------------------------
// Default table factory
// ---------------------------------------------------------------------------

function createDefaultTable(cols = 3, rows = 3): TableNodeProps {
  const columns: TableColumn[] = Array.from({ length: cols }, () => ({
    id: nanoid(8),
    width: 120,
  }))
  const makeRow = (isHeader: boolean): TableRow => ({
    id: nanoid(8),
    cells: Array.from({ length: cols }, (_, ci) => ({
      id: nanoid(8),
      content: isHeader ? i18next.t('board:tableNode.defaultColHeader', { index: ci + 1 }) : '',
    })),
  })
  const rowList: TableRow[] = [
    makeRow(true),
    ...Array.from({ length: rows - 1 }, () => makeRow(false)),
  ]
  return {
    columns,
    rows: rowList,
    showHeader: true,
    variant: 'bordered',
  }
}

// ---------------------------------------------------------------------------
// Toolbar items
// ---------------------------------------------------------------------------

function createTableToolbarItems(ctx: CanvasToolbarContext<TableNodeProps>) {
  const { element, updateNodeProps } = ctx
  const props = element.props

  const addRow = () => {
    const newRow: TableRow = {
      id: nanoid(8),
      cells: props.columns.map(() => ({ id: nanoid(8), content: '' })),
    }
    updateNodeProps({ rows: [...props.rows, newRow] })
  }

  const addColumn = () => {
    const newCol: TableColumn = { id: nanoid(8), width: 120 }
    const newColumns = [...props.columns, newCol]
    const newColIndex = props.columns.length
    const headerContent = i18next.t('board:tableNode.defaultColHeader', {
      index: newColIndex + 1,
    })
    const newRows = props.rows.map((row, rowIdx) => ({
      ...row,
      cells: [
        ...row.cells,
        {
          id: nanoid(8),
          content: props.showHeader && rowIdx === 0 ? headerContent : '',
        },
      ],
    }))
    updateNodeProps({ columns: newColumns, rows: newRows })
  }

  const deleteLastRow = () => {
    if (props.rows.length <= 1) return
    updateNodeProps({ rows: props.rows.slice(0, -1) })
  }

  const deleteLastColumn = () => {
    if (props.columns.length <= 1) return
    updateNodeProps({
      columns: props.columns.slice(0, -1),
      rows: props.rows.map((row) => ({ ...row, cells: row.cells.slice(0, -1) })),
    })
  }

  const toggleHeader = () => {
    updateNodeProps({ showHeader: !props.showHeader })
  }

  return [
    {
      id: 'table-add-row',
      label: i18next.t('board:tableNode.toolbar.addRow'),
      icon: <Rows3 size={14} />,
      onSelect: addRow,
    },
    {
      id: 'table-add-col',
      label: i18next.t('board:tableNode.toolbar.addColumn'),
      icon: <Columns2 size={14} />,
      onSelect: addColumn,
    },
    {
      id: 'table-del-row',
      label: i18next.t('board:tableNode.toolbar.deleteLastRow'),
      icon: <Minus size={14} />,
      onSelect: deleteLastRow,
    },
    {
      id: 'table-del-col',
      label: i18next.t('board:tableNode.toolbar.deleteLastColumn'),
      icon: <Trash2 size={14} />,
      onSelect: deleteLastColumn,
    },
    {
      id: 'table-toggle-header',
      label: props.showHeader
        ? i18next.t('board:tableNode.toolbar.hideHeader')
        : i18next.t('board:tableNode.toolbar.showHeader'),
      active: props.showHeader,
      icon: <Grid3X3 size={14} />,
      onSelect: toggleHeader,
    },
  ]
}

// ---------------------------------------------------------------------------
// Column resize handle
// ---------------------------------------------------------------------------

type ColResizeHandleProps = {
  colIdx: number
  onResize: (colIdx: number, delta: number) => void
  onResizeEnd: () => void
}

function ColResizeHandle({ colIdx, onResize, onResizeEnd }: ColResizeHandleProps) {
  const dragging = useRef(false)
  const startX = useRef(0)

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(colIdx, delta)
    },
    [colIdx, onResize],
  )

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    onResizeEnd()
  }, [onResizeEnd])

  return (
    <div
      data-board-editor
      className={cn(
        'absolute right-0 top-0 h-full w-1 cursor-col-resize z-10',
        'hover:bg-ol-blue/40 active:bg-ol-blue/60',
      )}
      style={{ transform: 'translateX(50%)' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

// ---------------------------------------------------------------------------
// Single cell
// ---------------------------------------------------------------------------

type TableCellViewProps = {
  cell: TableCell
  rowIdx: number
  colIdx: number
  isHeader: boolean
  isEditing: boolean
  isSelected: boolean
  variant: TableVariant
  onCellClick: (rowIdx: number, colIdx: number, e: MouseEvent) => void
  onCellDoubleClick: (rowIdx: number, colIdx: number) => void
  onCellChange: (rowIdx: number, colIdx: number, value: string) => void
  onCellKeyDown: (rowIdx: number, colIdx: number, e: KeyboardEvent<HTMLTextAreaElement>) => void
  onCellBlur: () => void
}

const TableCellView = memo(function TableCellView({
  cell,
  rowIdx,
  colIdx,
  isHeader,
  isEditing,
  isSelected,
  variant,
  onCellClick,
  onCellDoubleClick,
  onCellChange,
  onCellKeyDown,
  onCellBlur,
}: TableCellViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  const cellCls = cn(
    'relative min-h-[28px] px-2 py-1 text-xs outline-none select-none overflow-hidden',
    'transition-colors duration-100',
    isHeader && 'font-semibold bg-muted/60 dark:bg-muted/40',
    variant === 'bordered' && 'border border-border/60',
    isSelected && !isEditing && 'ring-2 ring-inset ring-ol-blue/50',
    !isSelected && !isEditing && 'hover:bg-foreground/4',
  )

  return (
    <td
      colSpan={cell.colSpan}
      rowSpan={cell.rowSpan}
      className={cellCls}
      onClick={(e) => onCellClick(rowIdx, colIdx, e)}
      onDoubleClick={() => onCellDoubleClick(rowIdx, colIdx)}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          data-board-editor
          className={cn(
            'w-full h-full min-h-[24px] resize-none bg-transparent outline-none',
            'text-xs leading-relaxed p-0 border-0 font-inherit',
            isHeader && 'font-semibold',
          )}
          value={cell.content}
          onChange={(e) => onCellChange(rowIdx, colIdx, e.target.value)}
          onKeyDown={(e) => onCellKeyDown(rowIdx, colIdx, e)}
          onBlur={onCellBlur}
          rows={1}
          style={{ fontFamily: 'inherit' }}
        />
      ) : (
        <span className="whitespace-pre-wrap break-words leading-relaxed">
          {cell.content || (isEditing ? '' : <span className="text-foreground/30">&nbsp;</span>)}
        </span>
      )}
    </td>
  )
})

// ---------------------------------------------------------------------------
// Main TableNodeView
// ---------------------------------------------------------------------------

export function TableNodeView({ element, selected, editing, onUpdate }: CanvasNodeViewProps<TableNodeProps>) {
  const props = element.props
  const { columns, rows, showHeader, variant } = props

  // Selection state: set of "rowIdx:colIdx"
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [colWidths, setColWidths] = useState<number[]>(() => columns.map((c) => c.width))
  const [selectionAnchor, setSelectionAnchor] = useState<[number, number] | null>(null)

  // Keep colWidths in sync only when the column set changes (add/remove/reorder).
  // Width-only prop updates (e.g. our own persist on drag end) must not override
  // in-progress local colWidths state.
  const columnsKey = columns.map((c) => c.id).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on id list only
  useEffect(() => {
    setColWidths(columns.map((c) => c.width))
  }, [columnsKey])

  // Stop editing when node loses selection
  useEffect(() => {
    if (!selected && !editing) {
      setEditingCell(null)
      setSelectedCells(new Set())
    }
  }, [selected, editing])

  // ---- Cell interactions ----

  const handleCellClick = useCallback(
    (rowIdx: number, colIdx: number, e: MouseEvent) => {
      // Ignore clicks on hidden (merged-covered) cells
      if (rows[rowIdx]?.cells[colIdx]?.hidden) return
      const key = cellKey(rowIdx, colIdx)
      if (e.shiftKey && selectionAnchor) {
        // Range selection
        const [ar, ac] = selectionAnchor
        const minR = Math.min(ar, rowIdx)
        const maxR = Math.max(ar, rowIdx)
        const minC = Math.min(ac, colIdx)
        const maxC = Math.max(ac, colIdx)
        const range = new Set<string>()
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            range.add(cellKey(r, c))
          }
        }
        setSelectedCells(range)
      } else {
        setSelectedCells(new Set([key]))
        setSelectionAnchor([rowIdx, colIdx])
        setEditingCell(null)
      }
    },
    [selectionAnchor, rows],
  )

  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    const key = cellKey(rowIdx, colIdx)
    setEditingCell(key)
    setSelectedCells(new Set([key]))
  }, [])

  const handleCellChange = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      const newRows = rows.map((row, ri) => {
        if (ri !== rowIdx) return row
        return {
          ...row,
          cells: row.cells.map((cell, ci) => {
            if (ci !== colIdx) return cell
            return { ...cell, content: value }
          }),
        }
      })
      onUpdate({ rows: newRows })
    },
    [rows, onUpdate],
  )

  const handleCellKeyDown = useCallback(
    (rowIdx: number, colIdx: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
      // IME composition guard
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Escape') {
        setEditingCell(null)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const nextCol = colIdx + 1
        if (nextCol < columns.length) {
          setEditingCell(cellKey(rowIdx, nextCol))
          setSelectedCells(new Set([cellKey(rowIdx, nextCol)]))
        } else if (rowIdx + 1 < rows.length) {
          setEditingCell(cellKey(rowIdx + 1, 0))
          setSelectedCells(new Set([cellKey(rowIdx + 1, 0)]))
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        setEditingCell(null)
      }
    },
    [columns.length, rows.length],
  )

  const handleCellBlur = useCallback(() => {
    // Keep editing state until explicit Escape/Enter or external deselect
  }, [])

  // ---- Column resize ----

  const handleColResize = useCallback(
    (colIdx: number, delta: number) => {
      setColWidths((prev) => {
        const next = [...prev]
        next[colIdx] = Math.max(60, (next[colIdx] ?? 120) + delta)
        return next
      })
    },
    [],
  )

  // Persist column widths only when drag ends — avoids per-pixel onUpdate overhead
  const colWidthsRef = useRef(colWidths)
  colWidthsRef.current = colWidths

  const handleColResizeEnd = useCallback(() => {
    const newColumns = columns.map((col, i) => ({
      ...col,
      width: colWidthsRef.current[i] ?? col.width,
    }))
    onUpdate({ columns: newColumns })
  }, [columns, onUpdate])

  // ---- Merge / split ----
  const canMerge = selectedCells.size > 1
  const canSplit = useMemo(() => {
    if (selectedCells.size !== 1) return false
    const [key] = selectedCells
    const [ri, ci] = key.split(':').map(Number)
    const cell = rows[ri]?.cells[ci]
    return (cell?.colSpan ?? 1) > 1 || (cell?.rowSpan ?? 1) > 1
  }, [selectedCells, rows])

  const handleMerge = useCallback(() => {
    if (!canMerge) return
    const coords = Array.from(selectedCells).map((k) => k.split(':').map(Number) as [number, number])
    const minR = Math.min(...coords.map(([r]) => r))
    const maxR = Math.max(...coords.map(([r]) => r))
    const minC = Math.min(...coords.map(([, c]) => c))
    const maxC = Math.max(...coords.map(([, c]) => c))
    const rSpan = maxR - minR + 1
    const cSpan = maxC - minC + 1
    // Validate selection forms a filled rectangle (no L-shapes or gaps)
    if (selectedCells.size !== rSpan * cSpan) return
    const combinedContent = coords
      .sort(([ar, ac], [br, bc]) => ar - br || ac - bc)
      .map(([r, c]) => rows[r]?.cells[c]?.content ?? '')
      .filter(Boolean)
      .join(' ')
    const newRows = rows.map((row, ri) => ({
      ...row,
      cells: row.cells.map((cell, ci) => {
        if (ri === minR && ci === minC) {
          return { ...cell, content: combinedContent, colSpan: cSpan, rowSpan: rSpan }
        }
        if (ri >= minR && ri <= maxR && ci >= minC && ci <= maxC) {
          return { ...cell, hidden: true, content: '' }
        }
        return cell
      }),
    }))
    onUpdate({ rows: newRows })
    setSelectedCells(new Set([cellKey(minR, minC)]))
  }, [canMerge, selectedCells, rows, onUpdate])

  const handleSplit = useCallback(() => {
    if (!canSplit) return
    const [key] = selectedCells
    const [ri, ci] = key.split(':').map(Number)
    const newRows = rows.map((row, rowIdx) => ({
      ...row,
      cells: row.cells.map((cell, colIdx) => {
        if (rowIdx === ri && colIdx === ci) {
          return { ...cell, colSpan: 1, rowSpan: 1 }
        }
        const topCell = rows[ri]?.cells[ci]
        const rSpan = topCell?.rowSpan ?? 1
        const cSpan = topCell?.colSpan ?? 1
        if (
          rowIdx >= ri && rowIdx < ri + rSpan &&
          colIdx >= ci && colIdx < ci + cSpan &&
          !(rowIdx === ri && colIdx === ci)
        ) {
          return { ...cell, hidden: false }
        }
        return cell
      }),
    }))
    onUpdate({ rows: newRows })
  }, [canSplit, selectedCells, rows, onUpdate])

  // ---- Styling ----

  const tableContainerCls = cn(
    'board-text-scrollbar h-full w-full overflow-auto rounded-2xl border border-border/60 box-border',
    'bg-background/95',
  )

  const tableCls = cn('border-collapse text-xs')

  const totalWidth = colWidths.reduce((s, w) => s + w, 0)

  return (
    <NodeFrame>
      <div className={tableContainerCls}>
        {/* Merge/split context bar — shown when cells are selected */}
        {selected && (canMerge || canSplit) && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40 bg-background/80">
            {canMerge && (
              <button
                type="button"
                data-board-editor
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                  'bg-foreground/8 hover:bg-foreground/12 transition-colors duration-150',
                )}
                onClick={handleMerge}
              >
                <Merge size={11} />
                <span>{i18next.t('board:tableNode.toolbar.merge')}</span>
              </button>
            )}
            {canSplit && (
              <button
                type="button"
                data-board-editor
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                  'bg-foreground/8 hover:bg-foreground/12 transition-colors duration-150',
                )}
                onClick={handleSplit}
              >
                <Split size={11} />
                <span>{i18next.t('board:tableNode.toolbar.split')}</span>
              </button>
            )}
          </div>
        )}

        <div className="relative" style={{ width: totalWidth }}>
          <table
            className={tableCls}
            style={{ width: totalWidth, tableLayout: 'fixed' }}
          >
            <colgroup>
              {colWidths.map((w, i) => (
                <col key={columns[i]?.id ?? `col-${i}`} style={{ width: w }} />
              ))}
            </colgroup>

            <tbody>
              {rows.map((row, rowIdx) => {
                const isHeaderRow = showHeader && rowIdx === 0
                const isStriped = variant === 'striped' && rowIdx % 2 === 1
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      isStriped && 'bg-foreground/3 dark:bg-foreground/5',
                    )}
                  >
                    {row.cells.map((cell, colIdx) => {
                      if (cell.hidden) return null
                      const key = cellKey(rowIdx, colIdx)
                      return (
                        <TableCellView
                          key={cell.id}
                          cell={cell}
                          rowIdx={rowIdx}
                          colIdx={colIdx}
                          isHeader={isHeaderRow}
                          isEditing={editingCell === key}
                          isSelected={selectedCells.has(key)}
                          variant={variant}
                          onCellClick={handleCellClick}
                          onCellDoubleClick={handleCellDoubleClick}
                          onCellChange={handleCellChange}
                          onCellKeyDown={handleCellKeyDown}
                          onCellBlur={handleCellBlur}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Column resize handles — absolute over table, full height */}
          {selected && (
            <div className="absolute inset-0 pointer-events-none">
              {colWidths.map((_, i) => {
                const left = colWidths.slice(0, i + 1).reduce((s, v) => s + v, 0)
                return (
                  <div
                    key={columns[i]?.id ?? `col-${i}`}
                    className="absolute top-0 h-full pointer-events-auto"
                    style={{ left: left - 4, width: 8 }}
                  >
                    <ColResizeHandle colIdx={i} onResize={handleColResize} onResizeEnd={handleColResizeEnd} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </NodeFrame>
  )
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const TableNodeDefinition: CanvasNodeDefinition<TableNodeProps> = {
  type: 'table',
  schema: z.object({
    columns: z.array(
      z.object({
        id: z.string(),
        width: z.number(),
      }),
    ),
    rows: z.array(
      z.object({
        id: z.string(),
        cells: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            colSpan: z.number().optional(),
            rowSpan: z.number().optional(),
            hidden: z.boolean().optional(),
          }),
        ),
        height: z.number().optional(),
      }),
    ),
    showHeader: z.boolean(),
    variant: z.enum(['default', 'striped', 'bordered']),
  }),
  defaultProps: createDefaultTable(3, 4),
  view: TableNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: 'anchors',
    maxSize: { w: 1600, h: 2400 },
  },
  getMinSize: (element) => {
    const p = element.props as TableNodeProps
    const colCount = p.columns.length
    const rowCount = p.rows.length
    return {
      w: Math.max(200, colCount * 80),
      h: Math.max(120, rowCount * 32),
    }
  },
  toolbar: (ctx) => createTableToolbarItems(ctx),
}
