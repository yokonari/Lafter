ユーザー画面の配色方針
- Material Design dark high contrast の値をベースにします。
- 主要色:
  - 背景/サーフェス: `--md-sys-color-background` / `--md-sys-color-surface-container` 相当
  - 文字色: `--md-sys-color-on-surface`（純白系）
  - リンク・ボーダー: `--md-sys-color-on-surface-variant`（ハイコントラストでは白系）
  - アクセント: `--md-sys-color-primary-container` を基準に黄金色系
  - 見出しは太字禁止（font-weight 400 程度）

適用箇所
- `src/components/user/userTheme.module.scss` 冒頭のカラーパレットにすべて反映済み。
- 検索結果タイトルや問い合わせダイアログなどの見出しも太字は使用しません。
