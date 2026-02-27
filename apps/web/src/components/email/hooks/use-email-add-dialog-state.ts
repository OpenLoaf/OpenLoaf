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
import { useMutation } from '@tanstack/react-query'

import { trpc } from '@/utils/trpc'
import { resolveServerUrl } from '@/utils/server-url'
import { DEFAULT_FORM } from '../email-types'
import { getProviderById } from '../email-provider-presets'
import { normalizeEmail } from '../email-utils'
import type { EmailCoreState } from './use-email-core-state'
import type { AddDialogState } from '../use-email-page-state'

export function useEmailAddDialogState(core: EmailCoreState): AddDialogState {
  const {
    workspaceId,
    queryClient,
    addDialogOpen,
    setAddDialogOpen,
    formState,
    setFormState,
    formError,
    setFormError,
    testStatus,
    setTestStatus,
    setActiveAccountEmail,
  } = core

  function resetFormState() {
    setFormState(DEFAULT_FORM)
    setFormError(null)
    setTestStatus('idle')
  }

  const addAccountMutation = useMutation(
    trpc.email.addAccount.mutationOptions({
      onSuccess: (data) => {
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
          })
        }
        setActiveAccountEmail(normalizeEmail(data.emailAddress))
        setAddDialogOpen(false)
        resetFormState()
      },
      onError: (error) => {
        setFormError(error.message || '新增邮箱失败，请稍后再试。')
      },
    }),
  )

  const testConnectionPreAddMutation = useMutation(
    trpc.email.testConnectionPreAdd.mutationOptions({}),
  )

  const selectedProviderPasswordLabel = React.useMemo(() => {
    if (!formState.selectedProviderId) return '密码'
    const provider = getProviderById(formState.selectedProviderId)
    return provider?.passwordLabel ?? '密码'
  }, [formState.selectedProviderId])

  const selectedProviderAppPasswordUrl = React.useMemo(() => {
    if (!formState.selectedProviderId) return null
    const provider = getProviderById(formState.selectedProviderId)
    return provider?.appPasswordUrl ?? null
  }, [formState.selectedProviderId])

  function validateFormState(): string | null {
    if (formState.authType === 'oauth2') {
      if (!formState.oauthAuthorized || !formState.oauthEmail) {
        return '请先完成 OAuth 授权登录。'
      }
      return null
    }
    const email = formState.emailAddress.trim()
    if (!email || !email.includes('@')) return '请填写有效的邮箱地址。'
    if (!formState.imapHost.trim()) return '请填写 IMAP 服务器地址。'
    if (!formState.smtpHost.trim()) return '请填写 SMTP 服务器地址。'
    if (!formState.password.trim()) return `请填写${selectedProviderPasswordLabel}。`
    if (!Number.isFinite(formState.imapPort) || formState.imapPort <= 0) return 'IMAP 端口不正确。'
    if (!Number.isFinite(formState.smtpPort) || formState.smtpPort <= 0) return 'SMTP 端口不正确。'
    return null
  }

  function handleTestConnection() {
    const error = validateFormState()
    if (error) {
      setFormError(error)
      setTestStatus('error')
      return
    }
    setFormError(null)
    setTestStatus('checking')
    testConnectionPreAddMutation.mutate(
      {
        emailAddress: formState.emailAddress.trim(),
        imap: { host: formState.imapHost.trim(), port: formState.imapPort, tls: formState.imapTls },
        smtp: { host: formState.smtpHost.trim(), port: formState.smtpPort, tls: formState.smtpTls },
        password: formState.password,
      },
      {
        onSuccess: (data) => {
          if (data.ok) {
            setTestStatus('ok')
            setFormError(null)
          } else {
            setTestStatus('error')
            setFormError(data.error ?? '连接测试失败。')
          }
        },
        onError: (err) => {
          setTestStatus('error')
          setFormError(err.message ?? '连接测试失败。')
        },
      },
    )
  }

  function handleAddAccount() {
    const error = validateFormState()
    if (error) {
      setFormError(error)
      return
    }
    if (!workspaceId) {
      setFormError('工作空间未加载，请稍后再试。')
      return
    }
    if (formState.authType === 'oauth2') {
      const oauthAuthType =
        formState.oauthProvider === 'google' ? 'oauth2-gmail' : 'oauth2-graph'
      addAccountMutation.mutate({
        authType: oauthAuthType,
        workspaceId,
        emailAddress: (formState.oauthEmail ?? formState.emailAddress).trim(),
        label: formState.label.trim() || undefined,
      })
      return
    }
    addAccountMutation.mutate({
      authType: 'password',
      workspaceId,
      emailAddress: formState.emailAddress.trim(),
      label: formState.label.trim() || undefined,
      imap: { host: formState.imapHost.trim(), port: Number(formState.imapPort || 0), tls: formState.imapTls },
      smtp: { host: formState.smtpHost.trim(), port: Number(formState.smtpPort || 0), tls: formState.smtpTls },
      password: formState.password,
    })
  }

  function handleSelectProvider(providerId: string) {
    const provider = getProviderById(providerId)
    if (!provider) return
    setFormState((prev) => ({
      ...prev,
      step: 'configure',
      selectedProviderId: providerId,
      authType: provider.authType,
      oauthProvider: provider.oauthProvider,
      oauthAuthorized: false,
      oauthEmail: undefined,
      imapHost: provider.imap?.host ?? '',
      imapPort: provider.imap?.port ?? 993,
      imapTls: provider.imap?.tls ?? true,
      smtpHost: provider.smtp?.host ?? '',
      smtpPort: provider.smtp?.port ?? 465,
      smtpTls: provider.smtp?.tls ?? true,
    }))
    setFormError(null)
    setTestStatus('idle')
  }

  function handleBackToProviderSelect() {
    setFormState((prev) => ({ ...prev, step: 'select-provider', selectedProviderId: null }))
    setFormError(null)
    setTestStatus('idle')
  }

  function handleOAuthLogin() {
    if (!workspaceId || !formState.oauthProvider) return
    const serverUrl = resolveServerUrl()
    const oauthUrl = `${serverUrl}/auth/email/${formState.oauthProvider}/start?workspaceId=${encodeURIComponent(workspaceId)}`
    const popup = window.open(oauthUrl, 'oauth', 'width=600,height=700')
    if (!popup) {
      setFormError('无法打开授权窗口，请检查浏览器弹窗设置。')
      return
    }
    const timer = window.setInterval(() => {
      if (!popup.closed) return
      window.clearInterval(timer)
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: trpc.email.listAccounts.queryOptions({ workspaceId }).queryKey,
        })
      }
      setFormState((prev) => ({
        ...prev,
        oauthAuthorized: true,
        oauthEmail: prev.emailAddress || undefined,
      }))
    }, 500)
  }

  function handleSwitchToPassword() {
    const provider = formState.selectedProviderId
      ? getProviderById(formState.selectedProviderId)
      : null
    setFormState((prev) => ({
      ...prev,
      authType: 'password',
      oauthProvider: undefined,
      oauthAuthorized: false,
      oauthEmail: undefined,
      imapHost: provider?.imap?.host ?? prev.imapHost,
      imapPort: provider?.imap?.port ?? prev.imapPort,
      imapTls: provider?.imap?.tls ?? prev.imapTls,
      smtpHost: provider?.smtp?.host ?? prev.smtpHost,
      smtpPort: provider?.smtp?.port ?? prev.smtpPort,
      smtpTls: provider?.smtp?.tls ?? prev.smtpTls,
    }))
    setFormError(null)
    setTestStatus('idle')
  }

  return {
    addDialogOpen,
    onAddDialogOpenChange: (open) => {
      setAddDialogOpen(open)
      if (!open) resetFormState()
    },
    formState,
    setFormState,
    formError,
    testStatus,
    onTestConnection: handleTestConnection,
    onAddAccount: handleAddAccount,
    addAccountPending: addAccountMutation.isPending,
    onSelectProvider: handleSelectProvider,
    onBackToProviderSelect: handleBackToProviderSelect,
    selectedProviderPasswordLabel,
    selectedProviderAppPasswordUrl,
    onOAuthLogin: handleOAuthLogin,
    onSwitchToPassword: handleSwitchToPassword,
  }
}
