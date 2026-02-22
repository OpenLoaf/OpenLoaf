import { trpcServer } from "@hono/trpc-server";
import { appRouterDefine, t } from "@tenas-ai/api";
import { createContext } from "@tenas-ai/api/context";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { registerAiExecuteRoutes } from "@/ai/interface/routes/aiExecuteRoutes";
import { registerAiCommandRoutes } from "@/ai/interface/routes/aiCommandRoutes";
import { registerAiCopilotRoutes } from "@/ai/interface/routes/aiCopilotRoutes";
import { registerChatAttachmentRoutes } from "@/ai/interface/routes/chatAttachmentRoutes";
import { registerFrontendToolAckRoutes } from "@/ai/interface/routes/frontendToolAckRoutes";
import { registerSecretStoreRoutes } from "@/ai/interface/routes/secretStoreRoutes";
import { registerSaasMediaRoutes } from "@/ai/interface/routes/saasMediaRoutes";
import { registerFileSseRoutes } from "@/modules/fs/fileSseRoutes";
import { registerAuthRoutes } from "@/modules/auth/authRoutes";
import { registerS3TestRoutes } from "@/modules/storage/s3TestRoutes";
import { registerCloudModelRoutes } from "@/ai/models/cloudModelRoutes";
import { registerHlsRoutes } from "@/modules/media/hlsRoutes";
import { registerEmailOAuthRoutes } from "@/modules/email/oauth/emailOAuthRoutes";
import { registerEmailAttachmentRoutes } from "@/modules/email/emailAttachmentRoutes";
import { registerLocalAuthRoutes } from "@/modules/local-auth/localAuthRoutes";
import { registerOfficeAddinRoutes } from "@/modules/office/officeAddinRoutes";
import { localAuthGuard } from "@/modules/local-auth/localAuthGuard";
import { workspaceRouterImplementation } from "@/routers/workspace";
import { tabRouterImplementation } from "@/routers/tab";
import { chatRouterImplementation } from "@/routers/chat";
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
import { logger } from "@/common/logger";

const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

function getCorsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGIN?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : defaultCorsOrigins;
}

/**
 * 创建 Hono app（MVP）：
 * - 只负责组装中间件与路由
 * - 运行环境相关（listen/upgrade）的逻辑在 startServer 中处理
 */
export function createApp() {
  const app = new Hono();
  const corsOrigins = getCorsOrigins();
  const isDev = process.env.NODE_ENV !== "production";

  app.use(honoLogger());
  app.use(
    "/*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        if (corsOrigins.includes(origin)) return origin;
        if (!isDev) return null;
        try {
          const url = new URL(origin);
          const isLocalhost =
            url.hostname === "localhost" || url.hostname === "127.0.0.1";
          if (url.protocol === "http:" && isLocalhost) return origin;
        } catch {
          return null;
        }
        return null;
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use("/*", localAuthGuard);

  registerAiExecuteRoutes(app);
  registerAiCommandRoutes(app);
  registerAiCopilotRoutes(app);
  registerChatAttachmentRoutes(app);
  registerFrontendToolAckRoutes(app);
  registerSecretStoreRoutes(app);
  registerSaasMediaRoutes(app);
  registerFileSseRoutes(app);
  registerAuthRoutes(app);
  registerLocalAuthRoutes(app);
  registerCloudModelRoutes(app);
  registerS3TestRoutes(app);
  registerHlsRoutes(app);
  registerEmailOAuthRoutes(app);
  registerEmailAttachmentRoutes(app);
  registerOfficeAddinRoutes(app);

  app.use(
    "/trpc/*",
    trpcServer({
      router: t.router({
        ...appRouterDefine,
        chat: chatRouterImplementation,
        workspace: workspaceRouterImplementation,
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
      }),
      createContext: (_opts, context) => createContext({ context }),
      onError: ({ error, path, input, type }) => {
        logger.error(
          { err: error, input, type, path: path || "unknown path" },
          `tRPC Error: ${type} on ${path || "unknown path"}`,
        );
      },
    }),
  );

  app.get("/", (c) => c.text("OK"));

  return app;
}
