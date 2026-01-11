import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  httpSubscriptionLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@tenas-ai/api";
import { toast } from "sonner";
import superjson from "superjson";
import { resolveServerUrl } from "@/utils/server-url";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
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
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
