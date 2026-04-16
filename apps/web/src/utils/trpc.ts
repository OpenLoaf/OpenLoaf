/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  httpSubscriptionLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@openloaf/api";
import { toast } from "sonner";
import i18next from "i18next";
import { cleanupProjectCache } from "@/lib/project-cache-cleanup";
import superjson from "superjson";
import { resolveServerUrl } from "@/utils/server-url";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 调用方通过 meta.suppressToast 标记不需要弹 toast 的查询（如首次打开桌面/看板时文件不存在）
      if (query.meta?.suppressToast) return;
      // Project directory missing — already cleaned up server-side, just notify the user.
      if (error.message === "PROJECT_REMOVED") {
        // Extract projectId from the query key to clean up stale caches
        const input = query.queryKey.find(
          (k): k is { input: { projectId: string } } =>
            typeof k === "object" && k !== null && "input" in k,
        );
        if (input?.input?.projectId) {
          cleanupProjectCache(input.input.projectId);
        }
        toast.info(
          i18next.t("nav:project.removedAutoCleanup"),
          { id: "project-removed" },
        );
        queryClient.invalidateQueries({ queryKey: ["project", "list"] });
        queryClient.invalidateQueries({ queryKey: ["project", "listPaged"] });
        return;
      }
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries({ queryKey: query.queryKey });
          },
        },
      });
    },
  }),
});

const baseUrl = `${resolveServerUrl()}/trpc`;

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: baseUrl,
        eventSourceOptions: {
          withCredentials: true,
        },
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: baseUrl,
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
