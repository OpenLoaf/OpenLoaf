/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// import superjson from "superjson";
// Export generated routers
// @ts-ignore
import { appRouter as internalAppRouter } from "../generated/routers";
import { t } from "../generated/routers/helpers/createRouter";
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
import { emailRouter, BaseEmailRouter, emailSchemas } from "./routers/email";
import { calendarRouter, BaseCalendarRouter, calendarSchemas } from "./routers/calendar";
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
import {
  dynamicWidgetRouter,
  BaseDynamicWidgetRouter,
  dynamicWidgetSchemas,
} from "./routers/absDynamicWidget";
import {
  scheduledTaskRouter,
  BaseScheduledTaskRouter,
  scheduledTaskSchemas,
} from "./routers/absScheduledTask";
import { boardRouter } from "./routers/board";
import { visitRouter } from "./routers/visit";
import {
  mcpRouter,
  BaseMcpRouter,
  mcpSchemas,
} from "./routers/mcp";
import {
  integrationsRouter,
  BaseIntegrationsRouter,
  integrationSchemas,
} from "./routers/integrations";

export const appRouterDefine = {
  ...internalAppRouter._def.procedures,
  health,
  chat: chatRouter,
  project: projectRouter,
  fs: fsRouter,
  tab: tabRouter,
  settings: settingRouter,
  ai: aiRouter,
  linkPreview: linkPreviewRouter,
  webMeta: webMetaRouter,
  terminal: terminalRouter,
  email: emailRouter,
  calendar: calendarRouter,
  dynamicWidget: dynamicWidgetRouter,
  scheduledTask: scheduledTaskRouter,
  board: boardRouter,
  visit: visitRouter,
  mcp: mcpRouter,
  integrations: integrationsRouter,
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
export * from "./types/appConfig";
export * from "./types/basic";
export * from "./types/event";
export * from "./types/message";
export * from "./types/image";
export * from "./types/saasMedia";
export * from "./types/toolResult";
export * from "./types/setting";
export * from "./types/storage";
export * from "./types/boardCollab";
export * from "./types/entityVisit";
export * from "./common";
export * from "./markdown/block-markdown";
export * from "./services/vfsService";


// Export tab router components
export { BaseTabRouter, tabSchemas };

// Export chat router components
export { BaseChatRouter, chatSchemas };
export type { ChatUIMessage, ChatSessionSummary, ChatSessionListPage, CopySessionToBoardResult, SessionUpdateEvent, BackgroundTaskSummary } from "./routers/chat";

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

// Export email router components
export { BaseEmailRouter, emailSchemas };

// Export calendar router components
export { BaseCalendarRouter, calendarSchemas };

// Export dynamic widget router components
export { BaseDynamicWidgetRouter, dynamicWidgetSchemas };

// Export scheduled task router components
export { BaseScheduledTaskRouter, scheduledTaskSchemas };

// Export MCP router components
export { BaseMcpRouter, mcpSchemas };

// Export integrations router components
export { BaseIntegrationsRouter, integrationSchemas };
export * from "./types/integrations";

// export const t = initTRPC.context<Context>().create({
// });

// export const router = t.router;

// export const publicProcedure = t.procedure;
