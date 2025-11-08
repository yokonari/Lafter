from __future__ import annotations

"""
動画タイトルのラベル付きCSVを作成する補助スクリプト。
"""

import csv
import json
import pathlib
import re
import unicodedata
from typing import Iterable


# 入力ファイルと出力ファイルのパスを定義
DATA_DIR = pathlib.Path("data")
STATUS_TRUE = DATA_DIR / "status1_videos.txt"
STATUS_FALSE = DATA_DIR / "status2_videos.txt"
STATUS_PENDING = DATA_DIR / "status0_videos.txt"
OUTPUT_CSV = DATA_DIR / "video_titles.csv"
UNLABELED_CSV = DATA_DIR / "video_titles_unlabeled.csv"
# ラベルは true=1 / false=0 の整数文字列で出力する
LABEL_TRUE = "1"
LABEL_FALSE = "0"
# Levenshtein距離が閾値以下のタイトルは重複扱いにする
DEDUP_DISTANCE_THRESHOLD = 2


# 正規化処理で利用する正規表現を先に用意
EMOJI_PATTERN = re.compile(
    r"[\U0001F1E0-\U0001F1FF\U0001F300-\U0001FAFF\U00002600-\U000027BF]+"
)
# `!?`, `w`, `〜` など同一記号が連続して並ぶケースを一つだけに圧縮
REPEATED_SYMBOL_PATTERN = re.compile(r"([!?！？w〜〜・…、。\-―_+=♡♥★☆♪！？])\1+")
# ハッシュタグを削除（#から次の空白までまとめて落とす）
HASHTAG_PATTERN = re.compile(r"#\S+")
# 角括弧に囲まれた注釈（例: [公式]）を削除
BRACKET_TAG_PATTERN = re.compile(r"\[[^\]]+\]")
# 動画番号・エピソード番号を削除（vol.3 / vol3 / #12 / no.5 などを想定）
EPISODE_PATTERN = re.compile(r"(?:vol\.?\s*\d+|no\.?\s*\d+|#\s*\d+)")

# 除去したい括弧類をまとめて定義
TRIM_CHARS = str.maketrans("", "", "【】<>")


def load_titles(
    path: pathlib.Path,
    label: str | None,
    *,
    keep_raw_title: bool = False,
) -> list[dict[str, str]]:
    """D1レスポンス風テキストからタイトルを抽出し、必要であればラベルも付与."""
    text = path.read_text()
    start = text.find("[")
    if start == -1:
        raise ValueError(f"JSON配列が見つかりません: {path}")
    data = json.loads(text[start:])
    titles: list[dict[str, str]] = []
    for block in data:
        for item in block.get("results", []):
            title = item.get("title")
            if not title:
                continue
            normalized = normalize_title(title)
            entry: dict[str, str] = {
                "title": title if keep_raw_title and label is None else normalized,
                "normalized_title": normalized,
            }
            if label is not None:
                entry["label"] = label
            titles.append(entry)
    return titles


def normalize_title(text: str) -> str:
    """与えられたタイトル文字列を指示に沿って正規化."""
    # 全角→半角、互換文字も統一
    normalized = unicodedata.normalize("NFKC", text)
    # 英数字は小文字化して比較を安定させる
    normalized = normalized.lower()
    # ハッシュタグや動画番号を削除
    normalized = HASHTAG_PATTERN.sub(" ", normalized)
    normalized = EPISODE_PATTERN.sub(" ", normalized)
    normalized = BRACKET_TAG_PATTERN.sub(" ", normalized)
    # 指定の括弧を除去
    normalized = normalized.translate(TRIM_CHARS)
    # 絵文字をスペースに置き換えてから連続記号を圧縮
    normalized = EMOJI_PATTERN.sub(" ", normalized)
    normalized = REPEATED_SYMBOL_PATTERN.sub(r"\1", normalized)
    # 余分な空白を削除して整形
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def write_csv(rows: Iterable[dict[str, str]], path: pathlib.Path) -> None:
    """タイトルとラベルをCSVに書き出す."""
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["title", "label"])
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "title": row["title"],
                    "label": row["label"],
                }
            )


def write_unlabeled_csv(rows: Iterable[dict[str, str]], path: pathlib.Path) -> None:
    """未判定タイトルのみのCSVを丁寧に書き出す."""
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["title", "normalized_title"])
        for row in rows:
            writer.writerow([row["title"], row["normalized_title"]])


def levenshtein_distance(a: str, b: str) -> int:
    """タイトル同士のLevenshtein距離を動的計画法で算出."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            insert_cost = current[j - 1] + 1
            delete_cost = prev_row[j] + 1
            replace_cost = prev_row[j - 1] + (ca != cb)
            current.append(min(insert_cost, delete_cost, replace_cost))
        prev_row = current
    return prev_row[-1]


def deduplicate_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """
    重複・ほぼ重複タイトルを除去して先勝ちにする.

    - 完全一致はもちろん、Levenshtein距離が極小なもの（既存タイトルとの差が2以下）
      も同一判定として後続エントリを落とす。
    """
    unique: list[dict[str, str]] = []
    for row in rows:
        title = row.get("normalized_title") or row["title"]
        if any(
            levenshtein_distance(title, kept.get("normalized_title") or kept["title"])
            <= DEDUP_DISTANCE_THRESHOLD
            for kept in unique
        ):
            continue
        unique.append(row)
    return unique


def main() -> None:
    """真偽データと未判定データを読み込み、正規化したCSVを生成."""
    true_rows = load_titles(STATUS_TRUE, LABEL_TRUE)
    false_rows = load_titles(STATUS_FALSE, LABEL_FALSE)
    rows = deduplicate_rows(true_rows + false_rows)
    write_csv(rows, OUTPUT_CSV)
    print(f"{len(rows)}件を書き出しました（ヘッダー除く）: {OUTPUT_CSV}")

    if STATUS_PENDING.exists():
        pending_rows = deduplicate_rows(
            load_titles(STATUS_PENDING, label=None, keep_raw_title=True)
        )
        write_unlabeled_csv(pending_rows, UNLABELED_CSV)
        print(f"{len(pending_rows)}件の未判定タイトルを書き出しました: {UNLABELED_CSV}")
    else:
        print(f"{STATUS_PENDING} が存在しないため、未判定タイトルの出力はスキップしました。")


if __name__ == "__main__":
    main()
