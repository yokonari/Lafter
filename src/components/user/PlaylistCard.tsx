import Image from "next/image";
import { motion } from "motion/react";
import type { PlaylistItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type PlaylistCardProps = {
  playlist: PlaylistItem;
  onSelect: (playlist: PlaylistItem) => void;
};

export function PlaylistCard({ playlist, onSelect }: PlaylistCardProps) {
  // プレイリストを動画カードと同等の挙動で示し、バッジで明示します。
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -4 }}
      transition={{ duration: 0.2 }}
      className={styles.videoCard}
      onClick={() => onSelect(playlist)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(playlist);
        }
      }}
    >
      <div className={styles.thumbnail}>
        {playlist.thumbnail ? (
          <Image
            src={playlist.thumbnail}
            alt={playlist.title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className={styles.thumbnailImage}
          />
        ) : (
          <div className={styles.thumbnailPlaceholder} aria-hidden />
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.playlistBadge}>プレイリスト</div>
        <h3 className={styles.cardTitle}>{playlist.title}</h3>
      </div>
    </motion.div>
  );
}
