/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { AiExecuteRequest } from "@/ai/services/chat/types";
import { AiExecuteService } from "@/ai/services/chat/AiExecuteService";

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
    saasAccessToken?: string;
  }) {
    // 逻辑：控制器只做编排，避免掺入业务逻辑。
    return this.deps.executeService.execute(input);
  }
}
