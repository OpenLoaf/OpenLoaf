import { memo, useMemo } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TenasSettingsGroup } from "@/components/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@/components/ui/tenas/TenasSettingsField";
import { trpc } from "@/utils/trpc";

type ProjectGitSettingsProps = {
  /** Project id. */
  projectId?: string;
  /** Project root uri. */
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

/** Project git settings panel. */
const ProjectGitSettings = memo(function ProjectGitSettings({
  projectId,
}: ProjectGitSettingsProps) {
  const gitInfoQuery = useQuery({
    ...trpc.project.getGitInfo.queryOptions(projectId ? { projectId } : skipToken),
    staleTime: 5000,
  });
  const gitInfo = gitInfoQuery.data;
  const gitUserLabel = useMemo(() => {
    const name = gitInfo?.userName?.trim() ?? "";
    const email = gitInfo?.userEmail?.trim() ?? "";
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return "-";
  }, [gitInfo?.userEmail, gitInfo?.userName]);
  const baseValueClass =
    "flex-1 text-right text-sm text-foreground hover:underline disabled:cursor-default disabled:no-underline disabled:text-muted-foreground";
  const baseValueTruncateClass = `${baseValueClass} truncate`;
  const baseValueWrapClass = `${baseValueClass} break-all`;

  return (
    <div className="space-y-4">
      <TenasSettingsGroup title="Git 信息" cardProps={{ divided: true, padding: "x" }}>
        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">当前分支</div>
            <div className="text-xs text-muted-foreground">Git 分支名称</div>
          </div>

          <TenasSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={!gitInfo?.branch}
              onClick={async () => {
                if (!gitInfo?.branch) return;
                await copyToClipboard(gitInfo.branch);
                toast.success("已复制当前分支");
              }}
              title={gitInfo?.branch ?? "-"}
            >
              {gitInfo?.branch ?? "-"}
            </button>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">远程 origin</div>
            <div className="text-xs text-muted-foreground">远程仓库地址</div>
          </div>

          <TenasSettingsField>
            <button
              type="button"
              className={baseValueWrapClass}
              disabled={!gitInfo?.originUrl}
              onClick={async () => {
                if (!gitInfo?.originUrl) return;
                await copyToClipboard(gitInfo.originUrl);
                toast.success("已复制远程地址");
              }}
              title={gitInfo?.originUrl ?? "-"}
            >
              {gitInfo?.originUrl ?? "-"}
            </button>
          </TenasSettingsField>
        </div>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 sm:w-56">
            <div className="text-sm font-medium">Git 用户</div>
            <div className="text-xs text-muted-foreground">本地优先，缺失用全局</div>
          </div>

          <TenasSettingsField>
            <button
              type="button"
              className={baseValueTruncateClass}
              disabled={gitUserLabel === "-"}
              onClick={async () => {
                if (gitUserLabel === "-") return;
                await copyToClipboard(gitUserLabel);
                toast.success("已复制 Git 用户");
              }}
              title={gitUserLabel}
            >
              {gitUserLabel}
            </button>
          </TenasSettingsField>
        </div>
      </TenasSettingsGroup>
    </div>
  );
});

export { ProjectGitSettings };
