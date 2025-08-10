# Vercel Deployment Architecture - Travel-Log Translation System

## Overview
The travel-log translation system uses **two separate Vercel deployments** for different purposes:

## Deployment Structure

### 1. Translation Pipeline Vercel (Current Repo)
- **Repository**: 旅ログ記事生成
- **Purpose**: Translation automation and webhook handling
- **Deployed Services**:
  - Webhook server (`packages/webhook/api/index.ts`)
  - GitHub Actions triggers
  - Smart translation logic
- **URL**: Webhook endpoint for Sanity CMS integration
- **Content**: No blog content, only infrastructure

### 2. Blog Frontend Vercel (Separate Repo) 
- **Repository**: my-sanity-site
- **Purpose**: Actual blog website hosting
- **Deployed Services**:
  - Astro frontend (`site/` directory)
  - Sanity CMS integration for content display
  - Multi-language blog pages
- **URL**: Public blog website (e.g., https://my-blog.vercel.app)
- **Content**: Renders articles from Sanity CMS

## Data Flow Architecture

```
Sanity CMS (Content) → my-sanity-site Vercel (Blog Display)
        ↓
    Webhook → 旅ログ記事生成 Vercel (Translation Pipeline)
        ↓
GitHub Actions → Translation → Back to Sanity CMS
        ↓
    Auto-Deploy → my-sanity-site Vercel (Updated Blog)
```

## Key Points

1. **Content Creation**:
   - Articles created in Sanity CMS
   - Images manually added in Sanity Studio

2. **Translation Trigger**:
   - Sanity webhook calls translation pipeline Vercel
   - Smart conditions check (Japanese + images + missing translations)
   - GitHub Actions triggered for DeepL translation

3. **Blog Updates**:
   - Translated content written back to Sanity CMS
   - my-sanity-site Vercel automatically redeploys when Sanity content changes
   - Multi-language articles appear on blog website

## Answer to User Question

**Question**: "Sanityでブログ記事を作成した後、ブログをデプロイしているVercelで別途build/deployプロセスが必要ですか？"

**Answer**: **No, separate build/deploy is not required**. The my-sanity-site Vercel deployment automatically detects Sanity CMS content changes and redeploys the blog website. The architecture uses headless CMS pattern where:

1. Content changes in Sanity CMS
2. Vercel (my-sanity-site) auto-detects changes
3. Blog automatically rebuilds and deploys
4. New/translated articles appear on live blog

The translation pipeline Vercel (current repo) handles automation, while the blog Vercel (my-sanity-site) handles content display with automatic deployment.