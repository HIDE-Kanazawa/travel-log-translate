#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import glob from 'fast-glob';
import { ContentPublisher } from './content-publisher.js';
import type { PublishingOptions } from './types.js';

const program = new Command();

// Helper function to get publisher instance (lazy initialization)
function getPublisher(validateOnly = false): ContentPublisher {
  return new ContentPublisher({ validateOnly });
}

program
  .name('content')
  .description('Travel blog content publishing tool')
  .version('0.1.0');

/**
 * Publish command
 */
program
  .command('publish')
  .description('Publish markdown articles to Sanity CMS')
  .argument('<files...>', 'Markdown files or glob patterns to publish')
  .option('-d, --dry-run', 'Show what would be published without actually publishing')
  .option('-f, --force', 'Force publish even if article exists')
  .option('--no-move', 'Do not move published articles to published directory')
  .option('--validate-only', 'Only validate articles without publishing')
  .action(async (files: string[], options) => {
    try {
      console.log('🚀 Starting content publishing...\n');

      // Expand glob patterns
      const expandedFiles: string[] = [];
      for (const file of files) {
        if (file.includes('*') || file.includes('?')) {
          const matches = await glob(file, { onlyFiles: true });
          expandedFiles.push(...matches);
        } else {
          expandedFiles.push(file);
        }
      }

      // Filter markdown files
      const markdownFiles = expandedFiles.filter(file => file.endsWith('.md'));
      
      if (markdownFiles.length === 0) {
        console.log('❌ No markdown files found matching the pattern');
        process.exit(1);
      }

      console.log(`📝 Found ${markdownFiles.length} markdown file(s):`);
      markdownFiles.forEach(file => console.log(`  • ${file}`));
      console.log();

      // Prepare publishing options
      const publishOptions: PublishingOptions = {
        dryRun: options.dryRun,
        force: options.force,
        moveToPublished: options.move,
        validateOnly: options.validateOnly,
      };

      // Publish articles
      const publisher = getPublisher();
      
      if (markdownFiles.length === 1) {
        // Single article
        const result = await publisher.publishArticle(markdownFiles[0], publishOptions);
        
        if (result.success) {
          console.log('\n✅ Publishing completed successfully!');
          if (result.metadata) {
            console.log(`📄 Title: ${result.metadata.title}`);
            console.log(`🔗 Slug: ${result.metadata.slug}`);
            console.log(`📊 Content length: ${result.metadata.stats.contentLength} characters`);
            if (result.sanityDocumentId) {
              console.log(`🆔 Document ID: ${result.sanityDocumentId}`);
            }
          }
        } else {
          console.error(`\n❌ Publishing failed: ${result.error}`);
          process.exit(1);
        }
      } else {
        // Batch publishing
        const batchResult = await publisher.batchPublish(markdownFiles, publishOptions);
        
        console.log('\n📊 Batch Publishing Results:');
        console.log(`✅ Successful: ${batchResult.successful}`);
        console.log(`❌ Failed: ${batchResult.failed}`);
        console.log(`📊 Total: ${batchResult.total}`);

        if (batchResult.errors.length > 0) {
          console.log('\n❌ Errors:');
          batchResult.errors.forEach(error => console.log(`  • ${error}`));
        }

        if (batchResult.failed > 0) {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`\n💥 Fatal error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

/**
 * Status command
 */
program
  .command('status')
  .description('Show status of all articles')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const publisher = getPublisher();
      const status = await publisher.getStatus();

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log('📊 Content Publishing Status\n');

      // Summary
      console.log('📈 Summary:');
      console.log(`  Ready to publish: ${status.summary.totalReady}`);
      console.log(`  Published: ${status.summary.totalPublished}`);
      console.log(`  Translations pending: ${status.summary.totalTranslationsPending}`);
      console.log(`  Translations completed: ${status.summary.totalTranslationsCompleted}\n`);

      // Ready articles
      if (status.ready.length > 0) {
        console.log('📝 Ready Articles:');
        status.ready.forEach(article => {
          console.log(`  • ${article.title} (${article.slug})`);
          console.log(`    Path: ${article.path}`);
          console.log(`    Modified: ${new Date(article.lastModified).toLocaleString()}\n`);
        });
      }

      // Published articles
      if (status.published.length > 0) {
        console.log('🚀 Published Articles:');
        status.published.slice(0, 10).forEach(article => {
          const progress = article.translationProgress;
          const progressText = progress 
            ? `${progress.completed}/${progress.total} translations`
            : 'No translation info';
          
          console.log(`  • ${article.title} (${article.slug})`);
          console.log(`    Status: ${progressText}`);
          console.log(`    Modified: ${new Date(article.lastModified).toLocaleString()}\n`);
        });

        if (status.published.length > 10) {
          console.log(`  ... and ${status.published.length - 10} more articles\n`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to get status: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

/**
 * List command
 */
program
  .command('list')
  .description('List articles by status')
  .argument('[status]', 'Filter by status: ready, published, or all', 'all')
  .option('--json', 'Output in JSON format')
  .action(async (statusFilter: string, options) => {
    try {
      const publisher = getPublisher();
      const status = await publisher.getStatus();
      
      let articles: any[] = [];
      
      switch (statusFilter) {
        case 'ready':
          articles = status.ready;
          break;
        case 'published':
          articles = status.published;
          break;
        case 'all':
        default:
          articles = [
            ...status.ready.map(a => ({ ...a, category: 'ready' })),
            ...status.published.map(a => ({ ...a, category: 'published' })),
          ];
          break;
      }

      if (options.json) {
        console.log(JSON.stringify(articles, null, 2));
        return;
      }

      console.log(`📋 Articles (${statusFilter}):\n`);
      
      if (articles.length === 0) {
        console.log('  No articles found.');
        return;
      }

      articles.forEach(article => {
        const category = article.category || statusFilter;
        const emoji = category === 'ready' ? '📝' : '🚀';
        
        console.log(`${emoji} ${article.title}`);
        console.log(`  Slug: ${article.slug}`);
        console.log(`  Path: ${article.path}`);
        console.log(`  Status: ${article.status}`);
        
        if (article.translationProgress) {
          console.log(`  Translations: ${article.translationProgress.completed}/${article.translationProgress.total}`);
        }
        
        console.log(`  Modified: ${new Date(article.lastModified).toLocaleString()}\n`);
      });
    } catch (error) {
      console.error(`❌ Failed to list articles: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

/**
 * Validate command
 */
program
  .command('validate')
  .description('Validate markdown files without publishing')
  .argument('<files...>', 'Markdown files or glob patterns to validate')
  .option('--json', 'Output in JSON format')
  .action(async (files: string[], options) => {
    try {
      // Expand glob patterns
      const expandedFiles: string[] = [];
      for (const file of files) {
        if (file.includes('*') || file.includes('?')) {
          const matches = await glob(file, { onlyFiles: true });
          expandedFiles.push(...matches);
        } else {
          expandedFiles.push(file);
        }
      }

      const markdownFiles = expandedFiles.filter(file => file.endsWith('.md'));
      
      if (markdownFiles.length === 0) {
        console.log('❌ No markdown files found');
        process.exit(1);
      }

      const publisher = getPublisher(true); // validate-only mode
      const validation = await publisher.validateFiles(markdownFiles);

      if (options.json) {
        console.log(JSON.stringify(validation, null, 2));
        return;
      }

      console.log(`🔍 Validation Results:\n`);
      console.log(`✅ Valid: ${validation.valid}`);
      console.log(`❌ Invalid: ${validation.invalid}\n`);

      validation.results.forEach(result => {
        const emoji = result.valid ? '✅' : '❌';
        console.log(`${emoji} ${result.path}`);
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
        console.log();
      });

      if (validation.invalid > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Validation failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// Handle unknown commands
/**
 * Smart translate command - check Sanity articles and trigger translations
 */
program
  .command('smart-translate')
  .description('Check Sanity articles for smart translation conditions and trigger if needed')
  .option('-d, --dry-run', 'Show what would be translated without actually triggering')
  .option('--document-id <id>', 'Check specific document ID only')
  .option('--limit <number>', 'Limit number of articles to check', '50')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      console.log('🔍 Checking smart translation conditions...\n');

      const publisher = getPublisher();
      
      if (options.documentId) {
        // Check specific document
        const result = await publisher.checkSmartTranslationConditions(options.documentId);
        
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const emoji = result.shouldTrigger ? '✅' : '❌';
        console.log(`${emoji} Document ${options.documentId}:`);
        console.log(`  Should trigger: ${result.shouldTrigger}`);
        console.log(`  Reason: ${result.reason}`);
        console.log(`  Has images: ${result.hasImages}`);
        
        if (result.translationStatus) {
          const missing = result.translationStatus.filter((s: any) => !s.exists).length;
          const total = result.translationStatus.length;
          console.log(`  Translations: ${total - missing}/${total} complete`);
        }

        if (result.shouldTrigger && !options.dryRun) {
          console.log('\n🚀 Triggering translation workflow...');
          const triggerResult = await publisher.triggerSmartTranslation(options.documentId);
          
          if (triggerResult.success) {
            console.log('✅ Translation workflow triggered successfully');
          } else {
            console.error(`❌ Failed to trigger translation: ${triggerResult.error}`);
            process.exit(1);
          }
        } else if (result.shouldTrigger && options.dryRun) {
          console.log('\n🔥 Would trigger translation (dry-run mode)');
        }
      } else {
        // Check all recent Japanese articles
        const results = await publisher.checkAllSmartTranslationConditions(parseInt(options.limit));
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        console.log(`📊 Smart Translation Check Results (${results.articles.length} articles):\n`);
        
        const triggerable = results.articles.filter(a => a.shouldTrigger);
        console.log(`✅ Ready to translate: ${triggerable.length}`);
        console.log(`❌ Not ready: ${results.articles.length - triggerable.length}\n`);

        if (triggerable.length > 0) {
          console.log('🔥 Articles ready for translation:');
          triggerable.forEach(article => {
            console.log(`  • ${article.title || article.documentId}`);
            console.log(`    Reason: ${article.reason}`);
            console.log(`    Missing languages: ${article.missingLanguages?.join(', ') || 'Unknown'}\n`);
          });

          if (!options.dryRun) {
            console.log('🚀 Triggering translations...');
            const triggerResults = await publisher.triggerMultipleSmartTranslations(
              triggerable.map(a => a.documentId)
            );
            
            console.log(`\n📊 Trigger Results:`);
            console.log(`✅ Successful: ${triggerResults.successful}`);
            console.log(`❌ Failed: ${triggerResults.failed}`);
            
            if (triggerResults.errors.length > 0) {
              console.log('\n❌ Errors:');
              triggerResults.errors.forEach(error => console.log(`  • ${error}`));
            }
          } else {
            console.log('🔥 Would trigger translations (dry-run mode)');
          }
        } else {
          console.log('✨ No articles currently meet smart translation conditions');
        }
      }
    } catch (error) {
      console.error(`❌ Smart translation check failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program.on('command:*', (operands) => {
  console.error(`❌ Unknown command: ${operands[0]}`);
  console.log('Available commands: publish, status, list, validate, smart-translate');
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}