import { Hono } from "hono";
import { handle } from "hono/vercel";
import { registerGetVideos } from "./routes/get-videos";
import { registerPostVideosSync } from "./routes/post-videos-sync";
import { registerGetAdminVideos } from "./routes/get-admin-videos";
import { registerPostAdminVideoBulk } from "./routes/post-admin-video-bulk";
import { registerGetAdminPlaylists } from "./routes/get-admin-playlists";
import { registerPostAdminPlaylistBulk } from "./routes/post-admin-playlist-bulk";

const app = new Hono().basePath("/api");

registerGetVideos(app);
registerPostVideosSync(app);
registerGetAdminVideos(app);
registerPostAdminVideoBulk(app);
registerGetAdminPlaylists(app);
registerPostAdminPlaylistBulk(app);

export const GET = handle(app);
export const POST = handle(app);
