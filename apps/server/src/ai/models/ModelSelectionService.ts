import { resolveChatModel } from "@/ai/models/resolveChatModel";

export class ModelSelectionService {
  /** Resolve a chat model from request inputs. */
  async resolve(input: Parameters<typeof resolveChatModel>[0]) {
    return resolveChatModel(input);
  }
}
