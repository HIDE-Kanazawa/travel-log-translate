# CLAUDE.md – Travel-Log Translation Automation Project
> Guidance for Claude Code working on the **Travel-Log Smart Translation Pipeline**  
> Last update : 2025-08-10 (v0.2.3-20languages-support)

---

## 0. TL;DR – 4-Rule Summary
1. **Sanity CMSに直接記事投稿**  
2. **画像追加検出で自動翻訳実行（19言語）**  
3. **Vercel自動デプロイでブログ公開**  
4. **DeepL API / Sanity CMS / GitHub Actions** でスマート自動化

---

## 1. Project Overview
| Item | Spec |
|------|------|
| **Name** | 🌏 Travel-Log Smart Translation Pipeline |
| **Goal** | Sanity投稿 → 画像追加待機 → 自動19言語翻訳 → Vercel多言語サイト |
| **Input** | Sanity CMS直接投稿（手動またはAPI経由） |
| **Output** | Sanity CMS多言語記事 + Vercel自動デプロイ |
| **Stack** | Node 20, TypeScript, Sanity CMS, DeepL API, GitHub Actions, Vercel |
| **Hosting** | Sanity (ヘッドレスCMS) + Vercel (ホスティング) |
| **Target Langs (19)** | en, es, fr, de, it, pt-br, ru, ko, zh-cn, zh-tw, ar, tr, th, nl, pl, sv, da, fi, id |

---

## 2. Directory Structure
```
travel-log-translate/
├── packages/
│   ├── shared/                 # 共通ライブラリ (DeepL, Sanity, types)
│   ├── translate-cli/          # CLI翻訳ツール
│   ├── worker/                 # Sanity翻訳エンジン
│   └── webhook/                # Sanity Webhook受信サーバー
├── .github/
│   └── workflows/
│       ├── sanity-translate.yml # スマート翻訳ワークフロー
│       └── pr-check.yml        # CI/CDチェック
└── CLAUDE.md
```

---

## 3. Smart Translation Workflow

### **Phase 1: 記事投稿**
1. **Sanity CMS投稿**
   - Sanity Studio上で直接記事作成・投稿
   - または外部API経由での記事投稿
   - Vercel自動デプロイでブログ公開

### **Phase 2: 画像追加・翻訳実行**
2. **画像手動追加** 
   - Sanity Studio上でスマホから画像をアップロード・追加
   
3. **スマート翻訳トリガー**
   - Sanity Webhook発火 → 条件判定実行
   - ✅ 画像あり & ✅ 日本語記事 & ✅ 未翻訳 → GitHub Actions実行
   - ❌ 条件未満 → 待機継続
   
4. **自動翻訳実行**
   - DeepL APIで19言語翻訳
   - Sanity CMSに各言語ドキュメント作成
   - 画像は日本語記事と同じものを共有
   
5. **多言語サイト公開**
   - Vercel自動デプロイで19言語ブログ公開

### **Phase 3: 管理・監視**
6. **処理状況確認**
   ```bash
   pnpm sanity-translate stats <document-id>  # 翻訳状況確認
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

### **記事管理コマンド**
```bash
# 記事投稿は Sanity Studio上で直接実行
# または外部API経由で投稿
```

### **翻訳・監視コマンド**
```bash
# Sanity記事の翻訳実行
pnpm sanity-translate translate <document-id>

# 翻訳状況確認
pnpm sanity-translate stats <document-id>


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

## 6. Multi-Language Article Relationship System

### **記事間関連性管理**
翻訳された多言語記事は `translationOf` フィールドで元記事との関連性を管理しています。

| 項目 | 実装詳細 |
|------|----------|
| **スキーマ設計** | `packages/shared/src/types.ts` - SanityArticleSchema |
| **参照設定** | `packages/worker/src/translation-engine.ts:331-334` |
| **関連記事取得** | GROQ: `*[_type == "article" && translationOf._ref == $originalId]` |

### **言語切り替え機能の実現**
ブログ記事詳細画面での言語切り替えボタン押下時に、同一記事の他言語版に遷移可能。

```typescript
// 翻訳記事作成時の関連性設定
translationOf: {
  _type: 'reference',
  _ref: sourceDocument._id,  // 元記事（日本語）のID
}
```

### **API実装例**
```groq
// 元記事IDから関連する全言語記事を取得
*[_type == "article" && (
  _id == $articleId || 
  translationOf._ref == $articleId ||
  _id == *[_id == $articleId][0].translationOf._ref
)]{
  _id,
  lang,
  slug,
  title
}
```

---

## 7. Quality & Error Handling

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

### **開発チーム**
| Role | Responsibility |
|------|---------------|
| **Product Owner** | 要件定義・承認 |
| **Claude Code** | 自動翻訳システム開発 |
| **Content Creator** | Sanity記事投稿・画像追加 |

---

## 9. Sanity Schema Management & Project Dependencies

### **プロジェクト構成**
旅行ブログシステムは2つのリポジトリで構成されています：

| Repository | Role | Responsibility |
|------------|------|----------------|
| **旅ログ記事生成** | Translation Pipeline | 記事翻訳・投稿自動化・コンテンツ管理 |
| **my-sanity-site** | CMS & Frontend | Sanityスキーマ管理・サイト構築・公開 |

### **Sanityスキーマ管理構造**
```
my-sanity-site/
├── schema/
│   ├── article.js       # メイン記事スキーマ（旅行ブログ特化）
│   ├── post.js         # シンプル投稿スキーマ
│   ├── affiliate.js    # アフィリエイトスキーマ
│   └── index.js        # スキーマ集約ファイル
├── sanity.config.js    # Sanity設定（Project ID: fcz6on8p）
└── site/               # Astroフロントエンド
```

### **スキーマ同期要件**
- **Sanity Project**: `fcz6on8p` (production dataset)
- **必須フィールド**: title, lang, slug, content, publishedAt, type, prefecture
- **オプションフィールド**: tags, placeName, translationOf
- **削除対象**: excerpt, featured, author
- **多言語対応**: 19翻訳言語 + 日本語（原文）= 20言語対応

### **開発フロー**
1. **my-sanity-site**: Sanityスキーマ更新・デプロイ
2. **旅ログ記事生成**: スキーマ同期・翻訳パイプライン調整
3. **テスト**: 記事投稿・翻訳・公開の一連の流れ確認

### **Current Status (2025-08-06)**
- ✅ 翻訳パイプライン側スキーマ修正完了
- 🔄 my-sanity-site側スキーマ同期待ち
- ⏳ スキーマ同期後の統合テスト予定

---

## 10. Language Support Policy (2025-08-10)

### **20言語対応方針**
ブログの「20ヶ国語対応」は以下の構成で実現：

| 言語種別 | 言語数 | 詳細 |
|----------|--------|------|
| **日本語（原文）** | 1言語 | コンテンツ制作言語 |
| **翻訳対象言語** | 19言語 | DeepL APIで自動翻訳 |
| **合計** | **20言語** | ブログアピールポイント |

### **DeepL API対応言語選定基準**
2025年8月時点で、DeepL APIは34言語をサポート。この中から以下の基準で上位19言語を選定：

1. **使用人口の多さ**（英語、中国語、スペイン語等）
2. **経済圏の重要性**（ドイツ語、フランス語、イタリア語等）
3. **旅行市場の活発度**（韓国語、アラビア語、ロシア語等）
4. **技術的安定性**（DeepL APIでのサポート品質）

### **非対応言語とその理由**
- **hi**（ヒンディー語）：DeepL未対応
- **ms**（マレー語）：DeepL未対応  
- **tl**（タガログ語）：DeepL未対応
- **vi**（ベトナム語）：DeepL未対応
- **no**（ノルウェー語）：タイ語優先のため除外（20言語枠調整）

### **最終選定言語リスト**
```typescript
// 19翻訳対象言語（タイ語含む）
'en', 'es', 'fr', 'de', 'it', 'pt-br', 'ru', 'ko', 
'zh-cn', 'zh-tw', 'ar', 'tr', 'th', 'nl', 'pl', 
'sv', 'da', 'fi', 'id'
```

---

## 📝 Change Log

| Date | Version | Summary |
|------|---------|---------|
| 2025-08-10 | v0.2.3 | 20言語対応（DeepL APIサポート言語に基づく最適化 + タイ語含む） + 翻訳エラー修正 |
| 2025-08-06 | v0.2.2 | Sanityスキーマ同期要件特定 + プロジェクト間依存関係明確化 |
| 2025-08-06 | v0.2.1 | 多言語記事関連性管理システム + 言語切り替え対応 |
| 2025-08-14 | v0.3.0 | 外部AI記事要件削除 + 簡素化されたワークフロー |
| 2025-08-05 | v0.2.0 | スマート翻訳パイプライン + 外部AI記事対応 |
| 2025-08-05 | v0.1.1 | 基本翻訳システム + direct commit |
