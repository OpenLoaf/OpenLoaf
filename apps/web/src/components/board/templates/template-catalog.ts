export type BoardTemplateId = "text" | "image_prompt";

export type BoardTemplateDefinition = {
  id: BoardTemplateId;
  label: string;
  description: string;
  size: [number, number];
  /** 通过连线插入节点时的默认节点类型与 props。 */
  createNode: (input: { sourceElementId?: string }) => {
    type: string;
    props: Record<string, unknown>;
  };
};

/** 画布模板（MVP）。 */
export const BOARD_TEMPLATES: BoardTemplateDefinition[] = [
  {
    id: "text",
    label: "文字",
    description: "插入可编辑文本",
    size: [280, 140],
    createNode: () => ({
      type: "text",
      props: { autoFocus: true, value: "" },
    }),
  },
  {
    id: "image_prompt",
    label: "图片提示词",
    description: "分析图片并生成描述",
    size: [320, 220],
    createNode: (input) => ({
      type: "template",
      props: {
        templateId: "image_prompt",
        autoRun: true,
        resultText: "",
      },
    }),
  },
];
