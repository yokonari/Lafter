// 報告に利用する選択肢（2項目）を共通化して管理します。
export type ReportReasonKey = "not_funny" | "not_official_video";

export const REPORT_REASONS: Array<{ key: ReportReasonKey; label: string }> = [
  { key: "not_funny", label: "ネタ動画ではない" },
  { key: "not_official_video", label: "公式動画ではない" },
];
