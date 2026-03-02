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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Textarea } from "@openloaf/ui/textarea";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Label } from "@openloaf/ui/label";
import { Badge } from "@openloaf/ui/badge";
import { ScrollArea } from "@openloaf/ui/scroll-area";
import { Loader2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

type GitCommitDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitSuccess?: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  modified: "text-amber-600 dark:text-amber-400",
  deleted: "text-rose-600 dark:text-rose-400",
  renamed: "text-blue-600 dark:text-blue-400",
  untracked: "text-muted-foreground",
};

export function GitCommitDialog({
  projectId,
  open,
  onOpenChange,
  onCommitSuccess,
}: GitCommitDialogProps) {
  const { t } = useTranslation("settings");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [stageAll, setStageAll] = useState(true);

  const statusQuery = useQuery({
    ...trpc.project.getGitStatus.queryOptions({ projectId }),
    enabled: open,
    refetchOnMount: "always",
  });

  const generateMutation = useMutation(
    trpc.settings.generateCommitMessage.mutationOptions({
      onSuccess: (data) => {
        if (data.subject) setSubject(data.subject);
        if (data.body) setBody(data.body);
      },
      onError: () => {
        toast.error(t("project.git.commitAiFailed"));
      },
    }),
  );

  const commitMutation = useMutation(
    trpc.project.gitCommit.mutationOptions({
      onSuccess: (data) => {
        if (data.ok) {
          toast.success(t("project.git.commitSuccess"));
          onOpenChange(false);
          onCommitSuccess?.();
        } else {
          toast.error(data.error ?? t("project.git.commitFailed"));
        }
      },
      onError: () => {
        toast.error(t("project.git.commitFailed"));
      },
    }),
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSubject("");
      setBody("");
      setStageAll(true);
    }
  }, [open]);

  const status = statusQuery.data;
  const allFiles = [
    ...(status?.staged ?? []).map((f) => ({ ...f, area: "staged" as const })),
    ...(status?.unstaged ?? []).map((f) => ({ ...f, area: "unstaged" as const })),
  ];

  const canCommit =
    subject.trim().length > 0 &&
    (status?.hasStagedChanges || stageAll) &&
    !commitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("project.git.commitTitle")}</DialogTitle>
          <DialogDescription>{t("project.git.commitDesc")}</DialogDescription>
        </DialogHeader>

        {/* Changed files list */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {t("project.git.changedFiles")}
          </Label>
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("project.git.loadingStatus")}
            </div>
          ) : allFiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t("project.git.noChanges")}
            </div>
          ) : (
            <ScrollArea className="max-h-40 rounded-md border">
              <div className="p-2 space-y-0.5">
                {allFiles.map((file) => (
                  <div
                    key={`${file.area}-${file.path}`}
                    className="flex items-center gap-2 rounded px-1.5 py-0.5 text-xs"
                  >
                    <Badge
                      variant="outline"
                      className={`px-1 py-0 text-[10px] font-normal ${STATUS_COLORS[file.status] ?? ""}`}
                    >
                      {file.status[0]?.toUpperCase()}
                    </Badge>
                    <span className="flex-1 truncate font-mono">{file.path}</span>
                    {file.area === "staged" && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        staged
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Commit message form */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="commit-subject" className="text-xs">
              Subject
            </Label>
            <Input
              id="commit-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="feat(scope): short description"
              className="mt-1 font-mono text-sm"
              maxLength={72}
            />
          </div>
          <div>
            <Label htmlFor="commit-body" className="text-xs">
              Body
            </Label>
            <Textarea
              id="commit-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("project.git.commitBodyPlaceholder")}
              className="mt-1 min-h-[60px] font-mono text-sm"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="stage-all"
              checked={stageAll}
              onCheckedChange={(checked) => setStageAll(checked === true)}
            />
            <Label htmlFor="stage-all" className="text-xs">
              {t("project.git.stageAll")}
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={generateMutation.isPending}
            onClick={() => generateMutation.mutate({ projectId })}
          >
            {generateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {t("project.git.commitAiGenerate")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("project.git.commitCancel")}
          </Button>
          <Button
            size="sm"
            disabled={!canCommit}
            onClick={() => {
              commitMutation.mutate({
                projectId,
                subject: subject.trim(),
                body: body.trim() || undefined,
                stageAll,
              });
            }}
          >
            {commitMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : null}
            {t("project.git.commitSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
