import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { TeatimeAutoWidthInput } from "@/components/ui/teatime/TeatimeAutoWidthInput";
import { useProject } from "@/hooks/use-project";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmojiPicker } from "@/components/ui/emoji-picker";

type ProjectBasicSettingsProps = {
  projectId?: string;
  rootUri?: string;
};

/** Copy text to clipboard with a fallback. */
async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

/** Project basic settings panel. */
const ProjectBasicSettings = memo(function ProjectBasicSettings({
  projectId,
  rootUri,
}: ProjectBasicSettingsProps) {
  const { data: projectData, invalidateProject, invalidateProjectList } = useProject(
    rootUri,
  );
  const project = projectData?.project;
  const [draftTitle, setDraftTitle] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProject();
        await invalidateProjectList();
      },
    }),
  );

  useEffect(() => {
    setDraftTitle(project?.title ?? "");
  }, [project?.title, project?.icon]);

  const storagePath = useMemo(() => rootUri ?? "", [rootUri]);
  // 中文注释：基于 rootUri 生成默认缓存路径展示。
  const cachePath = useMemo(() => {
    if (!rootUri) return "";
    try {
      const url = new URL(rootUri);
      const base = url.pathname.replace(/\/$/, "");
      url.pathname = `${base}/.teatime_cache`;
      return url.toString();
    } catch {
      return "";
    }
  }, [rootUri]);

  const commitProjectTitle = useCallback(() => {
    if (!projectId || !rootUri) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === project?.title) return;
    updateProject.mutate({ rootUri, title: nextTitle });
  }, [projectId, rootUri, draftTitle, project?.title, updateProject]);

  return (
    <div className="space-y-4">
      <TeatimeSettingsGroup title="项目设置" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目 ID</div>
            <div className="text-xs text-muted-foreground">仅用于识别与复制</div>
          </div>

          <TeatimeSettingsField className="gap-2">
            <div className="flex-1 text-right text-sm text-foreground">
              {projectId ?? "-"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="复制项目 ID"
              title="复制项目 ID"
              disabled={!projectId}
              onClick={async () => {
                if (!projectId) return;
                await copyToClipboard(projectId);
                toast.success("已复制项目 ID");
              }}
              >
                <Copy className="size-4" />
              </Button>
          </TeatimeSettingsField>
        </div>

        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目图标</div>
            <div className="text-xs text-muted-foreground">支持 Emoji</div>
          </div>

          <TeatimeSettingsField>
            <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!projectId || !rootUri}
                  aria-label="选择项目图标"
                  title="选择项目图标"
                >
                  <span className="text-lg leading-none">
                    {project?.icon ?? <SmilePlus className="size-4" />}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[352px] max-w-[calc(100vw-24px)] p-0 min-h-[420px] bg-popover overflow-hidden"
                align="end"
              >
                <EmojiPicker
                  width="100%"
                  onSelect={(nextIcon) => {
                    setIconPickerOpen(false);
                    if (!projectId || !rootUri) return;
                    updateProject.mutate({ rootUri, icon: nextIcon });
                  }}
                />
              </PopoverContent>
            </Popover>
          </TeatimeSettingsField>
        </div>

        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">项目名称</div>
            <div className="text-xs text-muted-foreground">显示在项目标题处</div>
          </div>

          <TeatimeSettingsField>
            <TeatimeAutoWidthInput
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitProjectTitle}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitProjectTitle();
              }}
              className="bg-background"
              placeholder="请输入项目名称"
            />
          </TeatimeSettingsField>
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="存储管理" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">存储路径</div>
            <div className="text-xs text-muted-foreground">项目根目录</div>
          </div>

          <TeatimeSettingsField>
            <TeatimeAutoWidthInput
              value={storagePath}
              readOnly
              placeholder="未配置"
              className="bg-background"
              minChars={16}
              maxChars={48}
            />
          </TeatimeSettingsField>
        </div>

        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">缓存路径</div>
            <div className="text-xs text-muted-foreground">临时文件缓存目录</div>
          </div>

          <TeatimeSettingsField>
            <TeatimeAutoWidthInput
              value={cachePath}
              readOnly
              placeholder="未配置"
              className="bg-background"
              minChars={16}
              maxChars={48}
            />
          </TeatimeSettingsField>
        </div>

        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">启用 S3 服务</div>
            <div className="text-xs text-muted-foreground">暂未接入</div>
          </div>

          <TeatimeSettingsField>
            <Switch checked={false} disabled />
          </TeatimeSettingsField>
        </div>
      </TeatimeSettingsGroup>
    </div>
  );
});

export { ProjectBasicSettings };
