import { useEffect, useState } from "react";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type VideoDialogProps = {
  video: VideoItem | null;
  onClose: () => void;
  onReport?: (video: VideoItem) => void;
};

export function VideoDialog({ video, onClose, onReport }: VideoDialogProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [video?.id]);

  if (!video) {
    return null;
  }

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialogContainer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.dialogFlag}
            aria-label="この動画を報告する"
            onClick={(event) => {
              event.stopPropagation();
              if (video) {
                onReport?.(video);
              }
            }}
          >
            <span className="material-symbols-rounded" aria-hidden>
              flag_2
            </span>
          </button>
          <button
            type="button"
            className={styles.dialogClose}
            aria-label="閉じる"
            onClick={onClose}
          >
            <span className="material-symbols-rounded" aria-hidden>
              close
            </span>
          </button>
        </div>
        {!isLoaded && (
          <div className={styles.dialogSpinnerWrap} aria-label="動画を読み込んでいます">
            <div className={styles.dialogSpinner} />
          </div>
        )}
        <div className={styles.dialogFrameWrap}>
          <iframe
            src={`https://www.youtube.com/embed/${video.id}`}
            className={styles.dialogIframe}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => setIsLoaded(true)}
          />
        </div>
      </div>
    </div>
  );
}
