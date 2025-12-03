// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` は build 時に生成される
import nextWorker from "../../.open-next/worker";
import cronChannelSearch from "./cron-channel-search";
import cronLatestVideosCache from "./cron-latest-videos-cache";
import cronRandomVideosCache from "./cron-random-videos-cache";
import cronLlmClassify from "./cron-llm-classify";
import cronVideoCheck from "./cron-video-check";
import cronVideoRss from "./cron-video-rss";

type ScheduledEventParam = Parameters<ExportedHandlerScheduledHandler>[0];
const MINUTES_PER_DAY = 24 * 60;
const VIDEO_CHECK_RUNS_PER_DAY = 400;

// OpenNext の fetch を明示的に型付けし、ビルド時の推論抜けを防ぎます。
const fetchHandler: ExportedHandlerFetchHandler = (request, env, ctx) =>
  nextWorker.fetch(request, env, ctx);

// Next.js 側の fetch を尊重しつつ、Cron Trigger を確実に処理する scheduled を丁寧に生やします。
const scheduled: ExportedHandlerScheduledHandler = async (event, env, ctx) => {
  const cron = event.cron;
  console.log(`[worker] scheduled event triggered: ${cron}`);

  // チャンネル検索: 毎時 0分 -> 0 * * * *
  // LLM 判定: 31分間隔 (Cron 自体は毎分起動し、エポック分単位で 31 の倍数だけ実行)
  //   ※ 0分トリガーとの衝突頻度を丁寧に下げるため、Worker 内で 31 分周期を算出します。

  // cron 文字列で分岐します。
  if (cron === "0 * * * *") {
    if (typeof cronChannelSearch.scheduled === "function") {
      await cronChannelSearch.scheduled(event, env, ctx);
    }
  } else if (cron === "* * * * *") {
    const runLlm = shouldRunLlmJob(event);
    const runVideoCheck = shouldRunVideoCheckJob(event);
    const runVideoRss = shouldRunVideoRssJob(event);
    const runLatestCache = shouldRunLatestVideosCacheJob(event);
    const runRandomCache = shouldRunRandomVideosCacheJob(event);
    // 毎分トリガーのうち、エポック分が 31 の倍数の場合のみ LLM 判定を丁寧に実行します。
    if (runLlm) {
      if (typeof cronLlmClassify.scheduled === "function") {
        await cronLlmClassify.scheduled(event, env, ctx);
      }
    } else {
      console.log("[worker] LLM 判定は 31 分周期外のためスキップしました。");
    }
    // 動画存在チェックは 1 日 400 回 (約3〜4分間隔) で実行し、API クォータと更新頻度のバランスを丁寧に保ちます。
    if (runVideoCheck) {
      if (typeof cronVideoCheck.scheduled === "function") {
        await cronVideoCheck.scheduled(event, env, ctx);
      }
    } else {
      console.log("[worker] 動画存在チェックは 1 日 400 回ペースの周期外のためスキップしました。");
    }
    // RSS 同期は毎時 10 分周期で動かし、24 時間以内に各チャンネルを丁寧に巡回します。
    if (runVideoRss) {
      if (typeof cronVideoRss.scheduled === "function") {
        await cronVideoRss.scheduled(event, env, ctx);
      }
    } else {
      console.log("[worker] RSS 同期は 60 分周期外のためスキップしました。");
    }
    // 最新動画キャッシュ更新は毎時 40 分 (=60 分周期) に実行し、他処理との衝突を避けつつ KV を確実に更新します。
    if (runLatestCache) {
      if (typeof cronLatestVideosCache.scheduled === "function") {
        await cronLatestVideosCache.scheduled(event, env, ctx);
      }
    } else {
      console.log("[worker] 最新動画キャッシュ更新は 60 分周期外のためスキップしました。");
    }
    // ランダム動画キャッシュ更新は毎時 50 分 (=60 分周期) に実施し、最新キャッシュとの被りを防ぎます。
    if (runRandomCache) {
      if (typeof cronRandomVideosCache.scheduled === "function") {
        await cronRandomVideosCache.scheduled(event, env, ctx);
      }
    } else {
      console.log("[worker] ランダム動画キャッシュ更新は 60 分周期外のためスキップしました。");
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

function shouldRunLlmJob(event: ScheduledEventParam): boolean {
  // Cloudflare から渡される scheduledTime(ms) を丁寧に分単位へ変換し、エポック基準で 31 の倍数かを判定します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 31 === 0;
}

function shouldRunVideoCheckJob(event: ScheduledEventParam): boolean {
  // エポック分から 1 日あたりのチェック回数を均等に割り当て、約 3〜4 分間隔で実行します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const previousMinuteOfDay = minuteOfDay === 0 ? MINUTES_PER_DAY - 1 : minuteOfDay - 1;

  const currentSlot = Math.floor((minuteOfDay * VIDEO_CHECK_RUNS_PER_DAY) / MINUTES_PER_DAY);
  const previousSlot = Math.floor((previousMinuteOfDay * VIDEO_CHECK_RUNS_PER_DAY) / MINUTES_PER_DAY);

  return currentSlot !== previousSlot;
}

function shouldRunVideoRssJob(event: ScheduledEventParam): boolean {
  // RSS 取得は毎時 10 分のタイミング (=60分毎) で動かし、1 日 540 チャンネルを確実に巡回します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 60 === 10;
}

function shouldRunLatestVideosCacheJob(event: ScheduledEventParam): boolean {
  // 最新動画キャッシュは毎時 40 分タイミングで動かし、RSS 同期などと時間帯が重ならないよう丁寧に調整します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 60 === 40;
}

function shouldRunRandomVideosCacheJob(event: ScheduledEventParam): boolean {
  // ランダム動画キャッシュは毎時 50 分タイミングで動かし、最新キャッシュと分単位をずらして安定性を高めます。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 60 === 50;
}
