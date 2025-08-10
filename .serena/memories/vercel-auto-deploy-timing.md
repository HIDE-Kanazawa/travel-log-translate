# Vercel Auto-Deploy Timing Analysis - Travel-Log Translation System

## Current Understanding - Potential Issue Identified

The user has identified a critical timing issue in the Vercel auto-deployment process that could result in incomplete content being displayed on the blog.

## Problem Analysis

### Current Flow (Potential Race Condition)
```
1. Sanity CMS: Japanese article created → Immediate webhook to my-sanity-site Vercel
2. my-sanity-site Vercel: Detects change → Auto-build/deploy (Japanese only)
3. Sanity CMS: Webhook to translation pipeline → Smart conditions check
4. GitHub Actions: DeepL translation → Creates 19 language documents in Sanity
5. my-sanity-site Vercel: Detects new translations → Auto-build/deploy (All languages)
```

### The Issue
- **Step 1-2**: Blog deploys immediately with only Japanese article
- **Step 4-5**: Blog deploys again 5-15 minutes later with all translations
- **User Experience**: Visitors may see incomplete content during translation window

## Technical Details

### Webhook Configuration Analysis
From the codebase investigation:
- Translation pipeline webhook only triggers on `update` operations with smart conditions
- Smart conditions require: Japanese + Images + Missing translations
- GitHub Actions takes 5-15 minutes to complete full translation

### Vercel Auto-Deploy Behavior
- Vercel detects Sanity content changes via webhooks or polling
- Each Sanity document creation/update triggers a new deploy
- No built-in delay or batch processing for related changes

## Potential Solutions

### Option 1: Delayed Publishing
- Modify Sanity schema to have `published` status field
- Only show articles where `published: true` and all translations exist
- Manually set `published: true` after translations complete

### Option 2: Deploy Batching
- Configure Vercel to ignore immediate Sanity changes
- Use GitHub Actions to trigger Vercel deploy after translations complete
- Requires custom webhook setup

### Option 3: Accept Current Behavior
- Japanese articles appear first (immediate SEO benefit)
- Translations appear later (progressive enhancement)
- Add UI indicator for "translation in progress"

## Answer to User Question

**Question**: "my-sanity-site Vercelが変更を自動検出してブログが自動ビルド・デプロイというのは翻訳処理が完全に終了したタイミングでしょうか？"

**Answer**: **No, there are likely TWO separate auto-deploys:**

1. **Immediate Deploy** (Japanese article creation):
   - Triggers: When Japanese article is first created in Sanity
   - Content: Only Japanese article appears on blog
   - Timing: Within 1-2 minutes

2. **Secondary Deploy** (After translations):
   - Triggers: When GitHub Actions completes 19-language translations
   - Content: Full multilingual content appears
   - Timing: 5-15 minutes after initial article creation

This means there's a **translation window** where only the Japanese article is visible, which could impact user experience and SEO for international visitors.

## Recommendation
Consider implementing Option 1 (Delayed Publishing) to ensure complete multilingual content is available before articles go live.