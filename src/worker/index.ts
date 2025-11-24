import nextWorker from "../../.open-next/worker";
import cronChannelSearch from "./cron-channel-search";
import cronLlmClassify from "./cron-llm-classify";

// OpenNext の fetch を明示的に型付けし、ビルド時の推論抜けを防ぎます。
const fetchHandler: ExportedHandlerFetchHandler = (request, env, ctx) =>
  nextWorker.fetch(request, env, ctx);

// Next.js 側の fetch を尊重しつつ、Cron Trigger を確実に処理する scheduled を丁寧に生やします。
const scheduled: ExportedHandlerScheduledHandler = async (event, env, ctx) => {
  const cron = event.cron;
  console.log(`[worker] scheduled event triggered: ${cron}`);

  // チャンネル検索: 毎時 0分 -> 0 * * * *
  // LLM 判定: 30分ごと -> */30 * * * *

  // cron 文字列で分岐します。
  if (cron === "0 * * * *") {
    if (typeof cronChannelSearch.scheduled === "function") {
      await cronChannelSearch.scheduled(event, env, ctx);
    }
  } else if (cron === "*/30 * * * *") {
    if (typeof cronLlmClassify.scheduled === "function") {
      await cronLlmClassify.scheduled(event, env, ctx);
    }
  } else {
    // マッチしない場合は念のため両方動かすか、ログを出して終了するか。
    // ここではログを出して、デフォルトで LLM 判定だけ動かすなどの安全策も考えられますが、
    // 明示的な設定以外は動かさない方が安全です。
    console.warn(`[worker] 未知の Cron スケジュールです: ${cron}`);
  }
};

const workerEntrypoint: ExportedHandler = {
  fetch: fetchHandler,
  scheduled,
};

export default workerEntrypoint;
