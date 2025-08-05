# 🤖 外部AI生成記事配置場所

このディレクトリは、外部AIサービス（ChatGPT/Claude等）で生成・チェック済みの完成記事を配置する場所です。

## 📝 使用方法

### 1. 記事の配置
外部AIで生成・チェック完了した記事を以下の形式で配置してください：

```
content/articles/ready/
├── tokyo-hidden-spots.md          # 東京の隠れスポット記事
├── kyoto-temples-guide.md         # 京都寺院ガイド  
└── osaka-food-tour.md             # 大阪グルメツアー
```

### 2. 必要なFront-matter形式
```yaml
---
title: "東京の隠れた名所5選"
excerpt: "観光ガイドには載っていない、地元の人だけが知る東京の魅力的な隠れスポットをご紹介します。"
tags:
  - 東京
  - 観光
  - 隠れスポット
  - 旅行
lang: ja
slug: tokyo-hidden-spots
date: '2024-01-15'
author: Travel Writer
---

# 記事本文開始
ここに記事本文を配置...
```

### 3. Sanity投稿コマンド
記事配置後、以下のコマンドでSanity CMSに投稿：

```bash
# 単一記事投稿
pnpm content publish content/articles/ready/tokyo-hidden-spots.md

# 複数記事一括投稿
pnpm content publish content/articles/ready/*.md

# ドライラン（確認のみ）
pnpm content publish content/articles/ready/tokyo-hidden-spots.md --dry-run
```

## 🔄 処理フロー

1. **記事配置** → このディレクトリに`.md`ファイルを配置
2. **Sanity投稿** → `pnpm content publish`でCMS投稿  
3. **画像追加** → Sanity Studio上で手動画像追加
4. **自動翻訳** → 画像検出後、19言語自動翻訳実行
5. **公開** → Vercel自動デプロイで多言語ブログ公開

## ⚠️ 注意事項

- **完成記事のみ配置**: チェック・修正済みの完成記事のみ
- **日本語のみ**: `lang: ja` 必須
- **Front-matter必須**: title, excerpt, tags, slug等の項目必須
- **文字数制限**: 15,000文字以内
- **画像パス**: 相対パスまたはSanity asset参照を使用

## 📁 関連ディレクトリ

- `content/articles/published/` - Sanity投稿済み記事の保管
- `content/articles/assets/` - 関連画像・メディアファイル