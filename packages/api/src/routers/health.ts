import { publicProcedure } from "../../generated/routers/helpers/createRouter";

export const health = publicProcedure.query(() => {
  return { ok: true, timestamp: Date.now() };
});

