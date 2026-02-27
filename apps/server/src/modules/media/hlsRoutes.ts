/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Hono } from "hono";
import {
  getHlsManifest,
  getHlsProgress,
  getHlsSegment,
  getHlsThumbnail,
  getHlsThumbnails,
  isHlsQuality,
} from "./hlsService";

/** Register HLS media routes. */
export function registerHlsRoutes(app: Hono) {
  app.get("/media/hls/manifest", async (c) => {
    const path = c.req.query("path")?.trim() ?? "";
    const projectId = c.req.query("projectId")?.trim() ?? "";
    const workspaceId = c.req.query("workspaceId")?.trim() ?? "";
    const qualityRaw = c.req.query("quality")?.trim();
    const quality = qualityRaw ? qualityRaw.toLowerCase() : undefined;
    if (!path || (!projectId && !workspaceId)) {
      return c.json({ error: "Invalid manifest query" }, 400);
    }
    if (quality && !isHlsQuality(quality)) {
      return c.json({ error: "Invalid quality value" }, 400);
    }
    const qualityValue = isHlsQuality(quality) ? quality : undefined;
    const manifest = await getHlsManifest({
      path,
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      quality: qualityValue,
    });
    if (!manifest) {
      return c.json({ error: "Manifest not found" }, 404);
    }
    if (manifest.status === "building") {
      return c.body("HLS building", 202, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
        "Retry-After": "2",
      });
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

  /** Report progress for ongoing HLS manifest generation. */
  app.get("/media/hls/progress", async (c) => {
    const path = c.req.query("path")?.trim() ?? "";
    const projectId = c.req.query("projectId")?.trim() ?? "";
    const workspaceId = c.req.query("workspaceId")?.trim() ?? "";
    const qualityRaw = c.req.query("quality")?.trim();
    const quality = qualityRaw ? qualityRaw.toLowerCase() : undefined;
    if (!path || !quality || (!projectId && !workspaceId)) {
      return c.json({ error: "Invalid progress query" }, 400);
    }
    if (!isHlsQuality(quality)) {
      return c.json({ error: "Invalid quality value" }, 400);
    }
    const progress = await getHlsProgress({
      path,
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
      quality,
    });
    if (!progress) {
      return c.json({ error: "Progress not found" }, 404);
    }
    return c.json(progress, 200, {
      "Cache-Control": "no-store",
    });
  });

  app.get("/media/hls/thumbnails", async (c) => {
    const path = c.req.query("path")?.trim() ?? "";
    const projectId = c.req.query("projectId")?.trim() ?? "";
    const workspaceId = c.req.query("workspaceId")?.trim() ?? "";
    if (!path || (!projectId && !workspaceId)) {
      return c.json({ error: "Invalid thumbnails query" }, 400);
    }
    const thumbnails = await getHlsThumbnails({
      path,
      projectId: projectId || undefined,
      workspaceId: workspaceId || undefined,
    });
    if (!thumbnails) {
      return c.json({ error: "Thumbnails not found" }, 404);
    }
    return c.body(thumbnails.vtt, 200, {
      "Content-Type": "text/vtt",
      "Cache-Control": "no-store",
    });
  });

  app.get("/media/hls/thumbnail/:name", async (c) => {
    const name = c.req.param("name")?.trim() ?? "";
    const token = c.req.query("token")?.trim() ?? "";
    if (!name || !token) {
      return c.json({ error: "Invalid thumbnail query" }, 400);
    }
    const thumbnail = await getHlsThumbnail({ token, name });
    if (!thumbnail) {
      return c.json({ error: "Thumbnail not found" }, 404);
    }
    return c.body(thumbnail, 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
    });
  });
}
