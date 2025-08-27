# 🌏 Travel-Log Auto-Translate

Sanity CMS と DeepL API を組み合わせた自動翻訳パイプライン。日本語記事を19言語に自動翻訳し、GitHub Actions を通じて管理します。

## 🚀 特徴

- **19言語対応**: DeepL APIを使用して英語、中国語、韓国語、ヨーロッパ言語など19言語に翻訳
- **Sanity CMS連携**: Sanity webhookでリアルタイム翻訳トリガー
- **GitHub Actions統合**: repository_dispatch経由で自動翻訳を実行
- **キャッシュ機能**: 同じコンテンツの再翻訳を回避してAPI使用量を節約
- **Portable Text対応**: Sanityの構造化コンテンツを完全サポート
- **HMAC署名検証**: Webhook セキュリティを保証

## 📋 対応言語

`en`, `zh-cn`, `zh-tw`, `ko`, `fr`, `de`, `es`, `it`, `pt`, `ru`, `ar`, `hi`, `id`, `ms`, `th`, `vi`, `tl`, `tr`, `br`

## 🛠 セットアップ

### 前提条件

- Node.js 18以上
- pnpm 8以上
- DeepL API キー (Free tier対応: 500,000文字/月)
- Sanity CMS プロジェクト
- GitHub Personal Access Token

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/HIDE-Kanazawa/travel-log-translate.git
cd travel-log-translate

# 依存関係をインストール
pnpm install

# 全パッケージをビルド
pnpm build
```

### 環境変数設定

```bash
# .env ファイルを作成
cp .env.example .env

# 必要な環境変数を設定
DEEPL_API_KEY=your_deepl_api_key_here
SANITY_PROJECT_ID=your_sanity_project_id
SANITY_DATASET=production
SANITY_API_TOKEN=your_sanity_api_token
SANITY_API_VERSION=2024-01-01
SANITY_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=HIDE-Kanazawa
GITHUB_REPO=travel-log-translate
```

### GitHub Secrets 設定

リポジトリ Settings → Secrets and variables → Actions に以下を追加:

```
DEEPL_API_KEY=****
SANITY_PROJECT_ID=****
SANITY_DATASET=****
SANITY_API_TOKEN=****
SANITY_WEBHOOK_SECRET=****
GH_PAT=<Personal Access Token>
```

## 🖥 使用方法

### Worker CLI (ローカル翻訳)

```bash
# Sanity記事を直接翻訳
pnpm --filter worker start translate <document-id>

# ドライラン（実際の作成なし）
pnpm --filter worker start translate <document-id> --dry-run

# 強制再翻訳（既存翻訳を上書き）
pnpm --filter worker start translate <document-id> --force

# 特定言語のみ翻訳
pnpm --filter worker start translate <document-id> --languages en,fr,de

# 使用統計確認
pnpm --filter worker start stats

# キャッシュクリア
pnpm --filter worker start clear-cache
```

### Webhook サーバー (自動翻訳)

```bash
# Webhook サーバー起動
pnpm --filter webhook start

# 開発モード
pnpm --filter webhook dev

# 手動トリガー (curl例)
curl -X POST http://localhost:3000/trigger/article-123 \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Article", "dryRun": false}'
```

### 開発モード

```bash
# 開発モードで実行
pnpm dev content/drafts/sample-article.md --target en
```

## 📁 ディレクトリ構造

```
travel-log-translate/
├── packages/
│   ├── shared/                 # 共通ライブラリ
│   │   ├── src/
│   │   │   ├── deepl-client.ts      # DeepL API クライアント
│   │   │   ├── sanity-client.ts     # Sanity CMS クライアント
│   │   │   ├── portable-text.ts     # Portable Text 処理
│   │   │   └── types.ts             # 型定義
│   │   └── tests/                   # ユニットテスト (80%+ カバレッジ)
│   ├── worker/                 # 翻訳エンジン
│   │   ├── src/
│   │   │   ├── translation-engine.ts # 翻訳ロジック
│   │   │   └── index.ts             # CLI エントリポイント
│   │   └── tests/                   # エンドツーエンドテスト
│   └── webhook/                # Webhook サーバー
│       ├── src/
│       │   └── server.ts            # Express サーバー + HMAC 検証
│       └── tests/                   # HMAC テスト
├── .github/
│   └── workflows/
│       ├── sanity-translate.yml     # メイン翻訳ワークフロー
│       └── pr-check.yml             # PRチェック (Node 18/20)
└── .deepl-cache/
    └── translations.json            # DeepL キャッシュ
```

## 🤖 GitHub Actions

### 自動翻訳ワークフロー (`sanity-translate.yml`)

Sanity Webhook または手動トリガーで日本語記事を19言語に翻訳します。

**トリガー:**
- `repository_dispatch` (Sanity webhook経由)
- `workflow_dispatch` (手動実行)

**処理の流れ:**
1. Sanity から日本語記事を取得
2. DeepL API で19言語に翻訳
3. Sanity に翻訳記事を保存
4. 翻訳結果をSlackに通知 (オプション)

### PRチェックワークフロー (`pr-check.yml`)

PRに対してテスト・型チェック・フォーマットを実行。

**マトリックステスト:** Node.js 18, 20

### Staging テスト手順

1. **GitHub Actions 手動実行**
   ```
   Actions → "Sanity Article Translation" → "Run workflow"
   document_id: <your-test-article-id>
   dry_run: false
   ```

2. **結果確認**
   - Actions ログで翻訳成功を確認
   - Sanity Studio で19言語の翻訳記事が生成されることを確認

## 📝 Markdownファイル形式

### 入力ファイル（日本語）

```markdown
---
title: 東京の隠れた名所5選
excerpt: 観光ガイドには載っていない、地元の人だけが知る東京の隠れた魅力的な場所をご紹介します。
tags:
  - 東京
  - 観光
  - 隠れスポット
lang: ja
slug: tokyo-hidden-gems
date: '2024-01-15'
author: Travel Writer
---

# 東京の隠れた名所5選

東京は世界でも有数の観光都市ですが...
```

### 出力ファイル（英語翻訳例）

```markdown
---
title: Top 5 Hidden Gems in Tokyo
excerpt: Discover the hidden charming places in Tokyo that are not listed in tourist guides, known only to locals.
tags:
  - tokyo
  - tourism
  - hidden-spots
lang: en
slug: tokyo-hidden-gems-en
date: '2024-01-15'
author: Travel Writer
---

# Top 5 Hidden Gems in Tokyo

Tokyo is one of the world's leading tourist cities, but...
```

## 🧪 テスト

```bash
# 全テスト実行
pnpm test

# カバレッジ付きテスト
pnpm test:coverage

# テスト監視モード
pnpm test --watch
```

## 🔍 リント・フォーマット

```bash
# ESLint チェック
pnpm lint

# Prettier フォーマット
pnpm format

# TypeScript 型チェック
pnpm typecheck
```

## ⚡ パフォーマンスと制限

- **DeepL Free tier**: 月間500,000文字まで
- **ファイル制限**: 1記事15,000文字まで（超過時はCI失敗）
- **キャッシュ**: 30日間の翻訳結果を保存
- **バッチ処理**: 複数テキストを一度にAPI呼び出しして効率化

## 🛠 開発

### アーキテクチャ

- **CLI**: Commander.jsベースのコマンドラインインターフェース
- **翻訳サービス**: DeepL Node.js SDKを使用
- **キャッシュ**: JSON形式でローカルファイルにキャッシュ
- **ファイル処理**: gray-matterでFront-Matter解析
- **テスト**: Vitestでユニットテスト、80%カバレッジ目標

### コントリビューション

1. フォークしてブランチを作成
2. 変更を実装
3. テストを追加・実行
4. ESLint/Prettierでコード整形
5. プルリクエストを作成

## 📊 ロードマップ

- [x] **v0.1**: JA→EN基本翻訳 + GitHub Actions
- [x] **v0.2**: 20言語対応 + キャッシュシステム
- [ ] **v0.3**: Sanity Webhook連携
- [ ] **v1.0**: 人間レビューUI

## 📄 ライセンス

MIT License

## 🤝 サポート

問題や質問がある場合は、GitHubのIssuesで報告してください。

---

🤖 Generated with DeepL API | 🛠 Built with TypeScript + pnpm