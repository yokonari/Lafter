// 報告に利用する選択肢（3項目）を共通化して管理します。
export type ReportReasonKey = "not_funny" | "not_official_video" | "cannot_play";

export const REPORT_REASONS: Array<{ key: ReportReasonKey; label: string }> = [
  { key: "not_funny", label: "ネタ動画ではない" },
  { key: "not_official_video", label: "公式動画ではない" },
  // 動画自体が再生できない問い合わせにも丁寧に対応するための選択肢です。
  { key: "cannot_play", label: "再生できない" },
];
