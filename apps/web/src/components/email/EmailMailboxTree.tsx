import * as React from "react";
import { useDrag, useDrop } from "react-dnd";
import { cn } from "@/lib/utils";

import type { MailboxDragItem, MailboxNode, UnifiedMailboxView } from "./email-types";
import type { SidebarState } from "./use-email-page-state";
import {
  EMAIL_META_CHIP_CLASS,
  EMAIL_TONE_ACTIVE_CLASS,
  EMAIL_TONE_HOVER_CLASS,
} from "./email-style-system";
import {
  getMailboxLabel,
  isMailboxSelectable,
  normalizeEmail,
  resolveMailboxIcon,
} from "./email-utils";

type EmailMailboxTreeProps = {
  accountEmail: string;
  nodes: MailboxNode[];
  activeView: UnifiedMailboxView;
  mailboxUnreadMap: SidebarState["mailboxUnreadMap"];
  dragInsertTarget: SidebarState["dragInsertTarget"];
  draggingMailboxId: SidebarState["draggingMailboxId"];
  onSelectMailbox: SidebarState["onSelectMailbox"];
  onHoverMailbox: SidebarState["onHoverMailbox"];
  onClearHover: SidebarState["onClearHover"];
  onDropMailboxOrder: SidebarState["onDropMailboxOrder"];
  onDragStartMailbox: SidebarState["onDragStartMailbox"];
  onDragEndMailbox: SidebarState["onDragEndMailbox"];
  resolveOrderedMailboxNodes: SidebarState["resolveOrderedMailboxNodes"];
};

type MailboxNodeRowProps = {
  accountEmail: string;
  parentPath: string | null;
  node: MailboxNode;
  depth: number;
  orderedIds: string[];
  orderedNodes: MailboxNode[];
  dragInsertTarget: SidebarState["dragInsertTarget"];
  draggingId: string | null;
  isActive: boolean;
  selectable: boolean;
  count: number;
  onSelectMailbox: SidebarState["onSelectMailbox"];
  onHover: SidebarState["onHoverMailbox"];
  onClearHover: SidebarState["onClearHover"];
  onDrop: SidebarState["onDropMailboxOrder"];
  onDragStart: SidebarState["onDragStartMailbox"];
  onDragEnd: SidebarState["onDragEndMailbox"];
  children?: React.ReactNode;
};

function MailboxNodeRow({
  accountEmail,
  parentPath,
  node,
  depth,
  orderedIds,
  orderedNodes,
  dragInsertTarget,
  draggingId,
  isActive,
  selectable,
  count,
  onSelectMailbox,
  onHover,
  onClearHover,
  onDrop,
  onDragStart,
  onDragEnd,
  children,
}: MailboxNodeRowProps) {
  const Icon = resolveMailboxIcon(node);
  const [, dragRef] = useDrag(
    () => ({
      type: "email-mailbox-item",
      item: () => {
        onDragStart(node.path);
        return {
          accountEmail,
          parentPath,
          mailboxPath: node.path,
        } as MailboxDragItem;
      },
      end: () => {
        onClearHover({ accountEmail, parentPath });
        onDragEnd();
      },
    }),
    [accountEmail, parentPath, node.path, orderedNodes, onDragStart, onDragEnd],
  );
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [, dropRef] = useDrop(
    () => ({
      accept: "email-mailbox-item",
      hover: (item: MailboxDragItem, monitor) => {
        if (
          item.accountEmail !== accountEmail ||
          item.parentPath !== parentPath ||
          item.mailboxPath === node.path
        ) {
          return;
        }
        const hoverRect = rowRef.current?.getBoundingClientRect();
        const clientOffset = monitor.getClientOffset();
        let position: "before" | "after" = "after";
        if (clientOffset && hoverRect) {
          const hoverMiddleY = (hoverRect.bottom - hoverRect.top) / 2;
          const hoverClientY = clientOffset.y - hoverRect.top;
          position = hoverClientY < hoverMiddleY ? "before" : "after";
        }
        onHover({ accountEmail, parentPath, overId: node.path, position });
      },
      drop: (item: MailboxDragItem) => {
        if (
          item.accountEmail !== accountEmail ||
          item.parentPath !== parentPath ||
          item.mailboxPath === node.path
        ) {
          return;
        }
        const position =
          dragInsertTarget?.mailboxPath === node.path &&
          dragInsertTarget.accountEmail === accountEmail &&
          dragInsertTarget.parentPath === parentPath
            ? dragInsertTarget.position
            : "after";
        onDrop({
          accountEmail,
          parentPath,
          activeId: item.mailboxPath,
          overId: node.path,
          position,
          orderedIds,
          orderedNodes,
        });
      },
    }),
    [
      accountEmail,
      parentPath,
      node.path,
      orderedIds,
      orderedNodes,
      dragInsertTarget,
      onDrop,
      onHover,
    ],
  );
  const isDraggingSelf = draggingId === node.path;
  const showBefore =
    dragInsertTarget?.mailboxPath === node.path && dragInsertTarget.position === "before";
  const showAfter =
    dragInsertTarget?.mailboxPath === node.path && dragInsertTarget.position === "after";
  return (
    <div
      key={node.path}
      className="space-y-1"
      ref={(el) => {
        rowRef.current = el;
        dropRef(dragRef(el));
      }}
    >
      {showBefore ? (
        <div
          className="h-[2px] w-full rounded-full bg-[#1a73e8]"
          style={{ marginLeft: `${8 + depth * 12}px` }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (selectable) onSelectMailbox(accountEmail, node.path, getMailboxLabel(node));
        }}
        disabled={!selectable}
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          opacity: isDraggingSelf ? 0.4 : 1,
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-full py-1.5 pr-2 text-[13px] transition-colors duration-150",
          isActive
            ? EMAIL_TONE_ACTIVE_CLASS
            : cn("text-[#444746] dark:text-slate-300", EMAIL_TONE_HOVER_CLASS),
          selectable ? "" : "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {getMailboxLabel(node)}
        </span>
        {count > 0 ? (
          <span
            className={cn(
              "rounded-full text-[10px]",
              EMAIL_META_CHIP_CLASS,
              isActive ? "text-[#001d35] dark:text-sky-100" : "text-[#5f6368] dark:text-slate-300",
            )}
          >
            {count}
          </span>
        ) : null}
      </button>
      {showAfter ? (
        <div
          className="h-[2px] w-full rounded-full bg-[#1a73e8]"
          style={{ marginLeft: `${8 + depth * 12}px` }}
        />
      ) : null}
      {children}
    </div>
  );
}

export function EmailMailboxTree({
  accountEmail,
  nodes,
  activeView,
  mailboxUnreadMap,
  dragInsertTarget,
  draggingMailboxId,
  onSelectMailbox,
  onHoverMailbox,
  onClearHover,
  onDropMailboxOrder,
  onDragStartMailbox,
  onDragEndMailbox,
  resolveOrderedMailboxNodes,
}: EmailMailboxTreeProps) {
  const renderMailboxNodes = (
    ownerEmail: string,
    treeNodes: MailboxNode[],
    depth = 0,
    parentPath: string | null = null,
  ): React.ReactNode => {
    const orderedNodes = resolveOrderedMailboxNodes(ownerEmail, parentPath, treeNodes);
    const orderedIds = orderedNodes.map((node) => node.path);
    return orderedNodes.map((node) => {
      const isActive =
        activeView.scope === "mailbox" &&
        normalizeEmail(activeView.accountEmail ?? "") === normalizeEmail(ownerEmail) &&
        activeView.mailbox === node.path;
      const selectable = isMailboxSelectable(node);
      const count = mailboxUnreadMap.get(`${normalizeEmail(ownerEmail)}::${node.path}`) ?? 0;
      return (
        <MailboxNodeRow
          key={node.path}
          accountEmail={ownerEmail}
          parentPath={parentPath}
          node={node}
          depth={depth}
          orderedIds={orderedIds}
          orderedNodes={orderedNodes}
          dragInsertTarget={dragInsertTarget}
          draggingId={draggingMailboxId}
          isActive={isActive}
          selectable={selectable}
          count={count}
          onSelectMailbox={onSelectMailbox}
          onHover={onHoverMailbox}
          onClearHover={onClearHover}
          onDrop={onDropMailboxOrder}
          onDragStart={onDragStartMailbox}
          onDragEnd={onDragEndMailbox}
        >
          {node.children.length ? (
            <div className="space-y-1">
              {renderMailboxNodes(ownerEmail, node.children, depth + 1, node.path)}
            </div>
          ) : null}
        </MailboxNodeRow>
      );
    });
  };

  return <>{renderMailboxNodes(accountEmail, nodes)}</>;
}
