/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { FormDialog } from "@/components/ui/FormDialog";

import { getProviderById } from "./email-provider-presets";
import type { AddDialogState } from "./use-email-page-state";
import { ProviderSelectStep } from "./EmailAddAccountProviderStep";
import { ConfigureStep } from "./EmailAddAccountConfigureStep";

type EmailAddAccountDialogProps = {
  addDialog: AddDialogState;
};

export function EmailAddAccountDialog({ addDialog }: EmailAddAccountDialogProps) {
  const { t } = useTranslation('common');
  const isSelectStep = addDialog.formState.step === "select-provider";
  const isOAuth = addDialog.formState.authType === "oauth2";
  const selectedProvider = addDialog.formState.selectedProviderId
    ? getProviderById(addDialog.formState.selectedProviderId)
    : null;

  if (isSelectStep) {
    return (
      <Dialog open={addDialog.addDialogOpen} onOpenChange={addDialog.onAddDialogOpenChange}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pb-0 pt-5">
            <DialogTitle className="text-base">{t('email.addAccount')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('email.selectProviderDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3">
            <ProviderSelectStep onSelectProvider={addDialog.onSelectProvider} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const configureTitle = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={addDialog.onBackToProviderSelect}
        className="-ml-1 rounded-3xl p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div className="flex items-center gap-2">
        {selectedProvider ? (
          <span className="flex size-6 items-center justify-center rounded-3xl bg-muted">
            <selectedProvider.icon className="size-3.5" />
          </span>
        ) : null}
        <span className="text-base">
          {selectedProvider?.name ?? t('email.configureMailbox')}
        </span>
      </div>
    </div>
  );

  const configureDescription = isOAuth
    ? t('email.oauthDesc')
    : t('email.passwordDesc', { label: addDialog.selectedProviderPasswordLabel });

  const handleConfigureSubmit = () => {
    addDialog.onAddAccount();
  };

  return (
    <FormDialog
      open={addDialog.addDialogOpen}
      onOpenChange={addDialog.onAddDialogOpenChange}
      title={configureTitle}
      description={configureDescription}
      onSubmit={handleConfigureSubmit}
      autoClose={false}
      submitting={addDialog.addAccountPending}
      submitLabel={t('email.saveAccount')}
      submittingLabel={t('saving')}
      contentClassName="max-w-md"
      footerLeft={
        isOAuth ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addDialog.onTestConnection}
            disabled={addDialog.testStatus === "checking"}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {addDialog.testStatus === "checking" ? t('email.testing') : t('email.testConnection')}
          </Button>
        )
      }
    >
      <ConfigureStep addDialog={addDialog} />
    </FormDialog>
  );
}
