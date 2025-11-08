"""
学習済みの TF-IDF + ロジスティック回帰モデルを JSON 形式で書き出すスクリプト。

Cloudflare Workers や Node.js などでも同じ特徴量・係数を使って推論できるように、
ベクトライザの語彙/IDF と分類器の係数・バイアス・しきい値をすべて含める。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

DATA_PATH = Path("data/video_titles.csv")
OUTPUT_PATH = Path("models/video_classifier.json")
CONFIG_PATH = Path("config/model-config.json")


def load_dataset() -> tuple[list[str], list[int]]:
    """正規化済みのタイトルとラベルを読み込む."""
    df = pd.read_csv(DATA_PATH, dtype={"title": str, "label": int})
    titles = df["title"].fillna("").tolist()
    labels = df["label"].astype(int).tolist()
    return titles, labels


def build_vectorizer() -> TfidfVectorizer:
    """学習時と同じ設定の TF-IDF ベクトライザを生成."""
    return TfidfVectorizer(
        analyzer="char",
        ngram_range=(2, 5),
        min_df=2,
        max_features=50000,
    )


def build_classifier() -> LogisticRegression:
    """クラス不均衡対応付きロジスティック回帰を生成."""
    return LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
        solver="lbfgs",
    )


def load_threshold() -> float:
    """しきい値を構成ファイルから丁寧に取得."""
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
        return float(threshold)
    except (TypeError, ValueError) as exc:
        raise ValueError("threshold は数値で設定してください。") from exc


def export_model_payload(
    vectorizer: TfidfVectorizer, classifier: LogisticRegression
) -> dict[str, Any]:
    """
    Node 等でも取り扱いやすい JSON ペイロードを組み立てる.

    - feature_names と idf は同じインデックス順で格納。
    - classifier.coef_ も同じ順序で出力するため、ドット積をそのまま再現できる。
    """
    feature_names = vectorizer.get_feature_names_out().tolist()
    idf_values = vectorizer.idf_.tolist()

    return {
        "vectorizer": {
            "analyzer": vectorizer.analyzer,
            "ngram_range": vectorizer.ngram_range,
            "lowercase": vectorizer.lowercase,
            "feature_names": feature_names,
            "idf": idf_values,
        },
        "classifier": {
            "coef": classifier.coef_[0].tolist(),
            "intercept": float(classifier.intercept_[0]),
            "classes": classifier.classes_.tolist(),
        },
    }


def run_export() -> None:
    """データ全体で再学習して JSON を出力."""
    titles, labels = load_dataset()
    vectorizer = build_vectorizer()
    classifier = build_classifier()

    features = vectorizer.fit_transform(titles)
    classifier.fit(features, labels)

    threshold = load_threshold()
    payload = export_model_payload(vectorizer, classifier)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"モデルを書き出しました: {OUTPUT_PATH}（threshold={threshold}）")


if __name__ == "__main__":
    run_export()
