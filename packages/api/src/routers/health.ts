import { publicProcedure } from "../index";

export const health = publicProcedure.query(() => {
  return { ok: true, timestamp: Date.now() };
});

