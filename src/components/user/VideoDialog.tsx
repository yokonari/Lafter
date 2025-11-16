import { useEffect, useState } from "react";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type VideoDialogProps = {
  video: VideoItem | null;
  onClose: () => void;
};

export function VideoDialog({ video, onClose }: VideoDialogProps) {
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
