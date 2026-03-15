/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useMemo } from "react";
import { cn } from "@udecode/cn";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeElement,
  CanvasSnapshot,
} from "../engine/types";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
import { toScreenPoint } from "../utils/coordinates";
import { useBoardEngine } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";
import {
  resolveDirectionalStackPlacement,
} from "../utils/output-placement";

/** Gap between the node right edge and the label stack (canvas units). */
const LABEL_SIDE_GAP = 12;
/** Vertical gap between labels (screen pixels). */
const LABEL_VERTICAL_GAP = 4;
/** Gap for connector placement from source node. */
const CONNECTOR_SIDE_GAP = 60;
/** Gap for stacking multiple output nodes. */
const CONNECTOR_STACK_GAP = 16;

/** Default color classes when a template does not specify one. */
const DEFAULT_COLOR = {
  bg: 'bg-ol-blue-bg',
  text: 'text-ol-blue',
  hoverBg: 'hover:bg-ol-blue-bg-hover',
};

type ConnectorLabelsProps = {
  snapshot: CanvasSnapshot;
};

/** Collect outbound target node bounds for a source node. */
function collectOutboundTargetRects(
  engine: CanvasEngine,
  sourceElementId: string,
): Array<[number, number, number, number]> {
  return engine.doc
    .getElements()
    .reduce<Array<[number, number, number, number]>>((nodes, item) => {
      if (item.kind !== "connector") return nodes;
      if (
        !("elementId" in item.source) ||
        item.source.elementId !== sourceElementId
      ) {
        return nodes;
      }
      if (!("elementId" in item.target)) return nodes;
      const target = engine.doc.getElementById(item.target.elementId);
      if (target?.kind === "node") {
        nodes.push(target.xywh);
      }
      return nodes;
    }, []);
}

/**
 * Render clickable functional labels on the right side of selected nodes.
 *
 * Each label represents a connector template the node can output.
 * Clicking a label immediately creates the target node and a connector.
 */
export function ConnectorLabels({ snapshot }: ConnectorLabelsProps) {
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);

  const selectedNode = useMemo(() => {
    if (snapshot.selectedIds.length !== 1) return null;
    const id = snapshot.selectedIds[0];
    const element = snapshot.elements.find(
      (item): item is CanvasNodeElement =>
        item.kind === "node" && item.id === id,
    );
    if (!element) return null;
    if (!LARGE_ANCHOR_NODE_TYPES.has(element.type)) return null;
    const meta = element.meta as Record<string, unknown> | undefined;
    if (typeof meta?.groupId === "string") return null;
    return element;
  }, [snapshot.selectedIds, snapshot.elements]);

  const templates = useMemo(() => {
    if (!selectedNode) return [];
    const definition = engine.nodes.getDefinition(selectedNode.type);
    if (!definition?.connectorTemplates) return [];
    return definition.connectorTemplates(selectedNode as CanvasNodeElement);
  }, [engine, selectedNode]);

  if (!selectedNode || templates.length === 0) return null;
  if (engine.isLocked()) return null;
  if (snapshot.connectorDraft || snapshot.connectorDrop) return null;

  const [nodeX, nodeY, nodeW, nodeH] = selectedNode.xywh;
  const anchorWorld: [number, number] = [
    nodeX + nodeW + LABEL_SIDE_GAP,
    nodeY + nodeH / 2,
  ];
  const anchorScreen = toScreenPoint(anchorWorld, viewState);

  const handleClick = (template: CanvasConnectorTemplateDefinition) => {
    const { type, props } = template.createNode({
      sourceElementId: selectedNode.id,
    });
    const [width, height] = template.size;
    const existingOutputs = collectOutboundTargetRects(engine, selectedNode.id);
    const placement = resolveDirectionalStackPlacement(
      selectedNode.xywh,
      existingOutputs,
      {
        direction: "right",
        sideGap: CONNECTOR_SIDE_GAP,
        stackGap: CONNECTOR_STACK_GAP,
        outputSize: [width, height],
      },
    );
    const xywh: [number, number, number, number] = placement
      ? [placement.x, placement.y, width, height]
      : [
          nodeX + nodeW + CONNECTOR_SIDE_GAP,
          nodeY + nodeH / 2 - height / 2,
          width,
          height,
        ];
    const id = engine.addNodeElement(type, props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: { elementId: selectedNode.id },
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
  };

  const totalHeight =
    templates.length * 24 + (templates.length - 1) * LABEL_VERTICAL_GAP;
  const startY = anchorScreen[1] - totalHeight / 2;

  return (
    <div
      data-connector-labels
      className="pointer-events-none absolute inset-0 z-20"
    >
      {templates.map((template, index) => {
        const color = template.color ?? DEFAULT_COLOR;
        const y = startY + index * (24 + LABEL_VERTICAL_GAP);
        return (
          <button
            key={template.id}
            type="button"
            className={cn(
              "pointer-events-auto absolute flex items-center gap-1 rounded-full px-2.5 py-1",
              "text-[11px] font-medium leading-none whitespace-nowrap",
              "shadow-sm ring-1 ring-black/5 transition-colors duration-150",
              color.bg,
              color.text,
              color.hoverBg,
            )}
            style={{
              left: anchorScreen[0],
              top: y,
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              handleClick(template);
            }}
          >
            {template.icon ? (
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {template.icon}
              </span>
            ) : null}
            {template.label}
          </button>
        );
      })}
    </div>
  );
}
