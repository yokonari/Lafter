import { Hono } from "hono";
import { handle } from "hono/vercel";
import { registerGetVideos } from "./routes/get-videos";
import { registerPostVideosSync } from "./routes/post-videos-sync";
import { registerGetAdminVideos } from "./routes/get-admin-videos";
import { registerPostAdminVideoBulk } from "./routes/post-admin-video-bulk";
import { registerGetAdminPlaylists } from "./routes/get-admin-playlists";
import { registerGetAdminChannels } from "./routes/get-admin-channels";
import { registerPostAdminPlaylistBulk } from "./routes/post-admin-playlist-bulk";
import { registerPostAdminChannelBulk } from "./routes/post-admin-channel-bulk";
import { authMiddleware } from "@/lib/middleware/auth";
import { apiSecretMiddleware } from "@/lib/middleware/api-secret";
import type { AdminEnv } from "./types";

const app = new Hono<AdminEnv>().basePath("/api");

// 管理者向けエンドポイント全体に丁寧な認証チェックを差し込みます。
app.use("/admin/*", authMiddleware);
// GET /api/videos を除くすべての API に共有シークレットの検証を丁寧に適用します。
app.use("*", apiSecretMiddleware);

export type AppType = typeof app;

registerGetVideos(app);
registerPostVideosSync(app);
registerGetAdminVideos(app);
registerPostAdminVideoBulk(app);
registerGetAdminPlaylists(app);
registerPostAdminPlaylistBulk(app);
registerGetAdminChannels(app);
registerPostAdminChannelBulk(app);

export const GET = handle(app);
export const POST = handle(app);
