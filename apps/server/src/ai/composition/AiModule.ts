import { AiExecuteService } from "@/ai/application/use-cases/AiExecuteService";
import { AiExecuteController } from "@/ai/interface/controllers/AiExecuteController";

/** AI module composition root. */
export class AiModule {
  /** Build the execute controller with its dependencies. */
  createAiExecuteController(): AiExecuteController {
    return new AiExecuteController({ executeService: this.createAiExecuteService() });
  }

  private createAiExecuteService(): AiExecuteService {
    return new AiExecuteService();
  }
}
