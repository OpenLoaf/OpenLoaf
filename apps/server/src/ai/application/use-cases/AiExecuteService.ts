import type { AiExecuteRequest } from "@/ai/pipeline/aiTypes";
import { runAiExecute } from "@/ai/pipeline/aiPipeline";

type AiExecuteServiceInput = {
  /** Unified AI request payload. */
  request: AiExecuteRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class AiExecuteService {
  /** Execute unified AI request. */
  async execute(input: AiExecuteServiceInput) {
    return runAiExecute(input);
  }
}
