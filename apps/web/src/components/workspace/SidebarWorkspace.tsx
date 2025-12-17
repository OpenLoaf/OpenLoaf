"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/animate-ui/components/radix/sidebar";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { queryClient, trpc } from "@/utils/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  return decodeURIComponent(cookie.slice(name.length + 1));
}

export const SidebarWorkspace = () => {
  const { workspace } = useWorkspace();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  const [userEmail, setUserEmail] = React.useState<string | undefined>();
  const [userAvatarUrl, setUserAvatarUrl] = React.useState<string | undefined>();

  React.useEffect(() => {
    const fromStorageEmail = window.localStorage.getItem("user-email") ?? "";
    const fromCookieEmail = readCookie("user-email") ?? "";
    const email = fromStorageEmail || fromCookieEmail;
    setUserEmail(email || undefined);

    const fromStorageAvatar = window.localStorage.getItem("user-avatar") ?? "";
    const fromCookieAvatar = readCookie("user-avatar") ?? "";
    const avatar = fromStorageAvatar || fromCookieAvatar;
    setUserAvatarUrl(avatar || undefined);
  }, []);

  React.useEffect(() => {
    if (!createOpen) return;
    setNewWorkspaceName("");
  }, [createOpen]);

  const workspacesQuery = useQuery(trpc.workspace.getList.queryOptions());

  const activateWorkspace = useMutation(
    trpc.workspace.activate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    })
  );

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("工作空间已创建");
        setCreateOpen(false);
        setNewWorkspaceName("");
        await activateWorkspace.mutateAsync({ id: created.id });
        queryClient.invalidateQueries();
      },
    })
  );

  if (!workspace?.id) {
    return null;
  }

  const workspaces = (workspacesQuery.data ?? []).slice().sort((a, b) => {
    if (a.id === workspace.id) return -1;
    if (b.id === workspace.id) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) {
      toast.error("请输入工作空间名称");
      return;
    }

    await createWorkspace.mutateAsync({ name });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="default"
                className=" h-12 rounded-lg px-1.5 py-3 [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                  <Building2 className="size-4" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate text-sm font-medium leading-5">
                    {workspace.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {userEmail ?? "未登录"}
                  </div>
                </div>
                <ChevronsUpDown className="text-muted-foreground size-4 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-72 rounded-xl p-2"
            >
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar className="size-9">
                  {userAvatarUrl ? (
                    <AvatarImage src={userAvatarUrl} alt={userEmail ?? "User"} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {(userEmail?.[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-5">
                    当前账号
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {userEmail ?? "未登录"}
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator className="my-2" />

              <div className="space-y-1">
                {userEmail ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => toast.message("暂未接入账号系统，无法退出登录")}
                    className="rounded-lg"
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => toast.message("暂未接入账号系统")}
                    className="rounded-lg"
                  >
                    <LogIn className="size-4" />
                    登录账户
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => toast.message("暂未接入更新检查")}
                  className="rounded-lg"
                >
                  <RefreshCcw className="size-4" />
                  检查更新
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-2" />

              <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
                工作空间
              </DropdownMenuLabel>

              <div className="mt-1 space-y-1">
                {workspacesQuery.isLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    加载中…
                  </div>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = ws.id === workspace.id;
                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        disabled={isActive || activateWorkspace.isPending}
                        onSelect={() => {
                          if (isActive) return;
                          activateWorkspace.mutate({ id: ws.id });
                        }}
                        className="rounded-lg"
                      >
                        <div className="bg-muted text-muted-foreground flex size-5 items-center justify-center rounded-md">
                          <Building2 className="size-3" />
                        </div>
                        <span className="min-w-0 flex-1 truncate">
                          {ws.name}
                        </span>
                        {isActive ? (
                          <Check className="text-muted-foreground size-4" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>

              <DropdownMenuItem
                onSelect={() => setCreateOpen(true)}
                className="mt-1 rounded-lg"
              >
                <Plus className="size-4" />
                新增工作空间
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateWorkspace();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>新增工作空间</DialogTitle>
                <DialogDescription>
                  创建一个新的工作空间，并自动切换到它。
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2">
                <Input
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="例如：我的团队"
                  autoFocus
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createWorkspace.isPending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createWorkspace.isPending}>
                  {createWorkspace.isPending ? "创建中…" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
