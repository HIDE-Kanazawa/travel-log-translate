# Suggested Commands

## System Information
- **OS**: Darwin (macOS)
- **Package Manager**: pnpm 8+
- **Node**: 20+
- **Git**: Available for version control

## Development Setup

### Initial Setup
```bash
# Install dependencies
pnpm install

# Build all packages  
pnpm build

# Set up environment
cp .env.example .env
# Edit .env with your API keys
```

### Development Commands
```bash
# Start development mode (translate-cli)
pnpm dev

# Start worker in development mode
pnpm --filter worker dev

# Start webhook server in development
pnpm --filter webhook dev
```

## Translation Commands

### CLI Translation (Markdown Files)
```bash
# Translate Japanese markdown to English
pnpm translate content/drafts/sample.md --target en

# Translate to all 20 languages
pnpm translate content/drafts/**/*.md --target all

# Development mode with specific target
pnpm dev content/drafts/sample-article.md --target en
```

### Sanity Document Translation
```bash
# Translate specific Sanity document
pnpm sanity-translate translate <document-id>

# Dry run (no actual translation)
pnpm sanity-translate translate <document-id> --dry-run

# Force re-translation of existing content
pnpm sanity-translate translate <document-id> --force

# Translate to specific languages only
pnpm sanity-translate translate <document-id> --languages en,fr,de

# Check usage statistics
pnpm sanity-translate stats

# Clear translation cache
pnpm sanity-translate clear-cache
```

## Quality Assurance

### Linting & Formatting
```bash
# Run ESLint on all packages
pnpm lint

# Format code with Prettier
pnpm format

# Type checking
pnpm typecheck
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Watch mode for development
pnpm test --watch
```

### Build Verification
```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter translate-cli build
pnpm --filter worker build
```

## GitHub Actions & CI

### Manual Workflow Triggers
```bash
# Using GitHub CLI (if available)
gh workflow run "Sanity Article Translation" \
  -f document_id="your-document-id" \
  -f dry_run=false \
  -f force_retranslate=false
```

### Local GitHub Actions Testing
```bash
# Check workflow syntax (if act is installed)
act -n

# Run specific workflow locally
act workflow_dispatch
```

## Cache & Maintenance

### DeepL Cache Management
```bash
# View cache statistics
pnpm sanity-translate cache --stats

# Clear expired cache entries
pnpm sanity-translate cache --clear

# Clear all cache
pnpm sanity-translate cache --clear --all
```

### Package Management
```bash  
# Update dependencies
pnpm update

# Check for outdated packages
pnpm outdated

# Clean node_modules and reinstall
rm -rf node_modules packages/*/node_modules
pnpm install
```

## Debugging & Troubleshooting

### Verbose Logging
```bash
# JSON structured output
pnpm sanity-translate translate <doc-id> --json

# Verbose CLI output
pnpm translate file.md --verbose
```

### Environment Validation
```bash
# Check environment variables
pnpm sanity-translate validate-env

# Test API connections
pnpm sanity-translate test-apis
```

## Workspace Management

### Working with Specific Packages
```bash
# Install dependency in specific package
pnpm --filter translate-cli add new-dependency

# Run command in specific package
pnpm --filter worker run start

# Run command in all packages
pnpm -r run build
pnpm -r run test
```

### Package Filtering
```bash
# Filter by package name
pnpm --filter shared run build

# Filter by pattern
pnpm --filter "*cli*" run test

# Exclude packages
pnpm --filter "!webhook" run lint
```

## Common Darwin/macOS Utilities
```bash
# File operations
ls -la                    # List files with details
find . -name "*.ts"       # Find TypeScript files
grep -r "pattern" src/    # Search in source files

# Process management
ps aux | grep node        # Find Node.js processes
pkill -f "node"          # Kill Node.js processes

# System information
sw_vers                   # macOS version
system_profiler SPSoftwareDataType  # System info
```