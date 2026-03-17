/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { describe, expect, it } from 'vitest'
import {
  buildSinglePreferredIds,
  normalizeSinglePreferredIds,
} from '../model-preferences/model-selection-utils'

describe('model-selection-utils', () => {
  it('只保留首个已选模型给 ChatInput 单选 UI 展示', () => {
    expect(normalizeSinglePreferredIds(['model-a', 'model-b', 'model-a'])).toEqual(['model-a'])
  })

  it('点击新模型时会替换为单个选中项', () => {
    expect(buildSinglePreferredIds(['model-a', 'model-b'], 'model-c')).toEqual(['model-c'])
  })

  it('点击当前模型时会收敛成单个 id', () => {
    expect(buildSinglePreferredIds(['model-a', 'model-b'], 'model-a')).toEqual(['model-a'])
  })

  it('空模型 id 不会清空现有单选值', () => {
    expect(buildSinglePreferredIds(['model-a'], '   ')).toEqual(['model-a'])
  })
})
