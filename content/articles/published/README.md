# 📚 投稿済み記事保管場所

このディレクトリは、Sanity CMSに投稿済みの記事を保管する場所です。

## 📂 ディレクトリ構造

```
content/articles/published/
├── 2024/
│   ├── 01/
│   │   ├── tokyo-hidden-spots.md      # Sanity投稿済み
│   │   └── tokyo-hidden-spots.json    # Sanity document metadata
│   └── 02/
│       └── kyoto-temples-guide.md
└── archive/                           # 古い記事のアーカイブ
```

## 🔄 自動処理

記事がSanity CMSに正常投稿されると、以下が自動実行されます：

1. **記事移動**: `ready/` → `published/YYYY/MM/`
2. **メタデータ保存**: Sanity document ID, URL等をJSON保存
3. **処理ログ**: 投稿日時・状況を記録

## 📊 保存される情報

### article-name.json（メタデータ例）
```json
{
  "sanityDocumentId": "article-123-456",
  "title": "東京の隠れた名所5選",
  "slug": "tokyo-hidden-spots",
  "lang": "ja",
  "publishedAt": "2024-01-15T10:00:00Z",
  "sanityUrl": "https://studio.sanity.io/...",
  "vercelUrl": "https://my-blog.vercel.app/articles/tokyo-hidden-spots",
  "translationStatus": {
    "pending": true,
    "completed": false,
    "languages": []
  },
  "images": {
    "hasImages": false,
    "count": 0,
    "assets": []
  }
}
```

## 🔍 確認・管理コマンド

```bash
# 投稿済み記事一覧
pnpm content list published

# 特定記事の状況確認
pnpm content status published/2024/01/tokyo-hidden-spots.md

# 翻訳状況確認
pnpm sanity-translate stats article-123-456
```

## 🗂️ アーカイブ

6ヶ月経過した記事は自動的に`archive/`に移動されます。