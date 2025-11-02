import { Hono } from "hono";
import { handle } from "hono/vercel";
import { registerGetVideos } from "./routes/get-videos";
import { registerPostVideosSync } from "./routes/post-videos-sync";

const app = new Hono().basePath("/api");

registerGetVideos(app);
registerPostVideosSync(app);

export const GET = handle(app);
export const POST = handle(app);
