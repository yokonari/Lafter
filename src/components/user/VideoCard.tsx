import Image from "next/image";
import { motion } from "motion/react";
import { useState } from "react";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type VideoCardProps = {
  video: VideoItem;
  onSelect: (video: VideoItem) => void;
  onChannelSelect: (channelId: string) => void;
  displayStat?: "views" | "likes"; // 表示する統計情報を指定
};

// 数値を日本語形式でフォーマットする関数
function formatNumber(num: number): string {
  if (num >= 100000000) {
    // 1億以上は小数点なしで整数表示
    return `${Math.round(num / 100000000)}億`;
  }
  if (num >= 100000) {
    // 10万以上は小数点なしで整数表示
    return `${Math.round(num / 10000)}万`;
  }
  if (num >= 10000) {
    // 1万以上10万未満は小数点1桁表示
    return `${(num / 10000).toFixed(1)}万`;
  }
  return num.toLocaleString("ja-JP");
}

export function VideoCard({ video, onSelect, onChannelSelect, displayStat }: VideoCardProps) {
  // タイトル・サムネイル両方のホバーで同じモーションを発火させるためのフラグです。
  const [isHoverActive, setIsHoverActive] = useState(false);

  // 表示する統計情報を取得
  let statValue: number | undefined;
  let statLabel: string | undefined;
  if (displayStat === "views" && video.viewCount !== undefined) {
    statValue = video.viewCount;
    statLabel = "回";
  } else if (displayStat === "likes" && video.likeCount !== undefined) {
    statValue = video.likeCount;
    statLabel = "件";
  }

  return (
    <motion.div
      // カード自体は静止させつつ、サムネイルのみを動かすためモーションは付与しません。
      className={styles.videoCard}
      onMouseLeave={() => setIsHoverActive(false)}
    >
      <motion.div
        className={styles.thumbnail}
        // サムネイルだけを持ち上げる動きに絞り、他要素のレイアウトを安定させます。
        animate={isHoverActive ? { scale: 1.05, y: -4 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={() => setIsHoverActive(true)}
        onMouseLeave={() => setIsHoverActive(false)}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          // サムネイルのみで動画モーダルを開くよう限定します。
          event.stopPropagation();
          onSelect(video);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(video);
          }
        }}
      >
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className={styles.thumbnailImage}
        />
      </motion.div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3
            className={`${styles.cardTitle} ${isHoverActive ? styles.cardTitleActive : ""}`}
            // タイトルにフォーカスしたときだけ強調色にするため、チャンネル名ホバーでは反応しないようにします。
            onMouseEnter={() => setIsHoverActive(true)}
            onMouseLeave={() => setIsHoverActive(false)}
            // タイトルタップでもモーダルを開けるようにし、カード全体タップでは開かないように限定します。
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(video);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(video);
              }
            }}
          >
            {video.title}
          </h3>
        </div>
        {video.channelName && (
          // チャンネル名から同名検索を素早く行えるようリンク化します。
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (video.channelId) {
                onChannelSelect(video.channelId);
              }
            }}
            className={styles.cardChannel}
          >
            {video.channelName}
          </button>
        )}
        {/* 統計情報を表示 */}
        {statValue !== undefined && statLabel && (
          <div className={styles.cardStat}>
            {formatNumber(statValue)} {statLabel}
          </div>
        )}
      </div>
    </motion.div>
  );
}
