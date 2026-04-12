/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Detects blocking `Start-Sleep N` / `sleep N` patterns in PowerShell
 * commands. The harness guidance asks the model to avoid inline sleeps
 * that burn prompt-cache TTL; the tool surfaces a hard error so the
 * model is nudged to either drop the sleep or use run_in_background.
 *
 * Only the FIRST statement is inspected — subsequent `sleep` after real
 * work is much rarer and harder to classify without a full AST walk.
 * Sub-second sleeps (`-Milliseconds`) are not blocked.
 */

/**
 * Match `Start-Sleep N` or `sleep N` where N is an integer >= 2.
 * - Optional `-Seconds` / `-s` parameter.
 * - NOT matched: `-Milliseconds`, `-m`, any sub-second form.
 * - NOT matched: non-integer or missing argument.
 */
const SLEEP_RE =
  /^\s*(?:start-sleep|sleep)(?:\s+-s(?:econds)?)?\s+(\d+)\s*$/i

/**
 * Detect a blocking sleep in the first statement of the command. Returns
 * a user-facing error message if detected (N >= 2), otherwise null.
 *
 * Callers should skip this check when run_in_background is true — a
 * backgrounded sleep does not block the model turn.
 */
export function detectBlockedSleepPattern(command: string): string | null {
  if (!command) return null
  // First statement only: split on PS statement separators.
  const firstStatement = command.split(/[;&\r\n]|\|\|/)[0] ?? ''
  const match = firstStatement.match(SLEEP_RE)
  if (!match) return null
  const seconds = Number.parseInt(match[1] ?? '', 10)
  if (!Number.isFinite(seconds) || seconds < 2) return null
  return (
    `Blocked: inline \`${firstStatement.trim()}\` would block the turn for ${seconds}s ` +
    'and burn the prompt cache. Either remove the sleep, use `-Milliseconds` ' +
    'for sub-second waits, or pass `run_in_background: true` so the sleep ' +
    'runs out-of-band.'
  )
}
