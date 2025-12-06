'use client';

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReportReasonKey } from "@/lib/reportReasons";
import { REPORT_REASONS } from "@/lib/reportReasons";
import type { VideoItem } from "@/lib/videoService";
import styles from "./userTheme.module.scss";
import { UserDialogBase } from "./UserDialogBase";

type ReportDialogProps = {
  open: boolean;
  video: VideoItem | null;
  onClose: () => void;
  onSuccess: () => void;
};

// 報告内容を確認し、バックエンド API へ POST して DB に丁寧に保存させるための確認ダイアログです。
export function ReportDialog({ open, video, onClose, onSuccess }: ReportDialogProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ReportReasonKey>("not_funny");

  // ダイアログを開くたびに初期値へ戻します。
  useEffect(() => {
    if (open) {
      setSelectedReason("not_funny");
      setError(null);
      setSending(false);
    }
  }, [open]);

  const selectedReasonInfo = useMemo(
    () => REPORT_REASONS.find((r) => r.key === selectedReason),
    [selectedReason],
  );
  const reasonLabel = selectedReasonInfo?.label ?? "";
  const reasonStatus = selectedReasonInfo?.status ?? 0;

  if (!open || !video) {
    return null;
  }

  const handleConfirm = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      // バックエンド API (/api/videos/report) へ POST し、報告内容を DB に確実に残します。
      if (!reasonStatus) {
        setError("報告種別が選択されていません。再度お試しください。");
        return;
      }
      const response = await fetch("/api/videos/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          report_status: reasonStatus,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data && typeof data === "object" && "message" in data && typeof (data as Record<string, unknown>).message === "string"
            ? ((data as Record<string, unknown>).message as string)
            : "報告の送信に失敗しました。時間を置いて再度お試しください。";
        setError(message);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to submit report", err);
      setError("通信中にエラーが発生しました。ネットワーク環境をご確認のうえ再度お試しください。");
    } finally {
      setSending(false);
    }
  };

  // 報告ダイアログも共通ベースへ委譲し、モーションやESC対応を丁寧に統一します。
  return (
    <UserDialogBase
      open={open}
      onClose={onClose}
      dialogClassName={styles.contactDialog}
      overlayClassName={styles.contactOverlay}
      ariaLabelledby="report-title"
      ariaDescribedby="report-desc"
      disableBodyScroll
      closeOnEsc
    >
      <div className={styles.contactHeader}>
        <div>
          <h2 id="report-title" className={styles.contactTitle}>
            報告
          </h2>
        </div>
        <button type="button" onClick={onClose} className={styles.contactClose} aria-label="ダイアログを閉じる">
          <X aria-hidden="true" className={styles.dialogIcon} size={20} />
        </button>
      </div>

      <div className={styles.reportBody}>
        <fieldset className={styles.reportRadioGroup}>
          <div className={styles.reportRadioOptions}>
            {REPORT_REASONS.map((reason) => (
              <label
                key={reason.key}
                className={`${styles.reportRadio} ${selectedReason === reason.key ? styles.reportRadioActive : ""}`}
              >
                <div className={styles.reportRadioControl}>
                  <input
                    type="radio"
                    name="report-reason"
                    value={reason.key}
                    checked={selectedReason === reason.key}
                    onChange={() => setSelectedReason(reason.key)}
                    aria-describedby="report-desc"
                  />
                  <div className={styles.reportRadioDot} aria-hidden="true" />
                </div>
                <span className={`${styles.reportRadioLabel} ${selectedReason === reason.key ? styles.reportRadioLabelActive : ""}`}>
                  {reason.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.reportSummary}>
          <p id="report-desc" className={styles.reportText}>
            この動画を「<span className={styles.reportHighlight}>{reasonLabel}</span>」として報告してよろしいですか？
          </p>
          <div className={styles.reportDetails}>
            <div>
              <span className={styles.reportLabel}>動画名</span>
              <span className={styles.reportValue}>{video.title}</span>
            </div>
            {video.channelName && (
              <div>
                <span className={styles.reportLabel}>チャンネル名</span>
                <span className={styles.reportValue}>{video.channelName}</span>
              </div>
            )}
          </div>
        </div>

        {error && <p className={styles.contactError}>{error}</p>}
      </div>

      <div className={styles.contactActions}>
        <button type="button" onClick={onClose} className={styles.contactCancel}>
          閉じる
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={sending}
          className={styles.contactSubmit}
        >
          {sending ? (
            <>
              <Loader2 size={16} className={styles.reportSubmitSpinner} aria-hidden="true" />
              送信中…
            </>
          ) : (
            "送信"
          )}
        </button>
      </div>
    </UserDialogBase>
  );
}
