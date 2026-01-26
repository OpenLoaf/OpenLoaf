import type { AiExecuteRequest } from "@/ai/chat/types";
import { AiExecuteService } from "@/ai/chat/AiExecuteService";

type AiExecuteControllerDeps = {
  /** Execute service. */
  executeService: AiExecuteService;
};

export class AiExecuteController {
  constructor(private readonly deps: AiExecuteControllerDeps) {}

  /** Execute AI request. */
  execute(input: {
    request: AiExecuteRequest;
    cookies: Record<string, string>;
    requestSignal: AbortSignal;
  }) {
    // 逻辑：控制器只做编排，避免掺入业务逻辑。
    return this.deps.executeService.execute(input);
  }
}
