import keywordConfig from "../../config/video-keywords.json";

// 動画タイトルのルール判定で使うキーワードや加減点設定を丁寧に共有します。
export const POSITIVE_KEYWORDS = keywordConfig.positiveKeywords;
export const NEGATIVE_KEYWORDS = keywordConfig.negativeKeywords;
export const POSITIVE_KEYWORD_BONUS = keywordConfig.positiveKeywordBonus;
export const NEGATIVE_KEYWORD_PENALTY = keywordConfig.negativeKeywordPenalty;
