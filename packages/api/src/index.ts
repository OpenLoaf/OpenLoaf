// import superjson from "superjson";
// Export generated routers
// @ts-ignore
import { appRouter as internalAppRouter } from "../generated/routers";
import { t } from "../generated/routers/helpers/createRouter";
import {
  workspaceRouter,
  BaseWorkspaceRouter,
  workspaceSchemas,
} from "./routers/absWorkspace";
import { tabRouter, BaseTabRouter, tabSchemas } from "./routers/absTab";
import { chatRouter } from "./routers/chat";
import { BaseChatRouter, chatSchemas } from "./routers/absChat";
import { health } from "./routers/health";
import { fsRouter } from "./routers/fs";
import {
  settingRouter,
  BaseSettingRouter,
  settingSchemas,
} from "./routers/absSetting";
import { aiRouter, BaseAiRouter, aiSchemas } from "./routers/ai";
import {
  linkPreviewRouter,
  BaseLinkPreviewRouter,
  linkPreviewSchemas,
} from "./routers/absLinkPreview";
import {
  webMetaRouter,
  BaseWebMetaRouter,
  webMetaSchemas,
} from "./routers/absWebMeta";
import { projectRouter } from "./routers/project";
import {
  terminalRouter,
  BaseTerminalRouter,
  terminalSchemas,
} from "./routers/terminal";

export const appRouterDefine = {
  ...internalAppRouter._def.procedures,
  health,
  chat: chatRouter,
  project: projectRouter,
  fs: fsRouter,
  workspace: workspaceRouter,
  tab: tabRouter,
  settings: settingRouter,
  ai: aiRouter,
  linkPreview: linkPreviewRouter,
  webMeta: webMetaRouter,
  terminal: terminalRouter,
};

export const appRouter = t.router({
  ...appRouterDefine,
});

export type AppRouter = typeof appRouter;

// Export generated schemas
// @ts-ignore
export * from "../generated/schemas";
export * from "../generated/routers/helpers/createRouter";

// Export generated zod schemas
// export * as zodSchemas from "../generated/zod/schemas/index";

// Export custom types
export * from "./types/workspace";
export * from "./types/basic";
export * from "./types/event";
export * from "./types/message";
export * from "./types/image";
export * from "./types/toolResult";
export * from "./types/setting";
export * from "./types/storage";
export * from "./types/boardCollab";
export * from "./common";
export * from "./markdown/block-markdown";
export * from "./services/vfsService";

// Export workspace router components
export { BaseWorkspaceRouter, workspaceSchemas };

// Export tab router components
export { BaseTabRouter, tabSchemas };

// Export chat router components
export { BaseChatRouter, chatSchemas };

// Export setting router components
export { BaseSettingRouter, settingSchemas };

// Export ai router components
export { BaseAiRouter, aiSchemas };

// Export link preview router components
export { BaseLinkPreviewRouter, linkPreviewSchemas };
export { BaseWebMetaRouter, webMetaSchemas };
export { parseWebMetadataFromHtml } from "./services/webMetaParser";
export type { WebMetadata } from "./services/webMetaParser";

// Export terminal router components
export { BaseTerminalRouter, terminalSchemas };

// export const t = initTRPC.context<Context>().create({
// });

// export const router = t.router;

// export const publicProcedure = t.procedure;
