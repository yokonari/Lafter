"""
動画タイトルのデータを読み込んで Stratified 5-fold で学習・評価を行い、
正例（ネタ動画）中心の指標を集計するスクリプト。
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedKFold

DATA_PATH = Path("data/video_titles.csv")
KFOLD_SPLITS = 5
CONFIG_PATH = Path("config/model-config.json")
KEYWORDS_CONFIG_PATH = Path("config/video-keywords.json")


def load_dataset() -> tuple[list[str], list[int]]:
    """正規化済みCSVからタイトルとラベルを取得."""
    df = pd.read_csv(DATA_PATH, dtype={"title": str, "label": int})
    titles = df["title"].fillna("").tolist()
    labels = df["label"].astype(int).tolist()
    return titles, labels


def build_vectorizer() -> TfidfVectorizer:
    """日本語に分かち書き不要な文字n-gram TF-IDFベクトライザを生成."""
    return TfidfVectorizer(
        analyzer="char",
        ngram_range=(2, 5),
        min_df=2,
        max_features=50000,
    )


def build_classifier() -> LogisticRegression:
    """クラス不均衡を考慮したロジスティック回帰器を生成."""
    return LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
        solver="lbfgs",
    )


def load_threshold() -> float:
    """構成ファイルからしきい値を丁寧に取得."""
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"モデル設定ファイルが見つかりません: {CONFIG_PATH}"
        ) from exc
    threshold = config.get("threshold")
    if threshold is None:
        raise ValueError("model-config.json に threshold が設定されていません。")
    try:
        value = float(threshold)
    except (TypeError, ValueError) as exc:
        raise ValueError("threshold は数値で設定してください。") from exc
    if not (0.0 < value < 1.0):
        raise ValueError("threshold は 0~1 の間で設定してください。")
    return value


def load_keyword_rules() -> dict:
    """ポジティブ/ネガティブなキーワード設定を丁寧に取得."""
    config = json.loads(KEYWORDS_CONFIG_PATH.read_text(encoding="utf-8"))
    return {
        "positives": [w.lower() for w in config.get("positiveKeywords", []) if isinstance(w, str)],
        "negatives": [w.lower() for w in config.get("negativeKeywords", []) if isinstance(w, str)],
        "positive_bonus": float(config.get("positiveKeywordBonus", 0.0)),
        "negative_penalty": float(config.get("negativeKeywordPenalty", 0.0)),
    }


def evaluate_fold(
    x_train: list[str],
    y_train: list[int],
    x_valid: list[str],
    y_valid: list[int],
    threshold: float,
    keyword_rules: dict,
) -> dict[str, float]:
    """単一Foldで学習→推論し、必要な指標を返す."""
    vectorizer = build_vectorizer()
    clf = build_classifier()

    x_train_vec = vectorizer.fit_transform(x_train)
    x_valid_vec = vectorizer.transform(x_valid)

    clf.fit(x_train_vec, y_train)
    decision_scores = clf.decision_function(x_valid_vec)
    adjustments = np.array(
        [keyword_adjustment(text, keyword_rules) for text in x_valid]
    )
    adjusted_scores = decision_scores + adjustments
    y_prob = 1 / (1 + np.exp(-adjusted_scores))
    y_pred = (y_prob >= threshold).astype(int)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_valid, y_pred, average="binary", pos_label=1, zero_division=0
    )
    pr_auc = average_precision_score(y_valid, y_prob)
    cm = confusion_matrix(y_valid, y_pred)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "pr_auc": pr_auc,
        "tp": cm[1, 1],
        "fn": cm[1, 0],
        "fp": cm[0, 1],
        "tn": cm[0, 0],
    }


def run_cross_validation() -> None:
    """Stratified 5-fold で学習・評価し、Fold別と平均の指標を表示."""
    titles, labels = load_dataset()
    skf = StratifiedKFold(n_splits=KFOLD_SPLITS, shuffle=True, random_state=42)

    threshold = load_threshold()
    keyword_rules = load_keyword_rules()
    print(f"使用するしきい値: {threshold}")

    fold_results: list[dict[str, float]] = []
    for fold_idx, (train_idx, valid_idx) in enumerate(skf.split(titles, labels), start=1):
        x_train = [titles[i] for i in train_idx]
        y_train = [labels[i] for i in train_idx]
        x_valid = [titles[i] for i in valid_idx]
        y_valid = [labels[i] for i in valid_idx]

        metrics = evaluate_fold(
            x_train, y_train, x_valid, y_valid, threshold, keyword_rules
        )
        fold_results.append(metrics)

        print(f"=== Fold {fold_idx} / {KFOLD_SPLITS} ===")
        print(
            f"Precision: {metrics['precision']:.4f} | "
            f"Recall: {metrics['recall']:.4f} | "
            f"F1: {metrics['f1']:.4f} | "
            f"PR-AUC: {metrics['pr_auc']:.4f}"
        )
        print(
            f"Confusion Matrix [TN, FP; FN, TP] = "
            f"[{metrics['tn']}, {metrics['fp']}; {metrics['fn']}, {metrics['tp']}]"
        )

    avg_metrics = {
        key: float(np.mean([fold[key] for fold in fold_results])) for key in fold_results[0]
    }

    print("=== Average over folds ===")
    print(
        f"Precision: {avg_metrics['precision']:.4f} | "
        f"Recall: {avg_metrics['recall']:.4f} | "
        f"F1: {avg_metrics['f1']:.4f} | "
        f"PR-AUC: {avg_metrics['pr_auc']:.4f}"
    )
    print(
        f"Confusion Matrix平均 [TN, FP; FN, TP] = "
        f"[{avg_metrics['tn']:.1f}, {avg_metrics['fp']:.1f}; "
        f"{avg_metrics['fn']:.1f}, {avg_metrics['tp']:.1f}]"
    )


def keyword_adjustment(text: str, rules: dict) -> float:
    """タイトル内のキーワードを基にスコアを加減算."""
    normalized = text.lower()
    adjustment = 0.0
    has_positive = any(word and word in normalized for word in rules["positives"])
    has_negative = any(word and word in normalized for word in rules["negatives"])
    if has_positive and not has_negative:
        adjustment += rules["positive_bonus"]
    if has_negative:
        adjustment -= rules["negative_penalty"]
    return adjustment


if __name__ == "__main__":
    run_cross_validation()
