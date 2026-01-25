'use client';

import { ArrowLeft } from "lucide-react";
import styles from "./userTheme.module.scss";

type BackToTopLinkProps = {
  onClick: () => void;
};

export function BackToTopLink({ onClick }: BackToTopLinkProps) {
  return (
    <button type="button" className={styles.searchBackLink} onClick={onClick}>
      {/* 一覧の戻り導線を共通化し、表記とアイコンを統一します。 */}
      <ArrowLeft aria-hidden="true" size={16} />
      <span>トップへ戻る</span>
    </button>
  );
}
