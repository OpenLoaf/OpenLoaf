import { AiExecuteService } from "@/ai/chat/AiExecuteService";
import { AiExecuteController } from "@/ai/interface/controllers/AiExecuteController";

type AiBootstrapResult = {
  /** Execute controller for AI routes. */
  aiExecuteController: AiExecuteController;
};

/** Build AI services and controllers. */
export function bootstrapAi(): AiBootstrapResult {
  // 逻辑：集中构建 AI 控制器与依赖，避免散落的模块装配。
  const executeService = new AiExecuteService();
  return {
    aiExecuteController: new AiExecuteController({ executeService }),
  };
}
