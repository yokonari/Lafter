#!/bin/bash

# dataディレクトリが存在しない場合は作成
mkdir -p data

echo "Fetching status=2 videos from D1..."
npx wrangler d1 execute lafter-db --remote --json --command "SELECT v.title FROM videos v JOIN channels c ON v.channel_id = c.id WHERE v.status = 2 AND c.status = 1" > data/status2_videos.json

echo "Done. Saved to data/status2_videos.json"
