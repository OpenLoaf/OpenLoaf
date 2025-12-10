import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  httpSubscriptionLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@teatime-ai/api";
import { toast } from "sonner";

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

const baseUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/trpc`;

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: baseUrl,
        eventSourceOptions: {
          withCredentials: true,
        },
      }),
      false: httpBatchLink({
        url: baseUrl,
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
