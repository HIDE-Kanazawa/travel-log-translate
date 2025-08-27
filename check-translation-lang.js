#!/usr/bin/env node

const { createClient } = require('@sanity/client');

// 環境変数読み込み
require('dotenv').config();

// Sanity client setup
const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2023-01-01',
  useCdn: false
});

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
    const translationArticles = await client.fetch(translationArticlesQuery);

    console.log(`✅ 翻訳記事の総数: ${translationArticles.length}件\n`);

    // 2. langフィールドの状態を分析
    const langFieldAnalysis = {
      total: translationArticles.length,
      withValidLang: [],
      withEmptyLang: [],
      withNullLang: [],
      withUndefinedLang: []
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
      ...langFieldAnalysis.withUndefinedLang
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
        
        const originalArticle = await client.fetch(originalArticleQuery);
        
        console.log(`\n  📄 記事ID: ${article._id}`);
        console.log(`     タイトル: ${article.title || 'タイトル未設定'}`);
        console.log(`     現在のlang値: ${JSON.stringify(article.lang)}`);
        console.log(`     元記事ID: ${article.translationOf._ref}`);
        console.log(`     元記事lang: ${originalArticle?.lang || '不明'}`);
        console.log(`     作成日: ${article._createdAt}`);
        console.log(`     更新日: ${article._updatedAt}`);
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
    const langDistribution = {};
    langFieldAnalysis.withValidLang.forEach(article => {
      const lang = article.lang;
      langDistribution[lang] = (langDistribution[lang] || 0) + 1;
    });

    Object.entries(langDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([lang, count]) => {
        console.log(`  ${lang}: ${count}件`);
      });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
checkTranslationLangFields();