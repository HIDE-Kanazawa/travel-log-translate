# CLAUDE.md – Travel-Log Translation Automation Project
> Guidance for Claude Code working on the **Travel-Log Smart Translation Pipeline**  
> Last update : 2025-08-05 (v0.2.0-expanded-workflow)

---

## 0. TL;DR – 5-Rule Summary
1. **外部AI生成記事を `content/articles/ready/` に配置**  
2. **Sanity CMS投稿後、手動で画像追加**  
3. **画像追加検出で自動翻訳実行（19言語）**  
4. **Vercel自動デプロイでブログ公開**  
5. **DeepL API / Sanity CMS / GitHub Actions** でスマート自動化

---

## 1. Project Overview
| Item | Spec |
|------|------|
| **Name** | 🌏 Travel-Log Smart Translation Pipeline |
| **Goal** | 外部AI生成記事 → Sanity投稿 → 画像追加待機 → 自動19言語翻訳 → Vercel多言語サイト |
| **Input** | `content/articles/ready/*.md`（外部AI生成・チェック済み） |
| **Output** | Sanity CMS多言語記事 + Vercel自動デプロイ |
| **Stack** | Node 20, TypeScript, Sanity CMS, DeepL API, GitHub Actions, Vercel |
| **Hosting** | Sanity (ヘッドレスCMS) + Vercel (ホスティング) |
| **Target Langs (19)** | en, zh-cn, zh-tw, ko, fr, de, es, it, pt, ru, ar, hi, id, ms, th, vi, tl, tr, br |

---

## 2. Directory Structure
```
travel-log-translate/
├── content/
│   └── articles/
│       ├── ready/              # 外部AI生成・チェック済み記事の配置場所
│       ├── published/          # Sanity投稿済み記事の保管
│       └── assets/             # 関連画像・メディアファイル
├── packages/
│   ├── shared/                 # 共通ライブラリ (DeepL, Sanity, types)
│   ├── translate-cli/          # CLI翻訳ツール
│   ├── worker/                 # Sanity翻訳エンジン
│   ├── webhook/                # Sanity Webhook受信サーバー
│   └── content-publisher/      # 新: 記事投稿機能
├── .github/
│   └── workflows/
│       ├── sanity-translate.yml # スマート翻訳ワークフロー
│       └── pr-check.yml        # CI/CDチェック
└── CLAUDE.md
```

---

## 3. Smart Translation Workflow

### **Phase 1: 記事準備・投稿**
1. **外部AI記事生成** (プロジェクト外)
   - ChatGPT/Claude等で日本語記事生成・チェック完了
   
2. **記事配置**
   - `content/articles/ready/[記事ファイル名].md` に完成記事を配置
   
3. **Sanity投稿**
   ```bash
   pnpm content publish content/articles/ready/[記事ファイル名].md
   ```
   - Front-matter解析してSanity CMSにドキュメント作成
   - Vercel自動デプロイでブログ公開

### **Phase 2: 画像追加・翻訳実行**
4. **画像手動追加** 
   - Sanity Studio上でスマホから画像をアップロード・追加
   
5. **スマート翻訳トリガー**
   - Sanity Webhook発火 → 条件判定実行
   - ✅ 画像あり & ✅ 日本語記事 & ✅ 未翻訳 → GitHub Actions実行
   - ❌ 条件未満 → 待機継続
   
6. **自動翻訳実行**
   - DeepL APIで19言語翻訳
   - Sanity CMSに各言語ドキュメント作成
   - 画像は日本語記事と同じものを共有
   
7. **多言語サイト公開**
   - Vercel自動デプロイで19言語ブログ公開

### **Phase 3: 管理・監視**
8. **処理状況確認**
   ```bash
   pnpm sanity-translate stats <document-id>  # 翻訳状況確認
   pnpm content status                        # 全体状況確認
   ```  

---

## 4. Commands

### **セットアップ・基本操作**
```bash
# 初期セットアップ
pnpm install                               # 依存関係インストール
pnpm build                                 # 全パッケージビルド

# 環境設定
cp .env.example .env                       # 環境変数ファイル作成
# .envにDEEPL_API_KEY、SANITY_*等を設定
```

### **記事投稿コマンド**
```bash
# 記事をSanity CMSに投稿
pnpm content publish content/articles/ready/[記事ファイル名].md

# バッチ投稿
pnpm content publish content/articles/ready/*.md

# ドライラン（実際の投稿なし）
pnpm content publish [記事ファイルパス] --dry-run

# 強制上書き（同一スラッグの記事が存在する場合）
pnpm content publish [記事ファイルパス] --force
```

### **翻訳・監視コマンド**
```bash
# Sanity記事の翻訳実行
pnpm sanity-translate translate <document-id>

# 翻訳状況確認
pnpm sanity-translate stats <document-id>

# 全体処理状況確認
pnpm content status

# Webhook サーバー起動（開発用）
pnpm --filter webhook dev
```

### **開発・デバッグ**
```bash
# CLI開発モード
pnpm --filter translate-cli dev

# 全テスト実行
pnpm test

# 型チェック・リント・フォーマット
pnpm typecheck && pnpm lint && pnpm format
```

---

## 5. Smart Translation Conditions

### **翻訳実行条件**
| 条件 | チェック項目 | 動作 |
|------|-------------|------|
| ✅ **実行** | 日本語記事 + 画像あり + 未翻訳 | GitHub Actions → 19言語翻訳 |
| ⏸️ **待機** | 日本語記事 + 画像なし + 未翻訳 | 画像追加まで待機 |
| ⏭️ **スキップ** | 日本語記事 + 画像あり + 翻訳済み | 処理スキップ |
| 🚫 **無視** | 非日本語記事 | 処理対象外 |

### **Webhook判定ロジック**
```typescript
// packages/webhook/src/server.ts
const shouldTranslate = await checkTranslationConditions({
  documentId: payload._id,
  language: payload.lang,
  hasImages: await sanityClient.checkImages(payload._id),
  translationStatus: await sanityClient.getTranslationStatus(payload._id)
});
```

---

## 6. Quality & Error Handling

| 項目 | 制限・ルール |
|------|------------|
| **API Quota** | DeepL Free 500,000 chars/month → キャッシュ & 自動リトライ |
| **Character Limit** | 1記事 ≤ 15,000文字、超過時はCI失敗 |
| **Exit Codes** | 0=OK / 10=Validation / 20=DeepL API / 30=Connection |
| **Logging** | `--json` 構造化ログ + GitHub Actions Summary |
| **Image Handling** | Sanity asset参照の自動共有、alt text翻訳対応 |
| **Cache System** | 30日間翻訳キャッシュ、重複翻訳防止 |

---

## 7. Development Roadmap

| Version | Status | Features |
|---------|--------|----------|
| **v0.1** | ✅ 完了 | 基本翻訳システム + GitHub Actions |
| **v0.2** | 🚧 開発中 | スマート条件判定 + Sanity投稿機能 |
| **v0.3** | 📋 計画中 | 画像キャプション翻訳 + SEO最適化 |
| **v1.0** | 🔮 将来 | AI品質チェック + 人間レビューUI |

---

## 8. Project Structure & Ownership

### **パッケージ責任範囲**
| Package | 責任範囲 | 主な機能 |
|---------|---------|---------|
| `shared/` | 共通ライブラリ | DeepL API, Sanity client, 型定義 |
| `webhook/` | スマートトリガー | 条件判定, GitHub Actions連携 |
| `worker/` | 翻訳エンジン | Sanity記事翻訳, 画像共有 |
| `content-publisher/` | 記事投稿 | Markdown → Sanity変換 |

### **開発チーム**
| Role | Responsibility |
|------|---------------|
| **Product Owner** | 要件定義・承認 |
| **Claude Code** | 自動翻訳システム開発 |
| **Content Creator** | 外部AI記事生成・画像追加 |

---

## 📝 Change Log

| Date | Version | Summary |
|------|---------|---------|
| 2025-08-05 | v0.2.0 | スマート翻訳パイプライン + 外部AI記事対応 |
| 2025-08-05 | v0.1.1 | 基本翻訳システム + direct commit |
