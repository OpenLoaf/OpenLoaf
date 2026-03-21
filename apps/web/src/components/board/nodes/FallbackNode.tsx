/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
} from "../engine/types";
import { Trash2, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { NodeFrame } from "./NodeFrame";
import { useBoardContext } from "../core/BoardProvider";

/**
 * Deprecated node types that should render as fallback placeholders.
 * Keep these registered for at least 2 version cycles so existing
 * .board files can still open without data loss.
 */
export const DEPRECATED_NODE_TYPES = [
  "chat_input",
  "chat_message",
  "image_generate",
  "video_generate",
  "image_prompt_generate",
] as const;

export type FallbackNodeProps = Record<string, unknown>;

function FallbackNodeView({
  element,
}: CanvasNodeViewProps<FallbackNodeProps>) {
  const { t } = useTranslation("board");
  const { engine } = useBoardContext();

  const handleDelete = useCallback(() => {
    if (!engine) return;
    engine.doc.transact(() => {
      // Remove connectors pointing to this node.
      const connectorIds = engine.doc
        .getElements()
        .filter((el) => el.kind === "connector")
        .filter((el) => {
          const src = "elementId" in el.source ? el.source.elementId : null;
          const tgt = "elementId" in el.target ? el.target.elementId : null;
          return src === element.id || tgt === element.id;
        })
        .map((el) => el.id);
      if (connectorIds.length > 0) {
        engine.doc.deleteElements(connectorIds);
      }
      // Remove from parent group's childIds.
      const groupId = element.meta?.groupId as string | undefined;
      if (groupId) {
        const parent = engine.doc.getElementById(groupId);
        if (parent && parent.kind === "node" && Array.isArray(parent.props.childIds)) {
          engine.doc.updateNodeProps(parent.id, {
            childIds: (parent.props.childIds as string[]).filter(
              (id: string) => id !== element.id,
            ),
          });
        }
      }
      engine.doc.deleteElements([element.id]);
    });
  }, [engine, element.id, element.meta?.groupId]);

  return (
    <NodeFrame className="flex items-center justify-center">
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-3xl border border-ol-border bg-ol-surface-muted p-4 text-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
          <X size={16} className="text-ol-text-auxiliary" />
        </div>
        <p className="text-xs text-ol-text-auxiliary">
          {t("fallbackNode.deprecated", { type: element.type })}
        </p>
        <button
          type="button"
          className="text-[11px] text-ol-text-auxiliary hover:text-ol-text-secondary transition-colors duration-150"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
        >
          <Trash2 size={12} className="inline mr-1" />
          {t("fallbackNode.delete")}
        </button>
      </div>
    </NodeFrame>
  );
}

export function createFallbackNodeDefinition(
  type: string,
): CanvasNodeDefinition<FallbackNodeProps> {
  return {
    type,
    defaultProps: {},
    view: FallbackNodeView,
    capabilities: {
      resizable: false,
      rotatable: false,
      connectable: "none" as const,
    },
  };
}
