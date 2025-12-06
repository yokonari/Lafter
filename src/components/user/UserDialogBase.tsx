'use client';

import { motion, type AnimationDefinition } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { dialogContainerVariants, dialogOverlayVariants, dialogTransition } from "./dialogMotionVariants";

type UserDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName: string;
  dialogClassName: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  role?: "dialog" | "alertdialog";
  disableBodyScroll?: boolean;
  closeOnEsc?: boolean;
};

// 各ダイアログに共通する描画制御やモーション、ESCキー対応を丁寧にまとめた土台コンポーネントです。
export function UserDialogBase({
  open,
  onClose,
  children,
  overlayClassName,
  dialogClassName,
  ariaLabelledby,
  ariaDescribedby,
  role = "dialog",
  disableBodyScroll = false,
  closeOnEsc = false,
}: UserDialogBaseProps) {
  // 閉じアニメーション完了まではDOMを保持して、滑らかな遷移を丁寧に担保します。
  const [isRendered, setIsRendered] = useState(open);

  useEffect(() => {
    if (open) {
      setIsRendered(true);
    }
  }, [open]);

  useEffect(() => {
    if (!closeOnEsc || !open) {
      return;
    }
    // ESCキーで閉じられるよう監視し、キーボード操作にも丁寧に対応します。
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closeOnEsc, onClose, open]);

  useEffect(() => {
    if (!disableBodyScroll || !open) {
      return;
    }
    // モーダル表示中は背面スクロールを抑止し、意図せぬ画面移動を丁寧に防ぎます。
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [disableBodyScroll, open]);

  const handleAnimationComplete = (definition: AnimationDefinition) => {
    if (definition === "hidden" && !open) {
      setIsRendered(false);
    }
  };

  if (!isRendered) {
    return null;
  }

  return (
    <motion.div
      className={overlayClassName}
      role="presentation"
      onClick={onClose}
      variants={dialogOverlayVariants}
      initial="hidden"
      animate={open ? "visible" : "hidden"}
      transition={dialogTransition}
    >
      <motion.div
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        className={dialogClassName}
        onClick={(event) => event.stopPropagation()}
        variants={dialogContainerVariants}
        initial="hidden"
        animate={open ? "visible" : "hidden"}
        transition={dialogTransition}
        onAnimationComplete={handleAnimationComplete}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
