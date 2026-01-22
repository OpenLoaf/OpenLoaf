import type { Hono } from "hono";
import { getHlsManifest, getHlsSegment } from "./hlsService";

/** Register HLS media routes. */
export function registerHlsRoutes(app: Hono) {
  app.get("/media/hls/manifest", async (c) => {
    const path = c.req.query("path")?.trim() ?? "";
    const projectId = c.req.query("projectId")?.trim() ?? "";
    if (!path || !projectId) {
      return c.json({ error: "Invalid manifest query" }, 400);
    }
    const manifest = await getHlsManifest({ path, projectId });
    if (!manifest) {
      return c.json({ error: "Manifest not found" }, 404);
    }
    return c.body(manifest.manifest, 200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
    });
  });

  app.get("/media/hls/segment/:name", async (c) => {
    const name = c.req.param("name")?.trim() ?? "";
    const token = c.req.query("token")?.trim() ?? "";
    if (!name || !token) {
      return c.json({ error: "Invalid segment query" }, 400);
    }
    const segment = await getHlsSegment({ token, name });
    if (!segment) {
      return c.json({ error: "Segment not found" }, 404);
    }
    return c.body(segment, 200, {
      "Content-Type": "video/MP2T",
      "Cache-Control": "no-store",
    });
  });
}
