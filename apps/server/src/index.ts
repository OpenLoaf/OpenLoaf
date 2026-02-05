import "dotenv/config";
import { startServer } from "@/bootstrap/startServer";
import { installHttpProxy } from "@/modules/proxy/httpProxy";
import { syncSystemProxySettings } from "@/modules/proxy/systemProxySync";
import { getWorkspaces } from "@tenas-ai/api/services/workspaceConfig";

installHttpProxy();
void syncSystemProxySettings();

// 启动时确保配置文件存在，避免运行中首次访问 workspace 时才触发创建。
getWorkspaces();

const { app } = startServer();
// 暂停启动时自动总结调度，避免无 workspace/project 上下文触发总结流程。
// void initSummaryScheduler();

export default app;
