/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { appRouterDefine, t } from "@openloaf/api";
import { chatRouterImplementation } from "@/routers/chat";
import { tabRouterImplementation } from "@/routers/tab";
import { settingsRouterImplementation } from "@/routers/settings";
import { aiRouterImplementation } from "@/routers/ai";
import { linkPreviewRouterImplementation } from "@/routers/linkPreview";
import { webMetaRouterImplementation } from "@/routers/webMeta";
import { terminalRouterImplementation } from "@/routers/terminal";
import { emailRouterImplementation } from "@/routers/email";
import { officeRouterImplementation } from "@/routers/office";
import { calendarRouterImplementation } from "@/routers/calendar";
import { dynamicWidgetRouterImplementation } from "@/routers/dynamicWidget";
import { scheduledTaskRouterImplementation } from "@/routers/scheduledTask";
import { mcpRouterImplementation } from "@/routers/mcp";
import { integrationsRouterImplementation } from "@/routers/integrations";

/**
 * Server-side AppRouter with all implementations
 * This is the actual router used at runtime
 */
export const serverAppRouter = t.router({
  ...appRouterDefine,
  chat: chatRouterImplementation,
  tab: tabRouterImplementation,
  settings: settingsRouterImplementation,
  ai: aiRouterImplementation,
  linkPreview: linkPreviewRouterImplementation,
  webMeta: webMetaRouterImplementation,
  terminal: terminalRouterImplementation,
  email: emailRouterImplementation,
  office: officeRouterImplementation,
  calendar: calendarRouterImplementation,
  dynamicWidget: dynamicWidgetRouterImplementation,
  scheduledTask: scheduledTaskRouterImplementation,
  mcp: mcpRouterImplementation,
  integrations: integrationsRouterImplementation,
});

export type ServerAppRouter = typeof serverAppRouter;
