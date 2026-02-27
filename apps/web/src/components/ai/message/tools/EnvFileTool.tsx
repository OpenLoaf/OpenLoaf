/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import {
  EnvironmentVariable,
  EnvironmentVariableCopyButton,
  EnvironmentVariableGroup,
  EnvironmentVariableName,
  EnvironmentVariableValue,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
} from '@/components/ai-elements/environment-variables'
import { cn } from '@/lib/utils'
import {
  normalizeToolInput,
  asPlainObject,
  safeStringify,
  type AnyToolPart,
} from './shared/tool-utils'

type EnvEntry = { name: string; value: string }

/** Parse .env file content into key-value pairs. */
function parseEnvContent(content: string): EnvEntry[] {
  const entries: EnvEntry[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const name = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    // 逻辑：去除引号包裹
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    entries.push({ name, value })
  }
  return entries
}

/** Check if a file path looks like an .env file. */
export function isEnvFilePath(path: string): boolean {
  const basename = path.split('/').pop() ?? ''
  return /^\.env(\..+)?$/.test(basename)
}

export default function EnvFileTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const input = normalizeToolInput(part.input)
  const inputObj = asPlainObject(input)
  const path = typeof inputObj?.path === 'string' ? inputObj.path : ''
  const output = safeStringify(part.output)
  const entries = parseEnvContent(output)

  if (entries.length === 0) return null

  return (
    <div className={cn('ml-2 w-full min-w-0 max-w-[90%]', className)}>
      <EnvironmentVariables defaultShowValues={false}>
        <EnvironmentVariablesHeader>
          <EnvironmentVariablesTitle>
            {path || 'Environment Variables'}
          </EnvironmentVariablesTitle>
          <EnvironmentVariablesToggle />
        </EnvironmentVariablesHeader>
        <EnvironmentVariablesContent>
          {entries.map((entry) => (
            <EnvironmentVariable
              key={entry.name}
              name={entry.name}
              value={entry.value}
            >
              <EnvironmentVariableGroup>
                <EnvironmentVariableName />
              </EnvironmentVariableGroup>
              <EnvironmentVariableGroup>
                <EnvironmentVariableValue />
                <EnvironmentVariableCopyButton copyFormat="export" />
              </EnvironmentVariableGroup>
            </EnvironmentVariable>
          ))}
        </EnvironmentVariablesContent>
      </EnvironmentVariables>
    </div>
  )
}
