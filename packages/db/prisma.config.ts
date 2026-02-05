import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveTenasDatabaseUrl } from "@tenas-ai/config";

export default defineConfig({
	schema: path.join("prisma", "schema"),
	migrations: {
		path: path.join("prisma", "migrations"),
	},
	datasource: {
		url: resolveTenasDatabaseUrl(),
	},
});
