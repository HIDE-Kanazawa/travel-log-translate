# 🖼️ 記事関連アセット保管場所

このディレクトリは、記事に関連する画像・メディアファイルを保管する場所です。

## 📁 ディレクトリ構造

```
content/articles/assets/
├── images/
│   ├── tokyo-hidden-spots/
│   │   ├── shibuya-crossing.jpg
│   │   ├── senso-ji-temple.jpg
│   │   └── thumbnail.jpg
│   └── kyoto-temples/
│       ├── kiyomizu-dera.jpg
│       └── fushimi-inari.jpg
├── videos/
│   └── travel-guides/
└── documents/
    └── travel-itineraries/
```

## 🎯 使用方法

### 1. 画像の配置
記事別にディレクトリを作成し、関連画像を整理：

```bash
# 記事用ディレクトリ作成
mkdir -p content/articles/assets/images/tokyo-hidden-spots

# 画像ファイル配置
cp ~/Downloads/shibuya-photo.jpg content/articles/assets/images/tokyo-hidden-spots/shibuya-crossing.jpg
```

### 2. Markdownでの参照
```markdown
# 東京の隠れた名所5選

![渋谷スクランブル交差点](../assets/images/tokyo-hidden-spots/shibuya-crossing.jpg)

渋谷スクランブル交差点は...
```

### 3. Sanity CMSでの画像アップロード
- **推奨**: Sanity Studio上で直接画像アップロード
- **理由**: 自動最適化・CDN配信・多言語共有が容易

## 🔄 画像処理フロー

### **方法A: Sanity Studio直接アップロード（推奨）**
1. 記事をSanity投稿
2. Sanity Studio上で画像を直接アップロード・追加
3. 自動翻訳実行時に全言語で画像共有

### **方法B: ローカルアセット使用**
1. `content/articles/assets/images/` に画像配置
2. Markdownで相対パス参照
3. Sanity投稿時に画像パスを解析・アップロード

## 📊 サポートファイル形式

### 画像
- **JPEG** (.jpg, .jpeg) - 写真・風景
- **PNG** (.png) - スクリーンショット・透過画像
- **WebP** (.webp) - 高圧縮画像（推奨）

### 動画
- **MP4** (.mp4) - 汎用動画形式
- **WebM** (.webm) - Web最適化動画

### ドキュメント
- **PDF** (.pdf) - 旅行ガイド・地図
- **DOCX** (.docx) - 文書ファイル

## ⚡ 最適化・CDN

Sanity CMSにアップロードされた画像は自動的に：

- **画像最適化**: 自動リサイズ・圧縮
- **CDN配信**: 世界中で高速配信
- **レスポンシブ**: デバイス別最適化
- **多言語共有**: 翻訳記事で同じ画像使用

## 🚨 注意事項

- **著作権**: 適切な権利を持つ画像のみ使用
- **ファイルサイズ**: 1画像あたり5MB以下推奨
- **ファイル名**: 英数字・ハイフンのみ使用
- **Alt text**: アクセシビリティのため画像説明必須