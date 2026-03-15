/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useTranslation } from 'react-i18next'
import { Crosshair, Image, LogOut, StickyNote, Type, Video, Music, File, Link, Box } from 'lucide-react'
import { Button } from '@openloaf/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { CanvasNodeElement } from '../engine/types'

type GroupMembersDialogProps = {
  /** Group node id, null to close. */
  groupId: string | null
  /** Canvas engine reference. */
  engine: CanvasEngine
  /** Close handler. */
  onClose: () => void
}

/** Icon map for common node types. */
const NODE_TYPE_ICONS: Record<string, typeof Box> = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music,
  link: Link,
  'sticky-note': StickyNote,
  'file-attachment': File,
}

/** Resolve a display icon for a node type. */
function getNodeTypeIcon(type: string) {
  return NODE_TYPE_ICONS[type] ?? Box
}

/** Resolve a short label for a node type. */
function getNodeTypeLabel(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Get a text summary for a node element. */
function getNodeSummary(element: CanvasNodeElement): string {
  const props = element.props as Record<string, unknown>
  if (typeof props.title === 'string' && props.title) return props.title
  if (typeof props.url === 'string' && props.url) return props.url
  if (typeof props.fileName === 'string' && props.fileName) return props.fileName
  return ''
}

/** Dialog for viewing and managing group members. */
export function GroupMembersDialog({
  groupId,
  engine,
  onClose,
}: GroupMembersDialogProps) {
  const { t } = useTranslation('board')

  if (!groupId) return null

  const groupElement = engine.doc.getElementById(groupId)
  if (!groupElement || groupElement.kind !== 'node') return null

  const memberIds = engine.getGroupMemberIds(groupId)
  const members = memberIds
    .map(id => engine.doc.getElementById(id))
    .filter((el): el is CanvasNodeElement => el?.kind === 'node')

  const handleLocate = (memberId: string) => {
    const member = engine.doc.getElementById(memberId)
    if (!member) return
    const [x, y, w, h] = member.xywh
    engine.selection.setSelection([memberId])
    engine.focusViewportToRect({ x, y, w, h }, { padding: 120 })
    onClose()
  }

  const handleRemoveFromGroup = (memberId: string) => {
    const groupEl = engine.doc.getElementById(groupId)
    if (!groupEl || groupEl.kind !== 'node') return
    const props = groupEl.props as Record<string, unknown>
    const childIds = Array.isArray(props.childIds) ? [...(props.childIds as string[])] : []
    const nextChildIds = childIds.filter(id => id !== memberId)

    // 逻辑：清除成员节点的 groupId 元数据。
    const member = engine.doc.getElementById(memberId)
    if (member) {
      const nextMeta = { ...(member.meta ?? {}) } as Record<string, unknown>
      delete nextMeta.groupId
      const meta = Object.keys(nextMeta).length > 0 ? nextMeta : undefined
      engine.doc.updateElement(memberId, { meta })
    }

    if (nextChildIds.length === 0) {
      // 逻辑：移除最后一个成员时解散组。
      engine.doc.deleteElement(groupId)
      onClose()
    } else {
      engine.doc.updateNodeProps(groupId, { childIds: nextChildIds })
      // 逻辑：重新计算组边界以适应剩余成员。
      engine.refreshGroupBounds(groupId)
    }
    engine.commitHistory()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('groupNode.groupDialog.title')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('groupNode.groupDialog.memberCount', { count: members.length })}
            </span>
          </DialogTitle>
        </DialogHeader>
        {members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('groupNode.groupDialog.empty')}
          </p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
            {members.map(member => {
              const Icon = getNodeTypeIcon(member.type)
              const summary = getNodeSummary(member)
              const [, , w, h] = member.xywh
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-ol-divider px-3 py-2"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon size={16} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {getNodeTypeLabel(member.type)}
                    </p>
                    {summary ? (
                      <p className="truncate text-xs text-muted-foreground">{summary}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {Math.round(w)} × {Math.round(h)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title={t('groupNode.groupDialog.locateOnCanvas')}
                      onClick={() => handleLocate(member.id)}
                    >
                      <Crosshair size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      title={t('groupNode.groupDialog.removeFromGroup')}
                      onClick={() => handleRemoveFromGroup(member.id)}
                    >
                      <LogOut size={14} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
