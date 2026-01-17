"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";

interface FileViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
}

/** Render a simple file preview panel. */
export default function FileViewer({ uri, name, projectId }: FileViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      uri && workspaceId ? { workspaceId, projectId, uri } : skipToken
    )
  );

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
  }

  if (fileQuery.isLoading) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (fileQuery.isError) {
    return (
      <div className="h-full w-full p-4 text-destructive">
        {fileQuery.error?.message ?? "读取失败"}
      </div>
    );
  }

  const content = fileQuery.data?.content ?? "";

  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="mb-3 text-sm text-muted-foreground truncate">
        {name ?? uri}
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-6">{content}</pre>
    </div>
  );
}
