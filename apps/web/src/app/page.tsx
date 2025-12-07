"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import Header from "@/components/layout/header";
import SidebarLeft from "@/components/layout/sidebar-left";
import SidebarRight from "@/components/layout/sidebar-right";
import { useSidebar } from "@/hooks/use-sidebar";

const MIN_LEFT = 12;
const MIN_RIGHT = 14;
const MIN_MAIN = 32;

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const {
    leftOpen,
    rightOpen,
    setLeftPanelWidth,
    setRightPanelWidth,
    leftPanelWidth,
    rightPanelWidth,
  } = useSidebar();
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingLeft = useRef(leftPanelWidth);
  const pendingRight = useRef(rightPanelWidth);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const clampWidth = (
    value: number,
    min: number,
    otherOpen: boolean,
    otherWidth: number
  ) => {
    const max = Math.max(
      100 - (otherOpen ? otherWidth : 0) - MIN_MAIN,
      min
    );
    return Math.min(Math.max(value, min), max);
  };

  const clampLeftWidth = (value: number) =>
    clampWidth(value, MIN_LEFT, rightOpen, rightPanelWidth);

  const clampRightWidth = (value: number) =>
    clampWidth(value, MIN_RIGHT, leftOpen, leftPanelWidth);

  // 当任一侧折叠状态变化时，确保存储的宽度在合法范围
  useEffect(() => {
    if (!hydrated) return;

    if (leftOpen) {
      const clamped = clampLeftWidth(leftPanelWidth);
      if (clamped !== leftPanelWidth) setLeftPanelWidth(clamped);
    }

    if (rightOpen) {
      const clamped = clampRightWidth(rightPanelWidth);
      if (clamped !== rightPanelWidth) setRightPanelWidth(clamped);
    }
  }, [
    hydrated,
    leftOpen,
    rightOpen,
    leftPanelWidth,
    rightPanelWidth,
    setLeftPanelWidth,
    setRightPanelWidth,
  ]);

  const getContainerWidth = () => {
    return (
      containerRef.current?.getBoundingClientRect().width ??
      window.innerWidth ??
      1
    );
  };

  const applyGridStyles = (left: number, right: number) => {
    const grid = containerRef.current;
    if (!grid) return;

    grid.style.setProperty(
      "--left-grid-width",
      leftOpen ? `${left}%` : "0px"
    );
    grid.style.setProperty(
      "--right-grid-width",
      rightOpen ? `${right}%` : "0px"
    );
    grid.style.gridTemplateColumns = `${
      leftOpen ? `${left}%` : "0px"
    } 8px 1fr 8px ${rightOpen ? `${right}%` : "0px"}`;
  };

  const startResize = (
    side: "left" | "right",
    clientX: number
  ) => {
    const containerWidth = getContainerWidth();
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const startX = clientX;

    setIsResizing(true);

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - startX;
      const deltaPercent = (delta / containerWidth) * 100;

      if (side === "left") {
        if (!leftOpen) return;
        const nextLeft = clampLeftWidth(startLeft + deltaPercent);
        pendingLeft.current = nextLeft;
        applyGridStyles(nextLeft, pendingRight.current);
      } else {
        if (!rightOpen) return;
        const nextRight = clampRightWidth(startRight - deltaPercent);
        pendingRight.current = nextRight;
        applyGridStyles(pendingLeft.current, nextRight);
      }
    };

    const stopResize = () => {
      setIsResizing(false);
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );
      window.removeEventListener("pointerup", stopResize);
      if (leftOpen && pendingLeft.current !== leftPanelWidth) {
        setLeftPanelWidth(pendingLeft.current);
      }
      if (rightOpen && pendingRight.current !== rightPanelWidth) {
        setRightPanelWidth(pendingRight.current);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
  };

  const handleLeftHandleDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    if (!leftOpen) return;
    startResize("left", event.clientX);
  };

  const handleRightHandleDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    if (!rightOpen) return;
    startResize("right", event.clientX);
  };

  const layoutStyle: CSSProperties = {
    ["--left-grid-width" as string]: leftOpen
      ? `${leftPanelWidth}%`
      : "0px",
    ["--right-grid-width" as string]: rightOpen
      ? `${rightPanelWidth}%`
      : "0px",
    gridTemplateColumns: `${
      leftOpen ? `${leftPanelWidth}%` : "0px"
    } 8px 1fr 8px ${rightOpen ? `${rightPanelWidth}%` : "0px"}`,
  };

  if (!hydrated) return null;

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 pb-1 bg-sidebar">
        <div
          ref={containerRef}
          className={`workbench-grid h-full ${
            isResizing ? "is-resizing" : ""
          }`}
          style={layoutStyle}
        >
          <div
            className={`sidebar-animation h-full ${
              leftOpen ? "sidebar-expanded" : "sidebar-collapsed"
            }`}
          >
            <SidebarLeft />
          </div>
          <div
            className="resize-handle"
            onPointerDown={handleLeftHandleDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left panel"
          />
          <div className="main-content h-full p-4 bg-background border rounded-lg">
            <h1 className="text-xl font-bold mb-4">Editor</h1>
            <div className="h-[calc(100%-2rem)] rounded border p-4">
              Editor placeholder
            </div>
          </div>
          <div
            className="resize-handle"
            onPointerDown={handleRightHandleDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right panel"
          />
          <div
            className={`sidebar-animation sidebar-right-panel h-full ${
              rightOpen ? "sidebar-expanded" : "sidebar-collapsed"
            }`}
          >
            <SidebarRight />
          </div>
        </div>
      </div>
    </div>
  );
}
