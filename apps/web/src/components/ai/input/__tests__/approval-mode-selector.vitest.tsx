/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApprovalModeSelector from '../ApprovalModeSelector'

describe('ApprovalModeSelector', () => {
  let onChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onChange = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders manual mode with aria-checked=false', () => {
    render(<ApprovalModeSelector value="manual" onChange={onChange} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('renders auto mode with aria-checked=true', () => {
    render(<ApprovalModeSelector value="auto" onChange={onChange} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows confirmation dialog when switching from manual to auto', () => {
    render(<ApprovalModeSelector value="manual" onChange={onChange} />)
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)

    expect(screen.getByText('启用自动批准？')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange("auto") when confirm button is clicked', () => {
    render(<ApprovalModeSelector value="manual" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))

    const confirm = screen.getByRole('button', { name: '确认开启' })
    fireEvent.click(confirm)

    expect(onChange).toHaveBeenCalledWith('auto')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not call onChange when cancel button is clicked', () => {
    render(<ApprovalModeSelector value="manual" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))

    const cancel = screen.getByRole('button', { name: '取消' })
    fireEvent.click(cancel)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches from auto to manual directly without dialog', () => {
    render(<ApprovalModeSelector value="auto" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))

    expect(screen.queryByText('启用自动批准？')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith('manual')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not toggle when disabled', () => {
    render(<ApprovalModeSelector value="manual" onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('switch'))

    expect(screen.queryByText('启用自动批准？')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
