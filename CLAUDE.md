# CLAUDE.md – Translation Automation Project
> Guidance for Claude Code working on the **Travel-Log Translation Pipeline**  
> Last update : 2025-08-05 (v0.1.1 spec-sync)

---

## 0. TL;DR – 3-Rule Summary
1. **入力は日本語 Markdown（lang: ja）**  
2. **出力は 20 言語 Markdown を main ブランチへ直接コミット**  
3. **DeepL API / GitHub Actions** 以外は使わない（依存最小化、n8n は任意）

---

## 1. Project Overview
| Item | Spec |
|------|------|
| **Name** | 🌏 Travel-Log Auto-Translate |
| **Goal** | 日本語記事を 20 言語へ機械翻訳し、`my-sanity-site` の `content/drafts/` ツリーに自動追加 |
| **Input** | `content/drafts/**/*.md`（lang=ja） |
| **Output** | `content/drafts/<lang>/<slug>-<lang>.md` |
| **Stack** | Node 20, TypeScript, DeepL API Free, GitHub Actions |
| **Secrets** | `DEEPL_API_KEY` |
| **Target Langs (20)** | en, zh-cn, zh-tw, ko, fr, de, es, it, pt, ru, ar, hi, id, ms, th, vi, tl, tr, br |

---

## 2. Directory Structure
translation-workflow/ ├─ packages/ │ └─ translate-cli/ # TypeScript CLI & libs ├─ .github/ │ └─ workflows/translate.yml ├─ scripts/ │ └─ utils/ # create-commit.ts など └─ CLAUDE.md


---

## 3. Translation Workflow

1. **Trigger – GitHub Actions**  
   - `on: push` to **main**, `paths: content/drafts/**/*.md`, `lang == ja`

2. **Translate Step**  
   1. 変更/追加された日本語 MD を検出  
   2. `gray-matter` で Front-Matter 解析  
   3. DeepL API で `title` `excerpt` `tags[]` `body` を翻訳  
   4. `slug` を `<original>-<lang>`、`lang` を `<lang>` に設定  
   5. 出力 MD を `content/drafts/<lang>/` に保存（既存ならスキップ）  

3. **Commit & Push**  
   - `git config --global user.name "github-actions[bot]"`  
   - `git commit -am "chore: add translations for <slug> (<lang> …)"`  
   - `git push` （fast-forward）  

4. **CI Checks**  
   - `markdownlint-cli2`  
   - `post --dry-run content/drafts/**/*-*.md` で Front-Matter 検証  

---

## 4. Commands

```bash
# Local setup
pnpm install      # pnpm 7+
pnpm --filter translate-cli dev path/to/japanese.md

# Manual all-lang batch
pnpm translate content/drafts/**/*.md --target all
5. Quality & Error Handling
Area	Rule
API Quota	DeepL Free 500 000 chars/month → キャッシュ & リトライ
Length Check	日本語本文 ≤ 15 000 文字なら OK、超過で CI fail
Exit Codes	0=OK / 10=Validation / 20=DeepL / 30=Git
Logging	--json オプションで構造化ログを出力
6. Roadmap
Phase	Tasks
v0.1	JA→EN prototyping + main ブランチ commit
v0.2	20 言語対応 & DeepL quota cache
v0.3	Sanity Webhook → GitHub Dispatch 連携
v1.0	人間レビュー UI & re-translate フィードバック
7. Contact & Ownership
Role	GitHub	Responsibility
Product Owner	@hide	Requirements & approvals
Translator AI	Claude Code	Automatic translation commit
Content Team	@content-team	Review Japanese articles
📝 Change Log
Date	Ver	Summary
2025-08-05	0.1.1	Align spec: no PR, direct commit
