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
import type { ServerAppRouter } from "../../server/src/types/appRouter";
import { toast } from "sonner";
import superjson from "superjson";
import { resolveServerUrl } from "@/utils/server-url";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
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

export const trpcClient = createTRPCClient<ServerAppRouter>({
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

export const trpc = createTRPCOptionsProxy<ServerAppRouter>({
  client: trpcClient,
  queryClient,
});
