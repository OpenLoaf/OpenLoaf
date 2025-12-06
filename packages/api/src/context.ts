import type { Context as HonoContext } from "hono";
import prisma from "@teatime-ai/db";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context: _context }: CreateContextOptions): Promise<{
	session: null;
	prisma: typeof prisma;
}> {
	// No auth configured
	return {
		session: null,
		prisma,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
