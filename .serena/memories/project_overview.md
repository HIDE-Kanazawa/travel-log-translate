# 🌏 Travel-Log Auto-Translate - Project Overview

## Purpose
This project is a **Japanese travel article translation automation pipeline** that:
- Takes Japanese markdown articles as input 
- Automatically translates them into 20 languages using DeepL API
- Integrates with Sanity CMS for content management
- Uses GitHub Actions for automated deployment and translation workflows

## Key Goals
1. **日本語記事を 20 言語へ機械翻訳**: Translate Japanese articles to 20 target languages
2. **自動化**: Fully automated pipeline triggered by content changes or webhooks
3. **依存最小化**: Minimal dependencies - primarily DeepL API and GitHub Actions
4. **Direct main branch commits**: No PR workflow, direct commits to main branch

## Target Languages (20)
`en`, `zh-cn`, `zh-tw`, `ko`, `fr`, `de`, `es`, `it`, `pt`, `ru`, `ar`, `hi`, `id`, `ms`, `th`, `vi`, `tl`, `tr`, `br`

## Workflow Overview
1. Trigger via GitHub Actions (push to main or repository_dispatch from Sanity webhook)
2. Detect changed/added Japanese markdown files
3. Parse front-matter with gray-matter
4. Translate title, excerpt, tags, and body using DeepL API
5. Generate language-specific slugs and save to `content/drafts/<lang>/`
6. Commit and push results directly to main branch

## Project Structure
- **Monorepo** with pnpm workspaces
- **4 main packages**:
  - `shared/`: Common libraries (DeepL client, Sanity client, types)
  - `translate-cli/`: CLI tool for markdown file translation  
  - `worker/`: Sanity document translation engine
  - `webhook/`: Express server for Sanity webhook handling
- **GitHub Actions**: Automated translation workflows
- **Node 20 + TypeScript**: Modern JavaScript stack

## Key Constraints
- **DeepL Free tier**: 500,000 chars/month limit
- **Character limit**: 15,000 chars per article (CI fails if exceeded)
- **Cache system**: Avoids re-translation of same content
- **Direct commits**: No PR review process, commits directly to main

## Current Version Status
- **v0.1.1**: JA→EN prototyping + direct main branch commits
- **Roadmap**: Moving toward 20-language support, Sanity webhook integration, human review UI