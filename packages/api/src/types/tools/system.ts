/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * System Tool 风险分级（统一在 api 包内维护，供 server/web 共用）
 * - 说明：AI SDK v6 beta 的 Tool 类型没有 `metadata` 字段，因此用映射表维护。
 * - time-now 已移除（当前时间通过系统提示注入，无需工具调用）。
 */
export const systemToolMeta = {} as const;
