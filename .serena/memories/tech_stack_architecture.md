# Tech Stack & Architecture

## Core Technologies
- **Node.js**: 20+ (specified in package.json engines)
- **TypeScript**: 5.3.3+ with strict configuration
- **pnpm**: 8+ package manager with workspaces
- **ESM modules**: All packages use `"type": "module"`

## Key Dependencies

### Translation & API
- **deepl-node**: ^1.13.0 - Official DeepL API client
- **@sanity/client**: ^6.15.7 - Sanity CMS integration
- **gray-matter**: ^4.0.3 - Front-matter parsing for markdown files

### CLI & Utilities  
- **commander**: ^11.1.0 - Command-line interface framework
- **globby/fast-glob**: File pattern matching
- **zod**: ^3.22.4 - Runtime type validation

### Development Tools
- **tsx**: ^4.7.0 - TypeScript execution for development
- **vitest**: ^1.2.2 - Testing framework with coverage
- **eslint**: ^8.56.0 - Linting with TypeScript support
- **prettier**: ^3.6.2 - Code formatting

## Architecture Overview

### Monorepo Structure
```
packages/
├── shared/           # Common libraries & types
├── translate-cli/    # Markdown file translation CLI
├── worker/          # Sanity document translation engine  
├── webhook/         # Express server for webhooks
```

### Package Responsibilities

#### `shared/`
- **DeepL client**: API integration with caching
- **Sanity client**: CMS operations
- **Type definitions**: Shared TypeScript interfaces
- **Portable Text processing**: Sanity structured content handling

#### `translate-cli/`
- **CLI interface**: Commander.js-based commands
- **Markdown processing**: gray-matter front-matter parsing
- **File operations**: Glob pattern matching, file I/O
- **Translation orchestration**: Batch processing of markdown files

#### `worker/`
- **Translation engine**: Core business logic for Sanity documents
- **CLI commands**: Document translation, stats, caching operations
- **Sanity integration**: Document retrieval, creation, and updates

#### `webhook/`
- **Express server**: HTTP webhook endpoint
- **HMAC verification**: Security for Sanity webhooks
- **GitHub integration**: repository_dispatch triggering

## Configuration System

### TypeScript Configuration
- **Strict mode** enabled with unused variable/parameter checks
- **ES2022 target** with ESNext modules
- **Declaration files** generated for all packages
- **Root directory**: `./` (recently changed from `./src`)

### Build System
- **tsc**: TypeScript compiler for all packages
- **Parallel builds**: `pnpm -r run build` for all workspaces
- **Source maps**: Development support with tsx

### Environment Configuration
- **Zod schemas**: Runtime environment validation
- **Multiple environments**: Development, staging, production
- **Secret management**: GitHub Secrets for CI/CD

## Integration Points

### GitHub Actions
- **Trigger**: `repository_dispatch` from Sanity webhooks
- **Manual**: `workflow_dispatch` for testing
- **Cache**: pnpm store caching for faster builds
- **Matrix testing**: Node 18/20 compatibility

### DeepL API
- **Free tier**: 500,000 char/month limit with quota monitoring  
- **Caching**: Local JSON cache to avoid re-translation
- **Batch processing**: Multiple texts per API call for efficiency
- **Error handling**: Quota limits, rate limiting, connection errors

### Sanity CMS
- **Document types**: Structured content with Portable Text
- **API version**: 2024-01-01 with token-based auth
- **Webhook security**: HMAC signature verification
- **Real-time triggers**: Content change notifications