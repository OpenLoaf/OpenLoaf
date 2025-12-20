import "dotenv/config";
import { startServer } from "@/bootstrap/startServer";
import { teatimeConfigStore } from "@/modules/workspace/infrastructure/file/teatimeConfigStoreFile";

// 中文注释：启动时确保配置文件存在，避免运行中首次访问 workspace 时才触发创建。
teatimeConfigStore.get();

const { app } = startServer();

export default app;
