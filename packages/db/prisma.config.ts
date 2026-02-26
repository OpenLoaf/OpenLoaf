import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveOpenLoafDatabaseUrl } from "@openloaf/config";

export default defineConfig({
	schema: path.join("prisma", "schema"),
	migrations: {
		path: path.join("prisma", "migrations"),
	},
	datasource: {
		url: resolveOpenLoafDatabaseUrl(),
	},
});
