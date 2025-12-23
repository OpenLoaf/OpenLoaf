import "dotenv/config";
import { startServer } from "@/bootstrap/startServer";
import { installHttpProxy } from "@/modules/proxy/httpProxy";
import { teatimeConfigStore } from "@/modules/workspace/TeatimeConfigStoreAdapter";

installHttpProxy();

// 启动时确保配置文件存在，避免运行中首次访问 workspace 时才触发创建。
teatimeConfigStore.get();

const { app } = startServer();

export default app;
