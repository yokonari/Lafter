import modelPayload from "../../models/video_classifier.json";
import modelConfig from "../../config/model-config.json";
import {
  POSITIVE_KEYWORDS,
  NEGATIVE_KEYWORDS,
  POSITIVE_KEYWORD_BONUS,
  NEGATIVE_KEYWORD_PENALTY,
} from "@/lib/video-keywords";

type ExportedModel = {
  vectorizer: {
    analyzer: "char";
    ngram_range: [number, number];
    lowercase: boolean;
    feature_names: string[];
    idf: number[];
  };
  classifier: {
    coef: number[];
    intercept: number;
    classes: number[];
  };
};

// Python 側でエクスポートしたモデル定義を丁寧に解釈します。
const MODEL: ExportedModel = modelPayload as ExportedModel;

const FEATURE_LOOKUP = (() => {
  // TF-IDF の特徴語と係数を高速に引けるよう、マップにしておきます。
  const map = new Map<string, { idf: number; coef: number }>();
  for (let i = 0; i < MODEL.vectorizer.feature_names.length; i += 1) {
    const feature = MODEL.vectorizer.feature_names[i];
    const idf = MODEL.vectorizer.idf[i];
    const coef = MODEL.classifier.coef[i];
    map.set(feature, { idf, coef });
  }
  return map;
})();

// ロジスティック回帰のバイアス・しきい値・n-gram 範囲を共有で保持します。
const INTERCEPT = MODEL.classifier.intercept;
const MIN_N = MODEL.vectorizer.ngram_range[0];
const MAX_N = MODEL.vectorizer.ngram_range[1];
const parsedThreshold = Number(modelConfig.threshold);
if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0 || parsedThreshold >= 1) {
  throw new Error("config/model-config.json の threshold は 0~1 の数値で設定してください。");
}
const CLASSIFIER_THRESHOLD = parsedThreshold;

const EMOJI_PATTERN =
  /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu;
const REPEATED_SYMBOL_PATTERN =
  /([!?！？w〜・…、。\-―_+=♡♥★☆♪！？])\1+/g;
const HASHTAG_PATTERN = /#\S+/g;
const BRACKET_TAG_PATTERN = /\[[^\]]+\]/g;
const EPISODE_PATTERN = /(?:vol\.?\s*\d+|no\.?\s*\d+|#\s*\d+)/gi;
const TRIM_CHARS_PATTERN = /[【】<>]/g;

export type ClassificationResult = {
  title: string;
  normalizedTitle: string;
  probability: number;
  label: 0 | 1;
  score: number;
};

export { CLASSIFIER_THRESHOLD };

const POSITIVE_KEYWORDS_LOWER = POSITIVE_KEYWORDS.map((word) => word.toLowerCase());
const NEGATIVE_KEYWORDS_LOWER = NEGATIVE_KEYWORDS.map((word) => word.toLowerCase());

export function classifyTitle(rawTitle: string): ClassificationResult {
  // 入力タイトルを正規化し、TF-IDF→ロジスティック回帰で推論します。
  const normalized = normalizeTitle(rawTitle ?? "");
  const featureValues = computeTfidf(normalized);
  const baseScore = computeScore(featureValues);
  const keywordAdjustment = computeKeywordAdjustment(normalized);
  const adjustedScore = baseScore + keywordAdjustment;
  const probability = sigmoid(adjustedScore);
  const label: 0 | 1 = probability >= CLASSIFIER_THRESHOLD ? 1 : 0;
  return {
    title: rawTitle,
    normalizedTitle: normalized,
    probability,
    label,
    score: adjustedScore,
  };
}

function normalizeTitle(title: string): string {
  // Python 側と同じ正規化手順を丁寧に再現します。
  let text = title.normalize("NFKC").toLowerCase();
  text = text.replace(HASHTAG_PATTERN, " ");
  text = text.replace(EPISODE_PATTERN, " ");
  text = text.replace(BRACKET_TAG_PATTERN, " ");
  text = text.replace(TRIM_CHARS_PATTERN, "");
  text = text.replace(EMOJI_PATTERN, " ");
  text = text.replace(REPEATED_SYMBOL_PATTERN, "$1");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

type FeatureValues = Map<string, number>;

function computeTfidf(text: string): FeatureValues {
  // 文字 n-gram を丁寧に抽出し、TF-IDF を L2 正規化します。
  const tfidf = new Map<string, number>();
  if (!text) {
    return tfidf;
  }
  for (let n = MIN_N; n <= MAX_N; n += 1) {
    for (let i = 0; i <= text.length - n; i += 1) {
      const gram = text.slice(i, i + n);
      if (!FEATURE_LOOKUP.has(gram)) {
        continue;
      }
      tfidf.set(gram, (tfidf.get(gram) ?? 0) + 1);
    }
  }

  let normSquared = 0;
  for (const [gram, count] of tfidf) {
    const feature = FEATURE_LOOKUP.get(gram);
    if (!feature) continue;
    const value = count * feature.idf;
    tfidf.set(gram, value);
    normSquared += value * value;
  }
  const norm = Math.sqrt(normSquared);
  if (norm === 0) {
    return tfidf;
  }
  for (const [gram, value] of tfidf) {
    tfidf.set(gram, value / norm);
  }
  return tfidf;
}

function computeScore(featureValues: FeatureValues): number {
  // 係数とのドット積を算出し、後段でしきい値やキーワード調整を適用します。
  let score = INTERCEPT;
  for (const [gram, value] of featureValues) {
    const feature = FEATURE_LOOKUP.get(gram);
    if (!feature) continue;
    score += feature.coef * value;
  }
  return score;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function computeKeywordAdjustment(normalized: string): number {
  // ポジティブ/ネガティブな手掛かりを丁寧に加減算する。
  const lower = normalized.toLowerCase();
  let adjustment = 0;
  const hasPositive = POSITIVE_KEYWORDS_LOWER.some(
    (word) => word && lower.includes(word),
  );
  const hasNegative = NEGATIVE_KEYWORDS_LOWER.some(
    (word) => word && lower.includes(word),
  );
  if (hasPositive && !hasNegative) {
    adjustment += POSITIVE_KEYWORD_BONUS;
  }
  if (hasNegative) {
    adjustment -= NEGATIVE_KEYWORD_PENALTY;
  }
  return adjustment;
}
