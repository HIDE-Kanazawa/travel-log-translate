#!/usr/bin/env node
import { createClient } from '@sanity/client';
import type { EnvironmentConfig } from './types.js';

// 環境変数設定
const config: EnvironmentConfig = {
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID!,
  SANITY_DATASET: process.env.SANITY_DATASET!,
  SANITY_TOKEN: process.env.SANITY_TOKEN!,
  SANITY_API_VERSION: '2023-01-01',
  DEEPL_API_KEY: process.env.DEEPL_API_KEY || 'dummy', // Not needed for this script
};

// Sanity client setup
const client = createClient({
  projectId: config.SANITY_PROJECT_ID,
  dataset: config.SANITY_DATASET,
  token: config.SANITY_TOKEN,
  apiVersion: config.SANITY_API_VERSION,
  useCdn: false,
});

interface TranslationArticle {
  _id: string;
  title: string;
  lang: string | null | undefined;
  translationOf: { _ref: string };
  _createdAt: string;
  _updatedAt: string;
}

interface OriginalArticle {
  _id: string;
  title: string;
  lang: string;
}

async function checkTranslationLangFields() {
  console.log('🔍 Sanity CMS翻訳記事のlangフィールド調査を開始...\n');

  try {
    // 1. 全翻訳記事を検索（translationOf._refが存在する記事）
    const translationArticlesQuery = `
      *[_type == "article" && defined(translationOf._ref)] {
        _id,
        title,
        lang,
        translationOf,
        _createdAt,
        _updatedAt
      } | order(_createdAt desc)
    `;

    console.log('📊 翻訳記事を検索中...');
    const translationArticles: TranslationArticle[] = await client.fetch(translationArticlesQuery);

    console.log(`✅ 翻訳記事の総数: ${translationArticles.length}件\n`);

    if (translationArticles.length === 0) {
      console.log('📝 翻訳記事が見つかりませんでした。');
      return;
    }

    // 2. langフィールドの状態を分析
    const langFieldAnalysis = {
      total: translationArticles.length,
      withValidLang: [] as TranslationArticle[],
      withEmptyLang: [] as TranslationArticle[],
      withNullLang: [] as TranslationArticle[],
      withUndefinedLang: [] as TranslationArticle[],
    };

    translationArticles.forEach(article => {
      if (article.lang && article.lang.trim() !== '') {
        langFieldAnalysis.withValidLang.push(article);
      } else if (article.lang === '') {
        langFieldAnalysis.withEmptyLang.push(article);
      } else if (article.lang === null) {
        langFieldAnalysis.withNullLang.push(article);
      } else {
        langFieldAnalysis.withUndefinedLang.push(article);
      }
    });

    // 3. 結果レポート
    console.log('📈 langフィールド状態レポート:');
    console.log(`  ✅ 適切に設定済み: ${langFieldAnalysis.withValidLang.length}件`);
    console.log(`  ⚠️  空文字列: ${langFieldAnalysis.withEmptyLang.length}件`);
    console.log(`  ❌ null値: ${langFieldAnalysis.withNullLang.length}件`);
    console.log(`  🚫 未定義: ${langFieldAnalysis.withUndefinedLang.length}件\n`);

    // 4. 問題のある記事の詳細
    const problemArticles = [
      ...langFieldAnalysis.withEmptyLang,
      ...langFieldAnalysis.withNullLang,
      ...langFieldAnalysis.withUndefinedLang,
    ];

    if (problemArticles.length > 0) {
      console.log('🔴 問題のある記事詳細:');

      for (const article of problemArticles) {
        // 元記事の情報を取得して期待されるlang値を推定
        const originalArticleQuery = `
          *[_id == "${article.translationOf._ref}"][0] {
            _id,
            title,
            lang
          }
        `;

        const originalArticle: OriginalArticle = await client.fetch(originalArticleQuery);

        console.log(`\n  📄 記事ID: ${article._id}`);
        console.log(`     タイトル: ${article.title || 'タイトル未設定'}`);
        console.log(`     現在のlang値: ${JSON.stringify(article.lang)}`);
        console.log(`     元記事ID: ${article.translationOf._ref}`);
        console.log(`     元記事lang: ${originalArticle?.lang || '不明'}`);
        console.log(`     作成日: ${article._createdAt}`);
        console.log(`     更新日: ${article._updatedAt}`);

        // 記事IDから期待される言語を推定
        const idParts = article._id.split('-');
        const expectedLang = idParts[idParts.length - 1];
        if (expectedLang && expectedLang.match(/^[a-z]{2}(-[a-z]{2})?$/)) {
          console.log(`     期待されるlang値: ${expectedLang}`);
        }
      }
    } else {
      console.log('✅ 全ての翻訳記事のlangフィールドが適切に設定されています！');
    }

    // 5. 統計サマリー
    console.log('\n📊 調査結果サマリー:');
    console.log(`  - 翻訳記事総数: ${langFieldAnalysis.total}件`);
    console.log(`  - 問題なし: ${langFieldAnalysis.withValidLang.length}件`);
    console.log(`  - 問題あり: ${problemArticles.length}件`);

    if (problemArticles.length > 0) {
      const problemRate = ((problemArticles.length / langFieldAnalysis.total) * 100).toFixed(1);
      console.log(`  - 問題率: ${problemRate}%`);
    }

    // 6. langフィールドの値分布を確認
    console.log('\n🌍 設定済みlang値の分布:');
    const langDistribution: { [key: string]: number } = {};
    langFieldAnalysis.withValidLang.forEach(article => {
      const lang = article.lang!;
      langDistribution[lang] = (langDistribution[lang] || 0) + 1;
    });

    Object.entries(langDistribution)
      .sort(([, a], [, b]) => b - a)
      .forEach(([lang, count]) => {
        console.log(`  ${lang}: ${count}件`);
      });

    // 7. 問題の原因分析
    if (problemArticles.length > 0) {
      console.log('\n🔍 問題の原因として考えられるもの:');
      console.log('  1. 翻訳作成時にlangフィールドが設定されていない');
      console.log('  2. 翻訳エンジンでのフィールドマッピング不具合');
      console.log('  3. 手動でのSanity Studio編集時の設定漏れ');
      console.log('  4. バッチ処理中でのデータ不整合');

      console.log('\n💡 修正のための推奨アクション:');
      console.log('  1. /Users/yamazaki/旅ログ記事生成/packages/worker/src/translation-engine.ts の確認');
      console.log('  2. createOrUpdateTranslation関数でのlang設定処理確認');
      console.log('  3. 問題記事のlangフィールド手動修正');
      console.log('  4. 翻訳作成プロセスの改善');
    }

    // 8. 記事IDパターン分析
    console.log('\n🆔 記事IDパターン分析:');
    const idPatterns: { [pattern: string]: number } = {};
    
    problemArticles.forEach(article => {
      const idParts = article._id.split('-');
      const lastPart = idParts[idParts.length - 1];
      
      if (lastPart.match(/^[a-z]{2}$/)) {
        idPatterns[`*-${lastPart} (2文字言語コード)`] = (idPatterns[`*-${lastPart} (2文字言語コード)`] || 0) + 1;
      } else if (lastPart.match(/^[a-z]{2}-[a-z]{2}$/)) {
        idPatterns[`*-${lastPart} (地域コード付き)`] = (idPatterns[`*-${lastPart} (地域コード付き)`] || 0) + 1;
      } else {
        idPatterns['その他のパターン'] = (idPatterns['その他のパターン'] || 0) + 1;
      }
    });

    Object.entries(idPatterns).forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}件`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
checkTranslationLangFields().catch(console.error);