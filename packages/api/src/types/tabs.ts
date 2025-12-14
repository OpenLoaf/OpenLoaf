// 定义面板对话框接口
export interface PanelDialog {
  id: string;
  component: string;
  params: Record<string, any>;
}

// 定义面板配置接口
export interface PanelConfig {
  component: string;
  params: Record<string, any>;
  panelKey: string;
  hidden?: boolean;
  dialogs?: PanelDialog[];
}

export type PanelUpdates = Partial<{
  leftPanel: Partial<PanelConfig>;
  rightPanel: Partial<PanelConfig>;
}>

// 定义标签页类型
export interface Tab {
  id: string;
  // Logical resource identity for de-duping/activation (e.g. page id)
  resourceId?: string;
  title: string;
  icon?: string;
  leftPanel?: PanelConfig;
  rightPanel?: PanelConfig;
  leftWidth?: number;
  workspaceId: string;
  isPin?: boolean;
}

// 默认标签页信息 - 当没有标签页时使用
export const DEFAULT_TAB_INFO = {
  title: "Ai Chat",
  icon: "bot",
} as const;
