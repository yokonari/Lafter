import type { PlaylistItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";

type PlaylistDialogProps = {
  playlist: PlaylistItem | null;
  onClose: () => void;
  onReport?: (videoId: string, playlistTitle: string) => void;
};

export function PlaylistDialog({ playlist, onClose, onReport }: PlaylistDialogProps) {
  if (!playlist) {
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
              if (playlist?.playlistId) {
                onReport?.(playlist.playlistId, playlist.title);
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
