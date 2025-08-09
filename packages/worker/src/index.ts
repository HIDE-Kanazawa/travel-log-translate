#!/usr/bin/env node
import { Command } from 'commander';
import { TranslationEngine } from './translation-engine.js';
import {
  DeepLClient,
  SanityArticleClient,
  validateEnvironment,
  TARGET_LANGUAGES,
  formatCharacterCount,
} from 'shared';

/**
 * JSON logger for structured output
 */
function createLogger(jsonMode: boolean) {
  return (message: string, data?: any) => {
    if (jsonMode) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          ...data,
        })
      );
    } else {
      const formattedData = data ? ` ${JSON.stringify(data, null, 2)}` : '';
      console.log(`ℹ️ ${message}${formattedData}`);
    }
  };
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name('sanity-translate')
  .description('Translate Sanity articles from Japanese to multiple languages using DeepL')
  .version('0.1.0');

program
  .argument('<document-id>', 'Sanity document ID to translate')
  .option('--dry-run', 'Show what would be translated without actually translating', false)
  .option('--force', 'Force re-translation even if translations exist', false)
  .option('--json', 'Output structured JSON logs', false)
  .option(
    '--languages <languages>',
    'Target languages (comma-separated)',
    TARGET_LANGUAGES.join(',')
  )
  .option('--max-chars <number>', 'Maximum characters per month', '450000')
  .action(async (documentId: string, options) => {
    const logger = createLogger(options.json);

    try {
      // Validate environment
      const env = validateEnvironment(process.env);
      logger('Environment validated');

      // Parse target languages
      const targetLanguages = options.languages
        .split(',')
        .map((lang: string) => lang.trim())
        .filter((lang: string) => TARGET_LANGUAGES.includes(lang as any));

      if (targetLanguages.length === 0) {
        throw new Error('No valid target languages specified');
      }

      logger('Configuration loaded', {
        documentId,
        targetLanguages: targetLanguages.length,
        dryRun: options.dryRun,
        force: options.force,
        maxChars: parseInt(options.maxChars),
      });

      // Initialize clients
      const deeplClient = new DeepLClient(env.DEEPL_API_KEY);
      const sanityClient = new SanityArticleClient(env);
      const engine = new TranslationEngine(deeplClient, sanityClient, logger);

      logger('Initializing translation engine...');
      await engine.init();

      // Test connections
      logger('Testing API connections...');
      const [deeplUsage, sanityConnected] = await Promise.all([
        deeplClient.getUsage(),
        sanityClient.testConnection(),
      ]);

      if (!sanityConnected) {
        throw new Error('Failed to connect to Sanity');
      }

      logger('API connections established', {
        deepl: {
          usage: `${deeplUsage.percentage.toFixed(1)}%`,
          remaining: formatCharacterCount(deeplUsage.remaining),
        },
        sanity: 'connected',
      });

      // Check if we're approaching limits
      if (deeplUsage.percentage > 90) {
        logger('⚠️ WARNING: DeepL quota nearly exhausted', {
          usage: `${deeplUsage.percentage.toFixed(1)}%`,
          remaining: formatCharacterCount(deeplUsage.remaining),
        });

        if (!options.force && deeplUsage.percentage > 95) {
          throw new Error('DeepL quota critically low. Use --force to override.');
        }
      }

      // Get translation stats first
      logger('Analyzing document...');
      const stats = await engine.getTranslationStats(documentId);

      const existingTranslations = stats.translationStatus.filter(s => s.exists);
      const pendingTranslations = stats.translationStatus.filter(s => !s.exists);

      logger('Document analysis complete', {
        title: stats.sourceDocument?.title,
        lang: stats.sourceDocument?.lang,
        characterCount: formatCharacterCount(stats.characterCount),
        estimatedCost: `$${stats.estimatedCost.toFixed(2)}`,
        existingTranslations: existingTranslations.length,
        pendingTranslations: pendingTranslations.length,
      });

      if (pendingTranslations.length === 0 && !options.force) {
        logger('All translations already exist. Use --force to re-translate.');
        process.exit(0);
      }

      // Perform translation
      logger('Starting translation process...');
      const result = await engine.translateDocument(documentId, {
        dryRun: options.dryRun,
        force: options.force,
        targetLanguages,
        maxCharactersPerMonth: parseInt(options.maxChars),
      });

      // Report results
      if (result.success) {
        logger('✅ Translation completed successfully', {
          translated: result.results.length,
          charactersUsed: formatCharacterCount(result.totalCharactersUsed),
          quotaUsed: `${result.apiQuotaStatus?.percentage.toFixed(1)}%`,
          cachedResults: result.results.filter(r => r.usedCache).length,
        });

        if (options.dryRun) {
          logger('[DRY RUN] No documents were actually created');
        }

        // Show individual results
        result.results.forEach(r => {
          logger(`  ✓ ${r.language}: ${r.translatedDocument.title}`, {
            cached: r.usedCache,
            chars: formatCharacterCount(r.characterCount),
          });
        });
      } else {
        logger('❌ Translation failed', {
          errors: result.errors,
          partialResults: result.results.length,
        });

        result.errors.forEach(error => {
          logger(`  ❌ ${error}`);
        });

        process.exit(20);
      }

      // Final quota check
      if (result.apiQuotaStatus && result.apiQuotaStatus.percentage > 80) {
        logger('⚠️ DeepL quota warning', {
          usage: `${result.apiQuotaStatus.percentage.toFixed(1)}%`,
          remaining: formatCharacterCount(result.apiQuotaStatus.remaining),
        });
      }
    } catch (error) {
      const logger = createLogger(options.json);
      logger('❌ Fatal error', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Exit codes:
      // 10 = Validation error
      // 20 = Translation error
      // 30 = API/Connection error
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('Invalid')) {
          process.exit(10);
        } else if (error.message.includes('quota') || error.message.includes('limit')) {
          process.exit(20);
        } else if (error.message.includes('connect') || error.message.includes('API')) {
          process.exit(30);
        }
      }

      process.exit(1);
    }
  });

// Add stats command
program
  .command('stats')
  .description('Show translation statistics for a document')
  .argument('<document-id>', 'Sanity document ID')
  .option('--json', 'Output JSON format', false)
  .action(async (documentId: string, options) => {
    // When --json is provided, suppress all log lines and emit exactly one JSON object
    const jsonMode: boolean = Boolean(options.json);
    const logger = jsonMode ? ((_: string, __?: any) => {}) : createLogger(false);

    try {
      const env = validateEnvironment(process.env);
      const deeplClient = new DeepLClient(env.DEEPL_API_KEY);
      const sanityClient = new SanityArticleClient(env);
      const engine = new TranslationEngine(deeplClient, sanityClient, logger);

      await engine.init();

      const stats = await engine.getTranslationStats(documentId);
      const usage = await deeplClient.getUsage();

      if (jsonMode) {
        // Single JSON object only
        console.log(
          JSON.stringify(
            {
              documentId,
              title: stats.sourceDocument?.title,
              characterCount: stats.characterCount,
              estimatedCost: stats.estimatedCost,
              translationStatus: stats.translationStatus,
              deeplUsage: usage,
            }
          )
        );
      } else {
        logger('Document Statistics', {
          id: documentId,
          title: stats.sourceDocument?.title,
          lang: stats.sourceDocument?.lang,
          characters: formatCharacterCount(stats.characterCount),
          estimatedCost: `$${stats.estimatedCost.toFixed(2)}`,
        });

        logger('Translation Status', {
          completed: stats.translationStatus.filter(s => s.exists).length,
          pending: stats.translationStatus.filter(s => !s.exists).length,
          total: stats.translationStatus.length,
        });

        logger('DeepL Quota', {
          used: `${usage.percentage.toFixed(1)}%`,
          remaining: formatCharacterCount(usage.remaining),
          limit: formatCharacterCount(usage.characterLimit),
        });
      }
    } catch (error) {
      if (jsonMode) {
        console.log(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        );
      } else {
        const loggerHuman = createLogger(false);
        loggerHuman('❌ Failed to get stats', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      process.exit(1);
    }
  });

// Add cache command
program
  .command('cache')
  .description('Manage DeepL translation cache')
  .option('--clear', 'Clear expired cache entries', false)
  .option('--stats', 'Show cache statistics', false)
  .option('--json', 'Output JSON format', false)
  .action(async options => {
    const logger = createLogger(options.json);

    try {
      const env = validateEnvironment(process.env);
      const deeplClient = new DeepLClient(env.DEEPL_API_KEY);

      await deeplClient.init();

      if (options.clear) {
        deeplClient.clearExpiredCache();
        await deeplClient.saveCache();
        logger('Cache cleared');
      }

      if (options.stats) {
        const stats = deeplClient.getCacheStats();
        logger('Cache Statistics', stats);
      }
    } catch (error) {
      logger('❌ Cache operation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });

program.parse();
