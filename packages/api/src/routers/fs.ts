import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { t, shieldedProcedure } from "../index";
import { resolveWorkspacePathFromUri, toFileUri } from "../services/vfsService";

const fsUriSchema = z.object({
  uri: z.string(),
});

const fsListSchema = z.object({
  uri: z.string(),
  includeHidden: z.boolean().optional(),
});

const fsCopySchema = z.object({
  from: z.string(),
  to: z.string(),
});

/** Build a file node for UI consumption. */
function buildFileNode(input: { name: string; fullPath: string; stat: Awaited<ReturnType<typeof fs.stat>> }) {
  const ext = path.extname(input.name).replace(/^\./, "");
  const isDir = input.stat.isDirectory();
  return {
    uri: toFileUri(input.fullPath),
    name: input.name,
    kind: isDir ? "folder" : "file",
    ext: ext || undefined,
    size: isDir ? undefined : input.stat.size,
    updatedAt: input.stat.mtime.toISOString(),
  };
}

export const fsRouter = t.router({
  /** Read metadata for a file or directory. */
  stat: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const stat = await fs.stat(fullPath);
    return buildFileNode({ name: path.basename(fullPath), fullPath, stat });
  }),

  /** List direct children of a directory. */
  list: shieldedProcedure.input(fsListSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const includeHidden = Boolean(input.includeHidden);
    const nodes = [];
    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      const entryPath = path.join(fullPath, entry.name);
      const stat = await fs.stat(entryPath);
      nodes.push(buildFileNode({ name: entry.name, fullPath: entryPath, stat }));
    }
    return { entries: nodes };
  }),

  /** Read a text file. */
  readFile: shieldedProcedure.input(fsUriSchema).query(async ({ input }) => {
    const fullPath = resolveWorkspacePathFromUri(input.uri);
    const content = await fs.readFile(fullPath, "utf-8");
    return { content };
  }),

  /** Write a text file. */
  writeFile: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, input.content, "utf-8");
      return { ok: true };
    }),

  /** Create a directory. */
  mkdir: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(fullPath, { recursive: input.recursive ?? true });
      return { ok: true };
    }),

  /** Rename or move a file/folder. */
  rename: shieldedProcedure
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fromPath = resolveWorkspacePathFromUri(input.from);
      const toPath = resolveWorkspacePathFromUri(input.to);
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
      return { ok: true };
    }),

  /** Copy a file/folder. */
  copy: shieldedProcedure.input(fsCopySchema).mutation(async ({ input }) => {
    const fromPath = resolveWorkspacePathFromUri(input.from);
    const toPath = resolveWorkspacePathFromUri(input.to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.cp(fromPath, toPath, { recursive: true });
    return { ok: true };
  }),

  /** Delete a file/folder. */
  delete: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        recursive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.rm(fullPath, { recursive: input.recursive ?? true, force: true });
      return { ok: true };
    }),

  /** Write a binary file (base64 payload). */
  writeBinary: shieldedProcedure
    .input(
      z.object({
        uri: z.string(),
        contentBase64: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const fullPath = resolveWorkspacePathFromUri(input.uri);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.from(input.contentBase64, "base64");
      await fs.writeFile(fullPath, buffer);
      return { ok: true };
    }),

  /** Search within workspace root (MVP stub). */
  search: shieldedProcedure
    .input(
      z.object({
        rootUri: z.string(),
        query: z.string(),
      })
    )
    .query(async ({ input }) => {
      const rootPath = resolveWorkspacePathFromUri(input.rootUri);
      const results = await fs.readdir(rootPath).then(() => []);
      return { results };
    }),
});

export type FsRouter = typeof fsRouter;
