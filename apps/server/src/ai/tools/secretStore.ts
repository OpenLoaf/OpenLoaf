/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomUUID } from 'node:crypto'

const SECRET_TOKEN_RE = /\{\{secret:([0-9a-f-]{36})\}\}/g
const secrets = new Map<string, string>()

/** Store a secret value and return a placeholder token. */
export function storeSecret(value: string): string {
  const id = randomUUID()
  secrets.set(id, value)
  return `{{secret:${id}}}`
}

/** Replace all secret tokens in text with their real values. */
export function resolveSecretTokens(text: string): string {
  return text.replace(SECRET_TOKEN_RE, (match, id) => secrets.get(id) ?? match)
}

/** Replace all secret tokens in text with a mask. */
export function maskSecretTokens(text: string): string {
  return text.replace(SECRET_TOKEN_RE, '••••••')
}
