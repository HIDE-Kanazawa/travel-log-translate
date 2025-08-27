#!/usr/bin/env node
import { createClient } from '@sanity/client';
import type { EnvironmentConfig } from './types.js';

// 環境変数設定
const config: EnvironmentConfig = {
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID!,
  SANITY_DATASET: process.env.SANITY_DATASET!,
  SANITY_API_TOKEN: process.env.SANITY_API_TOKEN!,
  SANITY_API_VERSION: '2023-01-01',
  DEEPL_API_KEY: process.env.DEEPL_API_KEY || 'dummy',
};

// Sanity client setup
const client = createClient({
  projectId: config.SANITY_PROJECT_ID,
  dataset: config.SANITY_DATASET,
  token: config.SANITY_API_TOKEN,
  apiVersion: config.SANITY_API_VERSION,
  useCdn: false,
});

interface DetailedTranslationArticle {
  _id: string;
  title: string;
  lang: string;
  translationOf: { _ref: string };
  _createdAt: string;
  _updatedAt: string;
  slug?: { current?: string };
}

interface OriginalArticle {
  _id: string;
  title: string;
  lang: string;
  _createdAt: string;
}

async function detailedLangAnalysis() {
  console.log('🔍 Sanity CMS詳細言語分析を開始...\n');

  try {
    // 1. 全翻訳記事を検索（詳細情報付き）
    const translationArticlesQuery = `
      *[_type == "article" && defined(translationOf._ref)] {
        _id,
        title,
        lang,
        translationOf,
        _createdAt,
        _updatedAt,
        slug
      } | order(_createdAt desc)
    `;

    const translationArticles: DetailedTranslationArticle[] = await client.fetch(translationArticlesQuery);

    // 2. 元記事の情報も取得
    const originalArticlesQuery = `
      *[_type == "article" && lang == "ja" && !defined(translationOf._ref)] {
        _id,
        title,
        lang,
        _createdAt
      } | order(_createdAt desc)
    `;

    const originalArticles: OriginalArticle[] = await client.fetch(originalArticlesQuery);

    console.log(`📊 基本統計:`);
    console.log(`  - 元記事（日本語）: ${originalArticles.length}件`);
    console.log(`  - 翻訳記事: ${translationArticles.length}件`);
    console.log(`  - 平均翻訳数/記事: ${(translationArticles.length / originalArticles.length).toFixed(1)}件\n`);

    // 3. 言語コード異常検知
    console.log('🌍 言語コード詳細分析:');
    
    // サポートされるべき言語リスト（プロジェクトから）
    const expectedLanguages = [
      'en', 'es', 'fr', 'de', 'it', 'pt-br', 'ru', 'ko', 
      'zh-cn', 'zh-tw', 'ar', 'tr', 'th', 'nl', 'pl', 
      'sv', 'da', 'fi', 'id'
    ];

    const actualLanguages: { [key: string]: number } = {};
    const unexpectedLanguages: string[] = [];

    translationArticles.forEach(article => {
      const lang = article.lang;
      actualLanguages[lang] = (actualLanguages[lang] || 0) + 1;
      
      if (!expectedLanguages.includes(lang)) {
        unexpectedLanguages.push(lang);
      }
    });

    console.log('  期待される言語の分布:');
    expectedLanguages.forEach(lang => {
      const count = actualLanguages[lang] || 0;
      const status = count > 0 ? '✅' : '❌';
      console.log(`    ${status} ${lang}: ${count}件`);
    });

    if (unexpectedLanguages.length > 0) {
      console.log(`\n  ⚠️ 予期しない言語コード: ${[...new Set(unexpectedLanguages)].join(', ')}`);
      
      const unexpectedDetails: { [key: string]: string[] } = {};
      translationArticles
        .filter(article => unexpectedLanguages.includes(article.lang))
        .forEach(article => {
          if (!unexpectedDetails[article.lang]) {
            unexpectedDetails[article.lang] = [];
          }
          unexpectedDetails[article.lang].push(`${article._id} (${article.title})`);
        });

      Object.entries(unexpectedDetails).forEach(([lang, articles]) => {
        console.log(`\n    📄 ${lang}言語の記事:`);
        articles.forEach(article => {
          console.log(`      - ${article}`);
        });
      });
    } else {
      console.log(`\n  ✅ 全ての言語コードが期待される範囲内です`);
    }

    // 4. 記事IDと言語コードの整合性チェック
    console.log('\n🔗 記事IDと言語コードの整合性:');
    let consistencyIssues = 0;
    const inconsistentArticles: Array<{
      id: string;
      title: string;
      expectedLang: string;
      actualLang: string;
    }> = [];

    translationArticles.forEach(article => {
      const idParts = article._id.split('-');
      const expectedLangFromId = idParts[idParts.length - 1];
      
      if (expectedLangFromId !== article.lang) {
        consistencyIssues++;
        inconsistentArticles.push({
          id: article._id,
          title: article.title,
          expectedLang: expectedLangFromId,
          actualLang: article.lang,
        });
      }
    });

    if (consistencyIssues === 0) {
      console.log('  ✅ 全記事でIDと言語コードが一致しています');
    } else {
      console.log(`  ❌ ${consistencyIssues}件の不整合を発見:`);
      inconsistentArticles.forEach(article => {
        console.log(`    - ID: ${article.id}`);
        console.log(`      タイトル: ${article.title}`);
        console.log(`      期待値: ${article.expectedLang}`);
        console.log(`      実際値: ${article.actualLang}`);
        console.log('');
      });
    }

    // 5. 翻訳の完成度分析
    console.log('📈 翻訳完成度分析:');
    const translationCompleteness: { [originalId: string]: string[] } = {};

    translationArticles.forEach(article => {
      const originalId = article.translationOf._ref;
      if (!translationCompleteness[originalId]) {
        translationCompleteness[originalId] = [];
      }
      translationCompleteness[originalId].push(article.lang);
    });

    const completenessStats = {
      fullTranslated: 0,  // 19言語完全翻訳
      partialTranslated: 0,  // 部分翻訳
      notTranslated: 0,   // 未翻訳
    };

    originalArticles.forEach(original => {
      const translatedLangs = translationCompleteness[original._id] || [];
      const translatedCount = translatedLangs.length;

      if (translatedCount === expectedLanguages.length) {
        completenessStats.fullTranslated++;
      } else if (translatedCount > 0) {
        completenessStats.partialTranslated++;
      } else {
        completenessStats.notTranslated++;
      }
    });

    console.log(`  完全翻訳（19言語）: ${completenessStats.fullTranslated}件`);
    console.log(`  部分翻訳: ${completenessStats.partialTranslated}件`);
    console.log(`  未翻訳: ${completenessStats.notTranslated}件`);

    // 6. 部分翻訳記事の詳細
    if (completenessStats.partialTranslated > 0) {
      console.log('\n📋 部分翻訳記事の詳細:');
      
      for (const original of originalArticles) {
        const translatedLangs = translationCompleteness[original._id] || [];
        const translatedCount = translatedLangs.length;
        
        if (translatedCount > 0 && translatedCount < expectedLanguages.length) {
          const missingLangs = expectedLanguages.filter(lang => !translatedLangs.includes(lang));
          console.log(`\n  📄 ${original.title} (${original._id})`);
          console.log(`    翻訳済み: ${translatedCount}/${expectedLanguages.length}言語`);
          console.log(`    未翻訳言語: ${missingLangs.join(', ')}`);
        }
      }
    }

    // 7. 最新の翻訳活動
    console.log('\n📅 翻訳活動サマリー:');
    const recentTranslations = translationArticles
      .sort((a, b) => new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime())
      .slice(0, 10);

    console.log('  最新の翻訳記事 (上位10件):');
    recentTranslations.forEach((article, index) => {
      const date = new Date(article._createdAt).toLocaleDateString('ja-JP');
      console.log(`    ${index + 1}. ${article.lang} - ${article.title} (${date})`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
detailedLangAnalysis().catch(console.error);