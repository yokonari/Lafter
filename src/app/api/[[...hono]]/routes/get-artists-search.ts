import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "../context";
import { ArtistRepository } from "@/lib/repositories/artistRepository";
import type { AdminEnv } from "../types";

export function registerGetArtistsSearch(app: Hono<AdminEnv>) {
  app.get("/artists/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q || q.length < 2) {
      return c.json({ artists: [] }, 200);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const repo = new ArtistRepository(db);
    const matches = await repo.searchByName(q);

    return c.json({ artists: matches }, 200);
  });
}
