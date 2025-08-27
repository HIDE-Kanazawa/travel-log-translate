# 🚀 GitHub セットアップガイド

## 1. GitHubリポジトリ作成

1. **GitHub.com でリポジトリ作成:**
   - https://github.com/new にアクセス
   - Repository name: `travel-log-translate`
   - Visibility: Public (IDE統合しやすい)
   - README, .gitignore, license は追加しない（既にローカルにあるため）

2. **リポジトリ作成後、以下のコマンドでPush:**
   ```bash
   cd /Users/yamazaki/旅ログ記事生成
   git push -u origin main
   git push origin v0.1.0
   ```

## 2. GitHub Secrets 設定

Repository Settings → Secrets and variables → Actions → "New repository secret" で以下を追加:

```bash
# 必須のSecrets
DEEPL_API_KEY=****
SANITY_PROJECT_ID=****
SANITY_DATASET=****
SANITY_API_TOKEN=****
SANITY_WEBHOOK_SECRET=****
GH_PAT=<Personal Access Token>
```

### Personal Access Token 作成:
1. https://github.com/settings/personal-access-tokens/new
2. Expiration: 90 days (または任意)
3. Repository access: Selected repositories → `travel-log-translate`
4. Permissions:
   - Repository permissions:
     - **Actions**: Read and write
     - **Contents**: Read and write
     - **Metadata**: Read
     - **Pull requests**: Read and write

## 3. 初回テスト

### GitHub Actions 確認:
1. **Repository → Actions タブ**
   - 🟢 Build が成功することを確認
   - ワークフロー「Sanity Article Translation」が利用可能

### 手動テスト実行:
1. **Actions → "Sanity Article Translation" → "Run workflow"**
   ```
   document_id: <your-test-sanity-document-id>
   dry_run: true
   force_retranslate: false
   ```

2. **期待する結果:**
   - ✅ Actions ログで翻訳成功
   - ✅ ドライランなので実際のSanity更新はなし
   - ✅ DeepL API 使用量が表示される

## 4. Webhook設定 (オプション)

### Sanity Studio での設定:
1. **Sanity Studio → Settings → API → Webhooks**
2. **Create webhook:**
   ```
   Name: Translation Trigger
   URL: https://your-webhook-server.com/webhook/sanity
   Dataset: production
   Filter: _type == "article" && lang == "ja"
   Secret: <SANITY_WEBHOOK_SECRET と同じ値>
   ```

### Webhook サーバーデプロイ:
- Railway, Vercel, または任意のクラウドプラットフォーム
- 環境変数を設定
- `pnpm --filter webhook start` でサーバー起動

## 5. 完了確認

✅ **必須チェックリスト:**
- [ ] GitHub リポジトリが作成され、コードがプッシュされている
- [ ] GitHub Secrets が全て設定されている
- [ ] GitHub Actions が緑（成功）になっている
- [ ] 手動ワークフロー実行でテスト翻訳が成功する
- [ ] README.md の手順でローカル開発環境がセットアップできる

✅ **オプション:**
- [ ] Webhook サーバーがデプロイされている
- [ ] Sanity Webhook が設定されている
- [ ] 本番環境での翻訳テストが成功している

## 6. トラブルシューティング

### よくある問題:

1. **DeepL API エラー**
   - API キーが正しく設定されているか確認
   - 月間使用量制限を確認

2. **GitHub Actions 失敗**
   - Secrets が正しく設定されているか確認
   - Node.js バージョンが 18 以上であることを確認

3. **Sanity接続エラー**
   - プロジェクトID、データセット名、トークンを再確認
   - トークンの権限（read/write）を確認

### ログの確認方法:
```bash
# ローカルでテスト
pnpm --filter worker start translate <document-id> --dry-run

# デバッグモード
DEBUG=* pnpm --filter worker start translate <document-id> --dry-run
```

---

🎉 **セットアップ完了！** これで自動翻訳パイプラインが稼働します。