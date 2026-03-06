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

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
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
import { Label } from "@openloaf/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";

interface ConvertChatToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatSessionId: string;
  workspaceId: string;
  onSuccess?: () => void;
}

export function ConvertChatToProjectDialog({
  open,
  onOpenChange,
  chatSessionId,
  workspaceId,
  onSuccess,
}: ConvertChatToProjectDialogProps) {
  const { t } = useTranslation("nav");
  const [projectTitle, setProjectTitle] = useState("");
  const [parentProjectId, setParentProjectId] = useState<string | undefined>(undefined);

  // 查询对话信息
  const { data: chatData } = useQuery({
    ...trpc.chat.getSession.queryOptions({ sessionId: chatSessionId }),
    enabled: open,
  });

  // 查询项目列表
  const { data: projectsData } = useQuery({
    ...trpc.project.list.queryOptions(),
    enabled: open,
  });

  const convertMutation = useMutation(
    trpc.project.convertChatToProject.mutationOptions({
      onSuccess: () => {
        onSuccess?.();
      },
    }),
  );

  // 初始化项目标题
  useEffect(() => {
    if (open && chatData?.session) {
      setProjectTitle(chatData.session.title || "");
    }
  }, [open, chatData]);

  const handleSubmit = () => {
    if (!projectTitle.trim()) {
      return;
    }

    convertMutation.mutate({
      chatSessionId,
      projectTitle: projectTitle.trim(),
      projectParentId: parentProjectId,
    });
  };

  // 扁平化项目树
  const flattenProjects = (trees: any[]): Array<{ id: string; title: string; depth: number }> => {
    const result: Array<{ id: string; title: string; depth: number }> = [];
    const traverse = (nodes: any[], depth = 0) => {
      for (const node of nodes) {
        result.push({
          id: node.projectId,
          title: node.title || "Untitled",
          depth,
        });
        if (node.children && node.children.length > 0) {
          traverse(node.children, depth + 1);
        }
      }
    };
    traverse(trees);
    return result;
  };

  const projects = projectsData ? flattenProjects(projectsData) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("convertToProject.title")}</DialogTitle>
          <DialogDescription>
            {t("convertToProject.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-title">{t("convertToProject.projectName")}</Label>
            <Input
              id="project-title"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder={t("convertToProject.projectNamePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent-project">{t("convertToProject.parentProject")}</Label>
            <Select value={parentProjectId} onValueChange={setParentProjectId}>
              <SelectTrigger id="parent-project">
                <SelectValue placeholder={t("convertToProject.parentProjectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("convertToProject.noParent")}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {"  ".repeat(project.depth)}
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("convertToProject.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!projectTitle.trim() || convertMutation.isPending}
          >
            {convertMutation.isPending ? t("convertToProject.converting") : t("convertToProject.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
