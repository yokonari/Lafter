import type { PlaylistItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type PlaylistDialogProps = {
  playlist: PlaylistItem | null;
  onClose: () => void;
};

export function PlaylistDialog({ playlist, onClose }: PlaylistDialogProps) {
  if (!playlist) {
    return null;
  }

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialogContainer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogFrameWrap}>
          <iframe
            src={`https://www.youtube.com/embed/videoseries?list=${playlist.playlistId}`}
            className={styles.dialogIframe}
            title={playlist.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
