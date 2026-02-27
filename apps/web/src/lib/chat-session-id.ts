/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// 中文注释：随机后缀字符集。
const RANDOM_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Create a chat session id with format: chat_{yyyyMMdd}_{HHmmss}_{random}. */
export function createChatSessionId(): string {
  const now = new Date();
  // 中文注释：使用本地时间拼接日期时间，便于日志和排查。
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const timePart = `${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes(),
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  // 中文注释：优先使用安全随机数，缺失时降级到 Math.random。
  const randomPart = buildRandomString(8);
  return `chat_${datePart}_${timePart}_${randomPart}`;
}

/** Build a random suffix for chat session ids. */
function buildRandomString(length: number): string {
  if (length <= 0) return "";
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => RANDOM_CHARSET[value % RANDOM_CHARSET.length]).join("");
  }
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += RANDOM_CHARSET[Math.floor(Math.random() * RANDOM_CHARSET.length)];
  }
  return result;
}
