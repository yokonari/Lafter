"use client";

import { useState } from "react";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import type { ComedianRow } from "../ComedianAdminSection";
import styles from "../../adminTheme.module.scss";

type ComedianDeleteDialogProps = {
  comedian: ComedianRow;
  onSuccess: () => void;
  onClose: () => void;
};

export function ComedianDeleteDialog({
  comedian,
  onSuccess,
  onClose,
}: ComedianDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/comedian/${comedian.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "削除に失敗しました。";
        throw new Error(message);
      }

      toast.success(`${comedian.name}を削除しました。`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました。");
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>芸人を削除</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.dialogCloseButton}
            aria-label="閉じる"
          >
            <X size={24} />
          </button>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.dialogText}>
            <strong>{comedian.name}</strong>を削除してもよろしいですか？
          </p>
          <p className={styles.dialogWarning}>
            この操作は取り消せません。関連するチャンネル情報や芸風情報も削除されます。
          </p>
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isDeleting}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={styles.dangerButton}
            disabled={isDeleting}
          >
            {isDeleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}
