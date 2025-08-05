# Task Completion Guidelines

## MANDATORY Quality Checks

When completing any development task, you MUST run these commands in sequence:

### 1. Code Quality Checks
```bash
# Run all linting checks
pnpm lint

# Format all code 
pnpm format

# Type checking across all packages
pnpm typecheck
```

### 2. Build Verification
```bash
# Ensure all packages build successfully
pnpm build
```

### 3. Test Execution  
```bash
# Run complete test suite
pnpm test

# For critical changes, run with coverage
pnpm test:coverage
```

## Package-Specific Completion Steps

### For `translate-cli` Changes
```bash
# Test CLI functionality
pnpm --filter translate-cli dev sample-file.md --target en --dry-run

# Verify build output
pnpm --filter translate-cli build
pnpm --filter translate-cli start --help
```

### For `worker` Changes
```bash
# Test worker commands
pnpm --filter worker dev stats --dry-run
pnpm --filter worker dev validate-env

# Build and test CLI
pnpm --filter worker build
pnpm --filter worker start --help
```

### For `shared` Library Changes
```bash
# Run tests with focus on shared package
pnpm --filter shared test

# Verify dependent packages still build
pnpm --filter translate-cli build
pnpm --filter worker build
```

### For `webhook` Changes
```bash
# Start server and test basic endpoints
pnpm --filter webhook dev &
curl -X GET http://localhost:3000/health
pkill -f "webhook"
```

## Environment & Configuration

### Environment Validation
```bash
# Verify environment setup
cp .env.example .env.test
# Edit with test values, then:
NODE_ENV=test pnpm sanity-translate validate-env
```

### GitHub Actions Validation
```bash
# Check workflow syntax (if using act or similar tools)
yamllint .github/workflows/*.yml

# Verify secrets are documented
grep -r "secrets\." .github/workflows/
```

## Translation-Specific Checks

### API Integration Tests
```bash
# Test DeepL API connectivity (requires valid key)
pnpm sanity-translate test-deepl

# Test Sanity API connectivity (requires valid token)  
pnpm sanity-translate test-sanity

# Check API quotas and limits
pnpm sanity-translate stats --json
```

### File Processing Tests
```bash
# Test markdown processing with sample files
echo "---\ntitle: Test\nlang: ja\n---\n# Test" > test.md
pnpm translate test.md --target en --dry-run
rm test.md
```

## Error Handling Verification

### Exit Code Testing
```bash
# Test various failure scenarios
pnpm translate nonexistent.md 2>/dev/null; echo "Exit: $?"
pnpm sanity-translate invalid-id 2>/dev/null; echo "Exit: $?"
```

### Log Format Validation
```bash
# Verify JSON logging works
pnpm sanity-translate stats --json | jq '.'

# Check error message clarity
pnpm translate --invalid-flag 2>&1 | head -5
```

## Documentation Updates

### After Major Changes
- Update relevant sections in `README.md` (if applicable)
- Update `CHANGELOG.md` with version changes
- Verify `CLAUDE.md` instructions remain accurate
- Check `.env.example` for new environment variables

### Code Documentation
- Ensure new functions have JSDoc comments
- Update type definitions for API changes
- Add usage examples for new CLI commands

## Pre-Commit Checklist

Before considering a task complete:

- [ ] All linting passes (`pnpm lint`)
- [ ] Code is formatted (`pnpm format`) 
- [ ] Types check successfully (`pnpm typecheck`)
- [ ] All packages build (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] New functionality is tested
- [ ] Error cases are handled appropriately
- [ ] Environment variables are documented
- [ ] CLI help text is updated for new commands
- [ ] Exit codes follow established conventions (0/10/20/30)

## Performance Considerations

### DeepL API Usage
- Verify caching is working to avoid redundant API calls
- Check quota usage after bulk operations
- Test batch processing for multiple files

### Memory & Resource Usage
```bash
# Monitor resource usage during large operations
top -pid $(pgrep -f "node.*translate")

# Test with memory constraints
NODE_OPTIONS="--max-old-space-size=512" pnpm translate large-file.md
```

## Security Validation

### Secret Management
- Verify no secrets are logged or committed
- Check that environment validation catches missing secrets
- Test HMAC verification for webhook endpoints

### Input Validation
- Test with malformed markdown files
- Verify file path traversal protection
- Check for injection vulnerabilities in CLI arguments

## Integration Testing

### End-to-End Workflows
```bash
# Test complete translation pipeline
pnpm build
# Create test article, translate, verify output
# Clean up test files
```

### GitHub Actions Simulation
- Test workflow triggers locally (if possible)
- Verify environment variable usage
- Check timeout and error handling scenarios