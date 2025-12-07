import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useRef, useState, useEffect, type React } from 'react';

// 侧边栏状态接口
interface SidebarState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
}

const STORAGE_KEY = "sidebar-storage";

const DEFAULT_STATE: Pick<
  SidebarState,
  "leftOpen" | "rightOpen" | "leftPanelWidth" | "rightPanelWidth"
> = {
  leftOpen: true,
  rightOpen: true,
  leftPanelWidth: 20,
  rightPanelWidth: 22,
};

// 侧边栏状态管理 hook
export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      toggleLeft: () => set((state) => ({ leftOpen: !state.leftOpen })),
      toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen })),
      setLeftOpen: (open) => set({ leftOpen: open }),
      setRightOpen: (open) => set({ rightOpen: open }),
      setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
      setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// 侧边栏调整大小相关常量
const MIN_LEFT = 12;
const MIN_RIGHT = 14;
const MIN_MAIN = 32;

// 侧边栏调整大小 hook
export const useSidebarResize = () => {
  const { 
    leftOpen, 
    rightOpen, 
    leftPanelWidth, 
    rightPanelWidth, 
    setLeftPanelWidth, 
    setRightPanelWidth 
  } = useSidebar();
  
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingLeft = useRef(leftPanelWidth);
  const pendingRight = useRef(rightPanelWidth);
  
  // 计算宽度限制
  const clampWidth = (value: number, min: number, otherOpen: boolean, otherWidth: number) => {
    const calculatedMax = Math.max(
      100 - (otherOpen ? otherWidth : 0) - MIN_MAIN,
      min
    );
    const max = min === MIN_LEFT ? Math.min(calculatedMax, 20) : calculatedMax;
    return Math.min(Math.max(value, min), max);
  };
  
  const clampLeftWidth = (value: number) => 
    clampWidth(value, MIN_LEFT, rightOpen, rightPanelWidth);
  
  const clampRightWidth = (value: number) => 
    clampWidth(value, MIN_RIGHT, leftOpen, leftPanelWidth);
  
  // 获取容器宽度
  const getContainerWidth = () => {
    return (
      containerRef.current?.getBoundingClientRect().width ??
      window.innerWidth ??
      1
    );
  };
  
  // 应用网格样式
  const applyGridStyles = (left: number, right: number) => {
    const grid = containerRef.current;
    if (!grid) return;
    
    grid.style.setProperty('--left-grid-width', leftOpen ? `${left}%` : '0px');
    grid.style.setProperty('--right-grid-width', rightOpen ? `${right}%` : '0px');
    grid.style.gridTemplateColumns = `${
      leftOpen ? `${left}%` : '0px'
    } 8px 1fr 8px ${rightOpen ? `${right}%` : '0px'}`;
  };
  
  // 开始调整大小
  const startResize = (side: 'left' | 'right', clientX: number) => {
    const containerWidth = getContainerWidth();
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const startX = clientX;
    
    setIsResizing(true);
    
    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - startX;
      const deltaPercent = (delta / containerWidth) * 100;
      
      if (side === 'left') {
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
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      
      if (leftOpen && pendingLeft.current !== leftPanelWidth) {
        setLeftPanelWidth(pendingLeft.current);
      }
      if (rightOpen && pendingRight.current !== rightPanelWidth) {
        setRightPanelWidth(pendingRight.current);
      }
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
  };
  
  const handleLeftHandleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!leftOpen) return;
    startResize('left', event.clientX);
  };
  
  const handleRightHandleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!rightOpen) return;
    startResize('right', event.clientX);
  };
  
  // 当侧边栏状态变化时，确保宽度在合法范围
  useEffect(() => {
    if (leftOpen) {
      const clamped = clampLeftWidth(leftPanelWidth);
      if (clamped !== leftPanelWidth) setLeftPanelWidth(clamped);
    }
    
    if (rightOpen) {
      const clamped = clampRightWidth(rightPanelWidth);
      if (clamped !== rightPanelWidth) setRightPanelWidth(clamped);
    }
  }, [leftOpen, rightOpen, leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth]);
  
  // 计算布局样式
  const layoutStyle = {
    '--left-grid-width': leftOpen ? `${leftPanelWidth}%` : '0px',
    '--right-grid-width': rightOpen ? `${rightPanelWidth}%` : '0px',
    gridTemplateColumns: `${
      leftOpen ? `${leftPanelWidth}%` : '0px'
    } 8px 1fr 8px ${rightOpen ? `${rightPanelWidth}%` : '0px'}`
  } as React.CSSProperties;
  
  return {
    containerRef,
    isResizing,
    layoutStyle,
    handleLeftHandleDown,
    handleRightHandleDown
  };
};
