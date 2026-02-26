/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useEffect, useState } from "react";
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export type ModelProviderOption = {
  id: string;
  label: string;
};

export type AddModelProviderPayload = {
  providerId: string;
  model: string;
};

type AddModelProviderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ModelProviderOption[];
  onSave: (payload: AddModelProviderPayload) => void;
  title?: string;
  submitLabel?: string;
  defaultProviderId?: string;
  defaultModel?: string;
};

/** Render the add-model-provider dialog used across settings and onboarding. */
export function AddModelProviderDialog({
  open,
  onOpenChange,
  providers,
  onSave,
  title = "添加模型",
  submitLabel = "保存",
  defaultProviderId,
  defaultModel = "",
}: AddModelProviderDialogProps) {
  const [draftProvider, setDraftProvider] = useState<string>(
    defaultProviderId ?? providers[0]?.id ?? "openai",
  );
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraftProvider(defaultProviderId ?? providers[0]?.id ?? "openai");
    setDraftModel(defaultModel);
  }, [defaultModel, defaultProviderId, open, providers]);

  const providerLabelById = providers.reduce<Record<string, string>>((acc, item) => {
    acc[item.id] = item.label;
    return acc;
  }, {});

  /** Save the draft provider + model selection. */
  const handleSave = () => {
    const model = draftModel.trim();
    if (!model) {
      setError("请填写模型名称");
      return;
    }
    onSave({ providerId: draftProvider, model });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">供应商</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{providerLabelById[draftProvider]}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuRadioGroup
                  value={draftProvider}
                  onValueChange={(next) => setDraftProvider(next)}
                >
                  {providers.map((provider) => (
                    <DropdownMenuRadioItem key={provider.id} value={provider.id}>
                      {provider.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型</div>
            <Input
              value={draftModel}
              placeholder="例如：gpt-4o-mini"
              onChange={(event) => setDraftModel(event.target.value)}
            />
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
