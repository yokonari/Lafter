import { motion, type AnimationDefinition } from "motion/react";
import { Flag, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";
import {
  dialogOverlayVariants,
  dialogContainerVariants,
  dialogTransition,
} from "./dialogMotionVariants";

type VideoDialogProps = {
  video: VideoItem | null;
  onClose: () => void;
  onReport?: (video: VideoItem) => void;
};

export function VideoDialog({ video, onClose, onReport }: VideoDialogProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  // 閉じアニメーション完了までは描画を保つため、丁寧に表示状態を保持します。
  const [isRendered, setIsRendered] = useState(Boolean(video));
  // 閉じ途中も内容を安定して表示するため、現在の動画情報を丁寧にキャッシュします。
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(video);

  useEffect(() => {
    setIsLoaded(false);
  }, [activeVideo?.id]);

  useEffect(() => {
    if (video) {
      // 新しい動画を開くたびに即時描画し、モーションの開始を丁寧に揃えます。
      setIsRendered(true);
      setActiveVideo(video);
    }
  }, [video]);

  const handleDialogAnimationComplete = (definition: AnimationDefinition) => {
    // 閉じモーション終了後にDOMから取り除き、無駄な再描画を丁寧に避けます。
    if (definition === "hidden" && !video) {
      setIsRendered(false);
      setActiveVideo(null);
    }
  };

  if (!isRendered) {
    return null;
  }

  return (
    <motion.div
      className={styles.dialogOverlay}
      onClick={onClose}
      // 共通オーバーレイvariantsを利用して、見た目と挙動を丁寧に統一します。
      variants={dialogOverlayVariants}
      initial="hidden"
      animate={video ? "visible" : "hidden"}
      // トランジションも共通値を用いて、速度感を丁寧に合わせます。
      transition={dialogTransition}
    >
      <motion.div
        className={styles.dialogContainer}
        onClick={(event) => event.stopPropagation()}
        // コンテナアニメーションも共通化して、ダイアログ全体の一貫性を丁寧に維持します。
        variants={dialogContainerVariants}
        initial="hidden"
        animate={video ? "visible" : "hidden"}
        transition={dialogTransition}
        onAnimationComplete={handleDialogAnimationComplete}
      >
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.dialogFlag}
            aria-label="この動画を報告する"
            onClick={(event) => {
              event.stopPropagation();
              if (activeVideo) {
                onReport?.(activeVideo);
              }
            }}
          >
            <Flag aria-hidden="true" className={styles.dialogIcon} size={20} />
          </button>
          <button
            type="button"
            className={styles.dialogClose}
            aria-label="閉じる"
            onClick={onClose}
          >
            <X aria-hidden="true" className={styles.dialogIcon} size={20} />
          </button>
        </div>
        {!isLoaded && (
          <div className={styles.dialogSpinnerWrap} aria-label="動画を読み込んでいます">
            {/* <div className={styles.dialogSpinner} /> */}
          </div>
        )}
        <div className={styles.dialogFrameWrap}>
          <iframe
            src={`https://www.youtube.com/embed/${activeVideo?.id ?? ""}`}
            className={styles.dialogIframe}
            title={activeVideo?.title ?? ""}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => setIsLoaded(true)}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
