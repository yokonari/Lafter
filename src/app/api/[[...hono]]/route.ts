import { Hono } from "hono";
import { handle } from "hono/vercel";
import { registerGetVideos } from "./routes/get-videos";
import { registerPostVideosSync } from "./routes/post-videos-sync";
import { registerGetAdminVideos } from "./routes/get-admin-videos";
import { registerPostAdminVideoBulk } from "./routes/post-admin-video-bulk";
import { registerGetAdminChannels } from "./routes/get-admin-channels";
import { registerPostAdminChannelBulk } from "./routes/post-admin-channel-bulk";
import { registerPostAdminChannelRegister } from "./routes/post-admin-channel-register";
import { registerPostChannelSearch } from "./routes/post-channel-search";
import { registerPostSearchLogs } from "./routes/post-search-logs";
import { registerPostVideosAutoCategorize } from "./routes/post-videos-auto-categorize";
import { registerPostVideosReport } from "./routes/post-videos-report";
import { registerPostVideosCheck } from "./routes/post-videos-check";
import { registerPostVideosRss } from "./routes/post-videos-rss";
import { registerPostAdminVideosCache } from "./routes/post-admin-videos-cache";
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
registerGetAdminChannels(app);
registerPostAdminChannelBulk(app);
registerPostAdminChannelRegister(app);
registerPostVideosCheck(app);
registerPostVideosRss(app);
registerPostAdminVideosCache(app);
registerPostChannelSearch(app);
registerPostSearchLogs(app);
registerPostVideosAutoCategorize(app);
registerPostVideosReport(app);

export const GET = handle(app);
export const POST = handle(app);
