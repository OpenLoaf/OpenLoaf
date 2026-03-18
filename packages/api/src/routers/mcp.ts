/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { mcpServerConfigSchema, mcpTransportSchema } from "../types/mcp";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const mcpSchemas = {
  /** Get all MCP servers (merged global + project). */
  getMcpServers: {
    input: z.object({
      projectRoot: z.string().optional(),
    }),
    output: z.array(mcpServerConfigSchema),
  },

  /** Add a new MCP server. */
  addMcpServer: {
    input: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      transport: mcpTransportSchema,
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      cwd: z.string().optional(),
      url: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().default(true),
      scope: z.enum(["global", "project"]),
      projectId: z.string().optional(),
      timeout: z.number().int().positive().optional(),
    }),
    output: mcpServerConfigSchema,
  },

  /** Update an existing MCP server. */
  updateMcpServer: {
    input: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      transport: mcpTransportSchema.optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      cwd: z.string().optional(),
      url: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional(),
      timeout: z.number().int().positive().optional(),
      projectRoot: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean(), server: mcpServerConfigSchema.nullable() }),
  },

  /** Remove an MCP server. */
  removeMcpServer: {
    input: z.object({
      id: z.string(),
      projectRoot: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },

  /** Enable or disable an MCP server. */
  setMcpServerEnabled: {
    input: z.object({
      id: z.string(),
      enabled: z.boolean(),
      projectRoot: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },

  /** Test connection to an MCP server. */
  testMcpConnection: {
    input: z.object({
      id: z.string(),
      projectRoot: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      toolCount: z.number(),
      toolIds: z.array(z.string()),
      error: z.string().optional(),
    }),
  },

  /** Get runtime status of all connected MCP servers. */
  getMcpServerStatus: {
    output: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(["connected", "connecting", "disconnected", "error"]),
        toolCount: z.number(),
        toolIds: z.array(z.string()),
        error: z.string().optional(),
        pid: z.number().optional(),
      }),
    ),
  },

  /** Trust a project-scoped MCP server. */
  trustMcpServer: {
    input: z.object({
      id: z.string(),
      projectRoot: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
};

// ---------------------------------------------------------------------------
// Base Router (abstract, implemented in server)
// ---------------------------------------------------------------------------

export abstract class BaseMcpRouter {
  public static routeName = "mcp";

  public static createRouter() {
    return t.router({
      getMcpServers: shieldedProcedure
        .input(mcpSchemas.getMcpServers.input)
        .output(mcpSchemas.getMcpServers.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      addMcpServer: shieldedProcedure
        .input(mcpSchemas.addMcpServer.input)
        .output(mcpSchemas.addMcpServer.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      updateMcpServer: shieldedProcedure
        .input(mcpSchemas.updateMcpServer.input)
        .output(mcpSchemas.updateMcpServer.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      removeMcpServer: shieldedProcedure
        .input(mcpSchemas.removeMcpServer.input)
        .output(mcpSchemas.removeMcpServer.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      setMcpServerEnabled: shieldedProcedure
        .input(mcpSchemas.setMcpServerEnabled.input)
        .output(mcpSchemas.setMcpServerEnabled.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      testMcpConnection: shieldedProcedure
        .input(mcpSchemas.testMcpConnection.input)
        .output(mcpSchemas.testMcpConnection.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getMcpServerStatus: shieldedProcedure
        .output(mcpSchemas.getMcpServerStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      trustMcpServer: shieldedProcedure
        .input(mcpSchemas.trustMcpServer.input)
        .output(mcpSchemas.trustMcpServer.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const mcpRouter = BaseMcpRouter.createRouter();
export type McpRouter = typeof mcpRouter;
