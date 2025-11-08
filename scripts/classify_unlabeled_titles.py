from __future__ import annotations

"""
未判定タイトル（data/video_titles_unlabeled.csv）をモデルで推論し、
確率やラベルを含むCSVを丁寧に書き出す補助スクリプト。
"""

import csv
import json
import math
import pathlib
import re
import unicodedata

DATA_PATH = pathlib.Path("data/video_titles_unlabeled.csv")
MODEL_PATH = pathlib.Path("models/video_classifier.json")
CONFIG_PATH = pathlib.Path("config/model-config.json")
KEYWORDS_CONFIG_PATH = pathlib.Path("config/video-keywords.json")
OUTPUT_PATH = pathlib.Path("data/video_titles_predictions.csv")
OUTPUT_POSITIVE = pathlib.Path("data/video_titles_predictions_positive.csv")
OUTPUT_NEGATIVE = pathlib.Path("data/video_titles_predictions_negative.csv")

# build_video_titles.py と同じ正規表現を共有
EMOJI_PATTERN = re.compile(
    r"[\U0001F1E0-\U0001F1FF\U0001F300-\U0001FAFF\U00002600-\U000027BF]+"
)
REPEATED_SYMBOL_PATTERN = re.compile(r"([!?！？w〜〜・…、。\-―_+=♡♥★☆♪！？])\1+")
HASHTAG_PATTERN = re.compile(r"#\S+")
BRACKET_TAG_PATTERN = re.compile(r"\[[^\]]+\]")
EPISODE_PATTERN = re.compile(r"(?:vol\.?\s*\d+|no\.?\s*\d+|#\s*\d+)")
TRIM_CHARS = str.maketrans("", "", "【】<>")


def load_model() -> dict:
    """エクスポート済みのモデルJSONを読み込み."""
    payload = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    vectorizer = payload["vectorizer"]
    classifier = payload["classifier"]
    feature_lookup = {
        feature: {"idf": vectorizer["idf"][idx], "coef": classifier["coef"][idx]}
        for idx, feature in enumerate(vectorizer["feature_names"])
    }
    return {
        "feature_lookup": feature_lookup,
        "intercept": float(classifier["intercept"]),
        "ngram_min": int(vectorizer["ngram_range"][0]),
        "ngram_max": int(vectorizer["ngram_range"][1]),
    }


def load_threshold() -> float:
    """推論に使うしきい値を設定ファイルから取得."""
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    threshold = config.get("threshold")
    if threshold is None:
        raise ValueError("model-config.json に threshold が設定されていません。")
    value = float(threshold)
    if not (0.0 < value < 1.0):
        raise ValueError("threshold は 0~1 の間で設定してください。")
    return value


def load_keyword_rules() -> dict:
    """キーワードルールを設定ファイルから丁寧に読み込み."""
    config = json.loads(KEYWORDS_CONFIG_PATH.read_text(encoding="utf-8"))
    return {
        "positives": [w.lower() for w in config.get("positiveKeywords", []) if isinstance(w, str)],
        "negatives": [w.lower() for w in config.get("negativeKeywords", []) if isinstance(w, str)],
        "positive_bonus": float(config.get("positiveKeywordBonus", 0.0)),
        "negative_penalty": float(config.get("negativeKeywordPenalty", 0.0)),
    }


def normalize_title(text: str) -> str:
    """Python 側でも丁寧に正規化して揺れを抑制."""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.lower()
    normalized = HASHTAG_PATTERN.sub(" ", normalized)
    normalized = EPISODE_PATTERN.sub(" ", normalized)
    normalized = BRACKET_TAG_PATTERN.sub(" ", normalized)
    normalized = normalized.translate(TRIM_CHARS)
    normalized = EMOJI_PATTERN.sub(" ", normalized)
    normalized = REPEATED_SYMBOL_PATTERN.sub(r"\1", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def compute_tfidf(
    text: str, n_min: int, n_max: int, feature_lookup: dict[str, dict[str, float]]
) -> dict[str, float]:
    """文字 n-gram のTF-IDFを算出（L2正規化まで丁寧に実施）."""
    counts: dict[str, float] = {}
    if not text:
        return counts
    for n in range(n_min, n_max + 1):
        for idx in range(0, len(text) - n + 1):
            gram = text[idx : idx + n]
            if gram not in feature_lookup:
                continue
            counts[gram] = counts.get(gram, 0.0) + 1.0

    norm_sq = 0.0
    for gram, count in counts.items():
        idf = feature_lookup[gram]["idf"]
        value = count * idf
        counts[gram] = value
        norm_sq += value * value

    if norm_sq == 0.0:
        return counts
    norm = math.sqrt(norm_sq)
    for gram in list(counts.keys()):
        counts[gram] /= norm
    return counts


def compute_score(
    features: dict[str, float],
    feature_lookup: dict[str, dict[str, float]],
    intercept: float,
) -> float:
    """ロジスティック回帰の線形結合を算出."""
    score = intercept
    for gram, value in features.items():
        coef = feature_lookup[gram]["coef"]
        score += coef * value
    return score


def apply_keyword_adjustment(text: str, rules: dict) -> float:
    """キーワードに応じてスコアへ丁寧に加減点."""
    lower = text.lower()
    adjustment = 0.0
    has_positive = any(word and word in lower for word in rules["positives"])
    has_negative = any(word and word in lower for word in rules["negatives"])
    if has_positive and not has_negative:
        adjustment += rules["positive_bonus"]
    if has_negative:
        adjustment -= rules["negative_penalty"]
    return adjustment


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def load_titles() -> list[str]:
    """CSVから未判定タイトルを安全に読み込み."""
    with DATA_PATH.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if "title" not in reader.fieldnames:
            raise ValueError("CSVに title 列が存在しません。")
        return [row["title"] or "" for row in reader]


def write_predictions(
    rows: list[dict[str, str]],
    positives: list[dict[str, str]],
    negatives: list[dict[str, str]],
) -> None:
    """推論結果と、ラベルごとのCSVを丁寧に書き出し."""
    fieldnames = ["title", "normalized_title", "probability", "label"]

    # 全件
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # label=1
    with OUTPUT_POSITIVE.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(positives)

    # label=0
    with OUTPUT_NEGATIVE.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(negatives)


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"未判定タイトルのCSVが見つかりません: {DATA_PATH}"
        )
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"モデルJSONが見つかりません: {MODEL_PATH}")

    titles = load_titles()
    model = load_model()
    threshold = load_threshold()
    keyword_rules = load_keyword_rules()
    feature_lookup = model["feature_lookup"]

    results: list[dict[str, str]] = []
    positives: list[dict[str, str]] = []
    negatives: list[dict[str, str]] = []
    label_counts = {"0": 0, "1": 0}
    for title in titles:
        normalized = normalize_title(title)
        tfidf = compute_tfidf(
            normalized,
            model["ngram_min"],
            model["ngram_max"],
            feature_lookup,
        )
        base_score = compute_score(tfidf, feature_lookup, model["intercept"])
        adjustment = apply_keyword_adjustment(normalized, keyword_rules)
        probability = sigmoid(base_score + adjustment)
        label = "1" if probability >= threshold else "0"
        label_counts[label] += 1
        row = {
            "title": title,
            "normalized_title": normalized,
            "probability": f"{probability:.6f}",
            "label": label,
        }
        results.append(row)
        (positives if label == "1" else negatives).append(row)

    write_predictions(results, positives, negatives)
    print(f"{len(results)}件の推論結果を書き出しました:")
    print(f"  全件 : {OUTPUT_PATH}")
    print(f"  label=1: {label_counts['1']}件 -> {OUTPUT_POSITIVE}")
    print(f"  label=0: {label_counts['0']}件 -> {OUTPUT_NEGATIVE}")
    print(f"(threshold={threshold})")


if __name__ == "__main__":
    main()
