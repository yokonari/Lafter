// 報告に利用する選択肢（3項目）を共通化して管理します。
export type ReportReasonKey = "not_funny" | "not_official_video" | "cannot_play";

export type ReportReason = { key: ReportReasonKey; label: string; status: number };

export const REPORT_REASONS: ReportReason[] = [
  { key: "not_funny", label: "ネタ動画ではない", status: 1 },
  { key: "not_official_video", label: "公式動画ではない", status: 2 },
  // 動画自体が再生できない問い合わせにも丁寧に対応するための選択肢です。
  { key: "cannot_play", label: "再生できない", status: 3 },
];
