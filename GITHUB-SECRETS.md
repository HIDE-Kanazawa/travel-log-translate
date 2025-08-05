# 🔐 GitHub Secrets 設定ガイド

## 現在のステータス
✅ **リポジトリ作成完了**: https://github.com/HIDE-Kanazawa/travel-log-translate  
✅ **コードプッシュ完了**: main ブランチ + v0.1.0 タグ  
⚠️  **GitHub Actions 失敗中**: Secrets未設定のため（正常な状態）

---

## 📋 必須 GitHub Secrets 設定

### アクセス方法
1. **GitHub Repository** → https://github.com/HIDE-Kanazawa/travel-log-translate
2. **Settings** タブをクリック
3. **Secrets and variables** → **Actions** をクリック
4. **"New repository secret"** で以下を1つずつ追加

### 設定する Secrets

#### 1. DeepL API 設定
```
Name: DEEPL_API_KEY
Value: your_deepl_api_key_here
```
**取得方法**: https://www.deepl.com/pro-api からAPI キーを取得

#### 2. Sanity CMS 設定
```
Name: SANITY_PROJECT_ID
Value: your_sanity_project_id

Name: SANITY_DATASET  
Value: production

Name: SANITY_TOKEN
Value: your_sanity_api_token

Name: SANITY_API_VERSION
Value: 2024-01-01
```
**取得方法**: 
- Project ID: Sanity Studio の URL から取得
- Token: https://manage.sanity.io/projects/[PROJECT_ID]/settings/api で作成

#### 3. Webhook セキュリティ
```
Name: SANITY_WEBHOOK_SECRET
Value: your_webhook_secret_here
```
**生成方法**: 
```bash
# macOS/Linux
openssl rand -hex 32

# または任意の32文字以上のランダム文字列
```

#### 4. GitHub 連携
```
Name: GH_PAT
Value: <Personal Access Token>
```
**作成方法**:
1. https://github.com/settings/personal-access-tokens/new
2. Repository access: **Selected repositories** → `travel-log-translate`
3. Permissions:
   - **Actions**: Read and write
   - **Contents**: Read and write
   - **Metadata**: Read

---

## ✅ 設定完了後の確認

### 1. GitHub Actions 再実行
設定完了後、以下で動作確認：

1. **Repository → Actions** タブ
2. **失敗したワークフロー** をクリック
3. **"Re-run jobs"** で再実行

### 2. 期待する結果
- ✅ **PR Check**: Node.js 18/20 でビルド・テスト成功
- ✅ **環境変数検証**: Secrets が正しく読み込まれる
- ✅ **TypeScript コンパイル**: 全パッケージでビルド成功

---

## 🧪 初回テスト実行

### 手動ワークフロー実行
GitHub Actions が成功したら：

1. **Actions** → **"Sanity Article Translation"**
2. **"Run workflow"** をクリック
3. **設定**:
   ```
   document_id: <your-test-sanity-document-id>
   dry_run: true (推奨：初回は安全のため)
   force_retranslate: false
   ```

### 期待する動作
- ✅ Sanity から日本語記事を取得
- ✅ DeepL API で翻訳実行（ドライランなので実際の保存はなし）
- ✅ 19言語の翻訳結果をログに出力
- ✅ API使用量を表示

---

## 🚨 トラブルシューティング

### よくあるエラー

#### `DEEPL_API_KEY not found`
→ Secrets設定を再確認、API キーの形式確認

#### `Sanity connection failed`  
→ PROJECT_ID、DATASET、TOKEN を再確認

#### `Repository dispatch failed`
→ GH_PAT の権限を再確認（Actions: write が必要）

### デバッグ方法
```bash
# ローカルでテスト
cd /path/to/travel-log-translate
cp .env.example .env
# .env に実際の値を設定

pnpm --filter worker start translate <document-id> --dry-run
```

---

## 📊 完了確認チェックリスト

### 必須項目
- [ ] ✅ DEEPL_API_KEY 設定済み
- [ ] ✅ SANITY_PROJECT_ID 設定済み  
- [ ] ✅ SANITY_DATASET 設定済み
- [ ] ✅ SANITY_TOKEN 設定済み
- [ ] ✅ SANITY_API_VERSION 設定済み
- [ ] ✅ SANITY_WEBHOOK_SECRET 設定済み
- [ ] ✅ GH_PAT 設定済み

### 動作確認
- [ ] ✅ GitHub Actions（PR Check）が成功
- [ ] ✅ 手動ワークフロー実行でテスト翻訳成功
- [ ] ✅ Sanity接続テスト成功
- [ ] ✅ DeepL API接続テスト成功

---

🎉 **全て完了したら、本格的な翻訳パイプラインが稼働開始です！**