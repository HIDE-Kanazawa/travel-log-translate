#!/usr/bin/env node

import { Command } from 'commander';
import { glob } from 'fast-glob';
import path from 'path';
import { TranslationService } from './services/translation';
import { FileProcessor } from './services/file-processor';
import { Cache } from './services/cache';
import { Logger } from './utils/logger';
const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt-br', 'ru', 'ko', 
  'zh-cn', 'zh-tw', 'ar', 'tr', 'th', 'nl', 'pl', 
  'sv', 'da', 'fi', 'id'
] as const;

const program = new Command();

program
  .name('translate')
  .description('Translate Japanese markdown files to multiple languages using DeepL API')
  .version('0.1.0');

program
  .argument('<patterns...>', 'Glob patterns for markdown files to translate')
  .option('--target <languages>', 'Target languages (comma-separated) or "all"', 'all')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Show what would be translated without actually translating', false)
  .option('--force', 'Force re-translation even if cache exists', false)
  .action(async (patterns: string[], options) => {
    const logger = new Logger(options.json);
    
    try {
      // Parse target languages
      const targetLanguages = options.target === 'all' 
        ? SUPPORTED_LANGUAGES 
        : options.target.split(',').map((lang: string) => lang.trim());

      // Validate target languages
      const invalidLanguages = targetLanguages.filter((lang: string) => !SUPPORTED_LANGUAGES.includes(lang as any));
      if (invalidLanguages.length > 0) {
        logger.error('Invalid target languages', { invalidLanguages, supported: SUPPORTED_LANGUAGES });
        process.exit(10);
      }

      // Find markdown files
      const files = await glob(patterns, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/*-{' + SUPPORTED_LANGUAGES.join(',') + '}.md'],
        absolute: true,
      });

      if (files.length === 0) {
        logger.warn('No files found matching patterns', { patterns });
        return;
      }

      logger.info('Found files to process', { count: files.length, files: files.map(f => path.basename(f)) });

      // Initialize services
      const cache = new Cache();
      const translationService = new TranslationService(process.env.DEEPL_API_KEY);
      const fileProcessor = new FileProcessor(translationService, cache, logger);

      // Process each file
      let totalTranslated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const filePath of files) {
        try {
          const result = await fileProcessor.processFile(filePath, targetLanguages, {
            dryRun: options.dryRun,
            force: options.force,
          });

          totalTranslated += result.translated;
          totalSkipped += result.skipped;
          totalErrors += result.errors;
        } catch (error) {
          logger.error('Failed to process file', { 
            file: path.basename(filePath), 
            error: error instanceof Error ? error.message : String(error) 
          });
          totalErrors++;
        }
      }

      // Summary
      logger.info('Translation completed', {
        totalFiles: files.length,
        totalTranslated,
        totalSkipped,
        totalErrors,
      });

      if (totalErrors > 0) {
        process.exit(20);
      }
    } catch (error) {
      logger.error('Translation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      process.exit(30);
    }
  });

program.parse();