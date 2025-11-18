import Image from "next/image";
import { motion } from "motion/react";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type VideoCardProps = {
  video: VideoItem;
  onSelect: (video: VideoItem) => void;
  onChannelSelect: (channelId: string, channelName: string) => void;
  onReportSelect: (video: VideoItem) => void;
};

export function VideoCard({ video, onSelect, onChannelSelect, onReportSelect }: VideoCardProps) {

  // サンプルと同じホバー挙動（scale + y offset）を motion で実装
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -4 }}
      transition={{ duration: 0.2 }}
      // ダークトーンに馴染むカードにホバー時の浮遊感を丁寧に加えています。
      className={styles.videoCard}
      onClick={() => onSelect(video)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(video);
        }
      }}
    >
      <div className={styles.thumbnail}>
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className={styles.thumbnailImage}
        />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            {video.title}
          </h3>
          <div className={styles.cardMenuWrap}>
            <button
              type="button"
            className={styles.cardMenuButton}
            aria-label="この動画を報告する"
            onClick={(event) => {
              event.stopPropagation();
              onReportSelect(video);
            }}
          >
            <span
              className="material-symbols-rounded"
              aria-hidden
              style={{ fontSize: "20px", lineHeight: 1, color: "#94a3b8" }}
            >
              flag_2
            </span>
          </button>
          </div>
        </div>
        {video.channelName && (
          // チャンネル名から同名検索を素早く行えるようリンク化します。
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (video.channelId) {
                onChannelSelect(video.channelId, video.channelName || "");
              }
            }}
            className={styles.cardChannel}
            >
            {video.channelName}
          </button>
        )}
      </div>
    </motion.div>
  );
}
