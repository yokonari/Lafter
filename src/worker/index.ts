// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` は build 時に生成される
import nextWorker from "../../.open-next/worker";
import cronChannelSearch from "./cron-channel-search";
import cronLatestVideosCache from "./cron-latest-videos-cache";
import cronPopularVideosCache from "./cron-most-viewed-videos-cache";
import cronLikesVideosCache from "./cron-likes-videos-cache";
import cronRandomVideosCache from "./cron-random-videos-cache";
import cronLlmClassify from "./cron-llm-classify";
import cronVideoCheck from "./cron-video-check";
import cronVideoCheckQueue from "./cron-video-check-queue";
import cronVideoRss from "./cron-video-rss";
import cronChannelCheck from "./cron-channel-check";
import cronChannelCheckQueue from "./cron-channel-check-queue";


type ScheduledEventParam = Parameters<ExportedHandlerScheduledHandler>[0];
const MINUTES_PER_DAY = 24 * 60;
// 動画存在チェックは 5 分おき相当で実行し、D1 の書き込み量を抑えつつ巡回を継続します。
const VIDEO_CHECK_RUNS_PER_DAY = 288;
const VIDEO_CHECK_QUEUE_REBUILD_MINUTE = 4 * 60;
const CHANNEL_CHECK_QUEUE_REBUILD_MINUTE = 4 * 60 + 5;  // UTC 04:05
const CHANNEL_CHECK_RUN_MINUTE = 4 * 60 + 10;  // UTC 04:10
const VIEW_COUNT_VIDEOS_CACHE_RUN_MINUTE = 4 * 60 + 20;
const LIKES_VIDEOS_CACHE_RUN_MINUTE = 4 * 60 + 30;


// OpenNext の fetch を明示的に型付けし、ビルド時の推論抜けを防ぎます。
const fetchHandler: ExportedHandlerFetchHandler = (request, env, ctx) =>
  nextWorker.fetch(request, env, ctx);

// Next.js 側の fetch を尊重しつつ、Cron Trigger を確実に処理する scheduled を丁寧に生やします。
const scheduled: ExportedHandlerScheduledHandler = async (event, env, ctx) => {
  const cron = event.cron;
  // console.log(`[worker] scheduled event triggered: ${cron}`);

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
    const runVideoCheckQueue = shouldRunVideoCheckQueueRebuildJob(event);
    const runVideoRss = shouldRunVideoRssJob(event);
    const runLatestCache = shouldRunLatestVideosCacheJob(event);
    const runRandomCache = shouldRunRandomVideosCacheJob(event);
    const runViewCountCache = shouldRunViewCountVideosCacheJob(event);
    const runLikesCache = shouldRunLikesVideosCacheJob(event);
    const runChannelCheckQueue = shouldRunChannelCheckQueueRebuildJob(event);
    const runChannelCheck = shouldRunChannelCheckJob(event);

    // 毎分トリガーのうち、エポック分が 31 の倍数の場合のみ LLM 判定を丁寧に実行します。
    if (runLlm) {
      if (typeof cronLlmClassify.scheduled === "function") {
        await cronLlmClassify.scheduled(event, env, ctx);
      }
    }
    // 動画チェックキューの再構築は 1 日 1 回だけ 04:00 UTC で動かし、重い SELECT の頻度を丁寧に抑えます。
    if (runVideoCheckQueue) {
      if (typeof cronVideoCheckQueue.scheduled === "function") {
        await cronVideoCheckQueue.scheduled(event, env, ctx);
      }
    }
    // 動画存在チェックは 1 日 288 回 (5 分間隔相当) で実行し、API クォータと更新頻度のバランスを丁寧に保ちます。
    if (runVideoCheck) {
      if (typeof cronVideoCheck.scheduled === "function") {
        await cronVideoCheck.scheduled(event, env, ctx);
      }
    }
    // RSS 同期は毎時 10 分周期で動かし、24 時間以内に各チャンネルを丁寧に巡回します。
    if (runVideoRss) {
      if (typeof cronVideoRss.scheduled === "function") {
        await cronVideoRss.scheduled(event, env, ctx);
      }
    }
    // 最新動画キャッシュ更新は 6 時間ごとの 40 分に実行し、他処理との衝突を避けつつ KV を確実に更新します。
    if (runLatestCache) {
      if (typeof cronLatestVideosCache.scheduled === "function") {
        await cronLatestVideosCache.scheduled(event, env, ctx);
      }
    }
    // ランダム動画キャッシュ更新は 6 時間ごとの 50 分に実施し、最新キャッシュとの被りを防ぎます。
    if (runRandomCache) {
      if (typeof cronRandomVideosCache.scheduled === "function") {
        await cronRandomVideosCache.scheduled(event, env, ctx);
      }
    }
    // 再生数上位動画キャッシュ更新は日次 04:20 UTC で 1 回だけ実行し、再生数上位の KV を丁寧に更新します。
    if (runViewCountCache) {
      if (typeof cronPopularVideosCache.scheduled === "function") {
        await cronPopularVideosCache.scheduled(event, env, ctx);
      }
    }
    // 高評価動画キャッシュ更新は日次 04:30 UTC で 1 回だけ実行し、高評価数上位の KV を丁寧に更新します。
    if (runLikesCache) {
      if (typeof cronLikesVideosCache.scheduled === "function") {
        await cronLikesVideosCache.scheduled(event, env, ctx);
      }
    }
    // チャンネルチェックキューの再構築は日次 04:05 UTC で実行します。
    if (runChannelCheckQueue) {
      if (typeof cronChannelCheckQueue.scheduled === "function") {
        await cronChannelCheckQueue.scheduled(event, env, ctx);
      }
    }
    // チャンネル存在チェックは日次 04:10 UTC で実行し、チャンネルの存在確認と名前同期を行います。
    if (runChannelCheck) {
      if (typeof cronChannelCheck.scheduled === "function") {
        await cronChannelCheck.scheduled(event, env, ctx);
      }
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
  // エポック分から 1 日あたりのチェック回数を均等に割り当て、5 分間隔相当で実行します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const previousMinuteOfDay = minuteOfDay === 0 ? MINUTES_PER_DAY - 1 : minuteOfDay - 1;

  const currentSlot = Math.floor((minuteOfDay * VIDEO_CHECK_RUNS_PER_DAY) / MINUTES_PER_DAY);
  const previousSlot = Math.floor((previousMinuteOfDay * VIDEO_CHECK_RUNS_PER_DAY) / MINUTES_PER_DAY);

  return currentSlot !== previousSlot;
}

function shouldRunVideoCheckQueueRebuildJob(event: ScheduledEventParam): boolean {
  // 日次バッチは UTC 04:00 (240分目) で 1 回だけ実行し、キューの並び替え負荷を丁寧に集中させます。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minuteOfDay === VIDEO_CHECK_QUEUE_REBUILD_MINUTE;
}

function shouldRunVideoRssJob(event: ScheduledEventParam): boolean {
  // RSS 取得は毎時 10 分のタイミング (=60分毎) で動かし、24時間巡回します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 60 === 10;
}

function shouldRunLatestVideosCacheJob(event: ScheduledEventParam): boolean {
  // 最新動画キャッシュは 6 時間 (=360 分) ごとの 40 分タイミングで動かし、重い処理が集中しないよう丁寧に間隔を空けます。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 360 === 40;
}

function shouldRunRandomVideosCacheJob(event: ScheduledEventParam): boolean {
  // ランダム動画キャッシュも 6 時間 (=360 分) ごとの 50 分タイミングで走らせ、最新キャッシュと 10 分ずらしで安定性を保ちます。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  return epochMinutes % 360 === 50;
}

function shouldRunViewCountVideosCacheJob(event: ScheduledEventParam): boolean {
  // 再生数上位動画キャッシュは UTC 04:20 に日次で実行し、再生数上位データを安定的に更新します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minuteOfDay === VIEW_COUNT_VIDEOS_CACHE_RUN_MINUTE;
}

function shouldRunLikesVideosCacheJob(event: ScheduledEventParam): boolean {
  // 高評価動画キャッシュは UTC 04:30 に日次で実行し、高評価数上位データを安定的に更新します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minuteOfDay === LIKES_VIDEOS_CACHE_RUN_MINUTE;
}

function shouldRunChannelCheckQueueRebuildJob(event: ScheduledEventParam): boolean {
  // チャンネルチェックキューは UTC 04:05 に日次で再構築します。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minuteOfDay === CHANNEL_CHECK_QUEUE_REBUILD_MINUTE;
}

function shouldRunChannelCheckJob(event: ScheduledEventParam): boolean {
  // チャンネル存在チェックは UTC 04:10 に日次で実行し、チャンネルの存在確認と名前同期を行います。
  const epochMinutes = Math.floor(event.scheduledTime / 60_000);
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minuteOfDay === CHANNEL_CHECK_RUN_MINUTE;
}
