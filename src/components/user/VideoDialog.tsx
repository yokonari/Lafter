import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type VideoDialogProps = {
  video: VideoItem | null;
  onClose: () => void;
};

export function VideoDialog({ video, onClose }: VideoDialogProps) {
  if (!video) {
    return null;
  }

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialogContainer} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          className={styles.dialogClose}
        >
          閉じる
        </button>
        <div className={styles.dialogFrameWrap}>
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}`}
            className={styles.dialogIframe}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
