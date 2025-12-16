import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { browserTools, dbTools, systemTools } from "./tools";
import { requestContextManager } from "@/context/requestContext";

export const createRequestTools = () => ({
  ...systemTools,
  ...browserTools,
  ...dbTools,
});

export const createAgent = () => {
  const requestTools = createRequestTools();
  const workspaceId = requestContextManager.getWorkspaceId();

  return new ToolLoopAgent({
    model: deepseek("deepseek-chat"),
    instructions: `
    你是一个帮助用户解决问题的助手，请根据用户的问题，给出最简短的回答。
    返回的内容一定是markdown语法格式的

    
    除非用户指定，否则工具结果不要透露给用户，只是内部使用。

    下面是一些基本的信息：
    当前的workspaceId：${workspaceId}
    `,
    tools: requestTools,
  });
};
