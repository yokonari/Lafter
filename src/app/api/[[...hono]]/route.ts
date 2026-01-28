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
import { registerGetAdminChannelsSearch } from "./routes/get-admin-channels-search";
import { registerGetAdminComedians } from "./routes/get-admin-comedians";
import { registerGetAdminComedian } from "./routes/get-admin-comedian";
import { registerPostAdminComedian } from "./routes/post-admin-comedian";
import { registerPatchAdminComedian } from "./routes/patch-admin-comedian";
import { registerDeleteAdminComedian } from "./routes/delete-admin-comedian";
import { registerGetAdminAgencies } from "./routes/get-admin-agencies";
import { registerPostAdminAgency } from "./routes/post-admin-agency";
import { registerGetAdminAgencyChannels } from "./routes/get-admin-agency-channels";
import { registerPatchAdminAgencyChannels } from "./routes/patch-admin-agency-channels";
import { registerGetAdminStyles } from "./routes/get-admin-styles";
import { registerPostAdminStyle } from "./routes/post-admin-style";
import { registerGetAdminMediaChannels } from "./routes/get-admin-media-channels";
import { registerPatchAdminMediaChannels } from "./routes/patch-admin-media-channels";
import { registerGetArtistsSearch } from "./routes/get-artists-search";
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
registerGetAdminChannelsSearch(app);
registerGetAdminComedians(app);
registerGetAdminComedian(app);
registerPostAdminComedian(app);
registerPatchAdminComedian(app);
registerDeleteAdminComedian(app);
registerGetAdminAgencies(app);
registerPostAdminAgency(app);
// 事務所チャンネルの取得・更新APIを登録します。
registerGetAdminAgencyChannels(app);
registerPatchAdminAgencyChannels(app);
// 芸風の取得・追加APIを登録します。
registerGetAdminStyles(app);
registerPostAdminStyle(app);
// メディアチャンネルの取得・更新APIを登録します。
registerGetAdminMediaChannels(app);
registerPatchAdminMediaChannels(app);
// 芸人名検索APIを登録します。
registerGetArtistsSearch(app);

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
