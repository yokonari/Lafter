import type { Variants } from "motion/react";

// ダイアログ系のオーバーレイで共有するvariantsを丁寧に定義し、型の一貫性を保ちます。
export const dialogOverlayVariants = {
  visible: { opacity: 1, pointerEvents: "auto" as const },
  hidden: { opacity: 0, pointerEvents: "none" as const },
} satisfies Variants;

// コンテナの拡大縮小・位置制御も共通化して、アニメーションを丁寧に統一します。
export const dialogContainerVariants = {
  visible: { opacity: 1, scale: 1, y: 0 },
  hidden: { opacity: 0, scale: 0.95, y: 10 },
} satisfies Variants;

// ダイアログのトランジション速度も共通化し、体感を丁寧に揃えます。
export const dialogTransition = { duration: 0.2 } as const;
