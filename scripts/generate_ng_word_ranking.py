import json
import csv
import re
import unicodedata
import pathlib
from collections import Counter
from janome.tokenizer import Tokenizer

INPUT_PATH = pathlib.Path("data/status2_videos.json")
OUTPUT_PATH = pathlib.Path("data/ng_word_ranking.csv")

# 正規化用パターン
EMOJI_PATTERN = re.compile(
    r"[\U0001F1E0-\U0001F1FF\U0001F300-\U0001FAFF\U00002600-\U000027BF]+"
)
BRACKET_TAG_PATTERN = re.compile(r"\[[^\]]+\]")
# 【】などはJanomeがうまく切ってくれることもあるが、ノイズになりやすいので削除
TRIM_CHARS = str.maketrans("", "", "【】<>[]「」『』()（）")

def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.lower()
    normalized = normalized.translate(TRIM_CHARS)
    normalized = EMOJI_PATTERN.sub(" ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized

def main():
    if not INPUT_PATH.exists():
        print(f"Error: {INPUT_PATH} not found.")
        return

    print(f"Reading {INPUT_PATH}...")
    try:
        data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        return

    titles = []
    # Wrangler D1 JSON parsing
    if isinstance(data, list) and len(data) > 0 and "results" in data[0]:
        rows = data[0]["results"]
        titles = [r.get("title", "") for r in rows]
    elif isinstance(data, dict) and "results" in data:
         rows = data["results"]
         titles = [r.get("title", "") for r in rows]
    else:
        titles = [r.get("title", "") for r in data if isinstance(r, dict)]

    print(f"Loaded {len(titles)} titles.")

    print("Initializing Janome Tokenizer...")
    t = Tokenizer()
    counter = Counter()

    print("Processing titles...")
    for original_title in titles:
        if not original_title:
            continue
        
        normalized = normalize_text(original_title)
        
        # 形態素解析
        for token in t.tokenize(normalized):
            part_of_speech = token.part_of_speech.split(',')
            surface = token.surface
            
            # 名詞のみ抽出 (一般、固有名詞、サ変接続など)
            # 代名詞や非自立は除外してもいいが、一旦広めに拾って後で長さフィルタ
            if part_of_speech[0] == '名詞':
                # ノイズ除去フィルタ
                if part_of_speech[1] == '数': continue # 数値だけは除外
                if surface.isdigit(): continue
                if len(surface) <= 1: continue # 1文字は除外
                
                counter[surface] += 1

    # 上位抽出
    top_items = counter.most_common(200)

    print(f"Writing top {len(top_items)} items to {OUTPUT_PATH}...")
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["term", "count", "part_of_speech"])
        
        for term, count in top_items:
            writer.writerow([term, count, "noun"])

    print("Done.")

if __name__ == "__main__":
    main()
