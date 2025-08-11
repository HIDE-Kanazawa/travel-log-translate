#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// .envファイルから環境変数を読み込む
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .envファイルが見つかりません');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#][^=]*?)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      envVars[key] = value;
    }
  });

  return envVars;
}

// 環境変数設定
const envVars = loadEnvFile();
console.log('🔧 環境変数を設定中...');
console.log(`   SANITY_PROJECT_ID: ${envVars.SANITY_PROJECT_ID ? '✅' : '❌'}`);
console.log(`   SANITY_DATASET: ${envVars.SANITY_DATASET ? '✅' : '❌'}`);
console.log(`   SANITY_TOKEN: ${envVars.SANITY_TOKEN ? '✅' : '❌'}\n`);

// 必要な環境変数をチェック
const requiredVars = ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_TOKEN'];
const missingVars = requiredVars.filter(varName => !envVars[varName]);

if (missingVars.length > 0) {
  console.error(`❌ 必要な環境変数が不足しています: ${missingVars.join(', ')}`);
  process.exit(1);
}

// 環境変数を設定してスクリプト実行
const env = { ...process.env, ...envVars };
const command = 'node packages/shared/dist/check-lang-fields.js';

console.log('🚀 調査スクリプトを実行中...\n');

exec(command, { env }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ エラーが発生しました:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️ 警告:', stderr);
  }
  
  console.log(stdout);
});