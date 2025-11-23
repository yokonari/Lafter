// OpenNext ビルド時に .open-next/worker が生成され、フェッチ処理を委譲します。
import nextWorker from "../../.open-next/worker";
import cronWorker from "./cron-channel-search";

// OpenNext の fetch を明示的に型付けし、ビルド時の推論抜けを防ぎます。
const fetchHandler: ExportedHandlerFetchHandler = (request, env, ctx) =>
  nextWorker.fetch(request, env, ctx);

// Next.js 側の fetch を尊重しつつ、Cron Trigger を確実に処理する scheduled を丁寧に生やします。
const scheduled: ExportedHandlerScheduledHandler = async (event, env, ctx) => {
  if (typeof cronWorker.scheduled === "function") {
    // 既存の Cron ロジックに丁寧に委譲します。
    return cronWorker.scheduled(event, env, ctx);
  }
  console.error("[cron] scheduled ハンドラが見つかりません。");
};

const workerEntrypoint: ExportedHandler = {
  fetch: fetchHandler,
  scheduled,
};

export default workerEntrypoint;
