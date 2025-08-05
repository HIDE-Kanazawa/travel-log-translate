# Code Style & Conventions

## TypeScript Configuration
- **Strict mode**: Enabled with all strict checks
- **Unused variables/parameters**: Error on unused (except `^_` prefix pattern)
- **ESLint**: `eslint:recommended` base configuration
- **Target**: ES2022 with ESNext modules
- **Console**: Warnings for console.log, allow console.warn/error

## Code Formatting (Prettier)
```json
{
  "semi": true,                    // Always use semicolons
  "trailingComma": "es5",         // Trailing commas in ES5-valid locations
  "singleQuote": true,            // Use single quotes for strings  
  "printWidth": 100,              // 100 character line width
  "tabWidth": 2,                  // 2-space indentation
  "useTabs": false,               // Spaces, not tabs
  "bracketSpacing": true,         // Spaces in object literals
  "arrowParens": "avoid",         // Omit parens when possible in arrows
  "endOfLine": "lf"               // Unix line endings
}
```

## File Organization & Naming

### Package Structure
```
packages/<package-name>/
├── src/
│   ├── index.ts          # Main entry point
│   ├── types/           # Type definitions
│   ├── utils/           # Utility functions  
│   └── services/        # Business logic services
├── tests/               # Test files
├── package.json         # Package configuration
├── tsconfig.json        # TypeScript config
└── vitest.config.ts     # Test configuration
```

### Naming Conventions
- **Files**: kebab-case (e.g., `translation-engine.ts`)
- **Directories**: kebab-case (e.g., `translate-cli/`)
- **Functions**: camelCase (e.g., `translateDocument`)
- **Types/Interfaces**: PascalCase (e.g., `TranslationResult`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `SUPPORTED_LANGUAGES`)

## Import/Export Patterns

### Barrel Exports
- Use `index.ts` files to re-export from subdirectories
- Export utilities and types from shared package

### Import Ordering
1. Node.js built-ins
2. Third-party dependencies  
3. Workspace dependencies (`workspace:^`)
4. Relative imports

## Error Handling Conventions

### Exit Codes
- **0**: Success
- **10**: Validation errors
- **20**: API/quota limits (DeepL)
- **30**: Connection/authentication errors

### Error Logging
- Use structured logging with `--json` flag support
- Preserve error context for debugging
- Clear error messages for user-facing CLI

## Testing Patterns

### Framework: Vitest
- **Coverage target**: 80%+ for shared libraries
- **Test organization**: Co-locate tests in `/tests` directories
- **Naming**: `*.test.ts` for test files

### Test Types
- **Unit tests**: Individual functions and modules
- **Integration tests**: End-to-end CLI workflows
- **HMAC tests**: Webhook security validation

## Documentation Style

### Comments
- **JSDoc**: Use for public APIs and complex functions
- **Inline comments**: Explain business logic, not obvious code
- **TODO comments**: Include GitHub issues when possible

### README Structure
- Japanese first (primary audience)
- English summaries
- Clear setup/usage sections
- Environment variable documentation

## API Design Patterns

### CLI Design
- **Commander.js**: Consistent command structure
- **Options**: Kebab-case flags (e.g., `--dry-run`)
- **Arguments**: Positional for required inputs
- **Help**: Clear descriptions with examples

### Function Signatures
- **Parameters**: Required first, options object last
- **Return types**: Explicit TypeScript return types
- **Async**: Use async/await, avoid Promise constructors

### Environment Variables
- **Validation**: Use Zod schemas for runtime checks
- **Naming**: SCREAMING_SNAKE_CASE with service prefixes
- **Documentation**: Clear descriptions in `.env.example`

## Package.json Standards

### Scripts
- **start**: `node dist/index.js` (production)
- **dev**: `tsx src/index.ts` (development)
- **build**: `tsc` (compilation)
- **test**: `vitest` (testing)
- **lint**: `eslint src/**/*.ts` (linting)
- **format**: `prettier --write src/**/*.ts` (formatting)
- **typecheck**: `tsc --noEmit` (type checking)

### Dependencies
- **Exact versions**: Use caret ranges (e.g., `^1.2.3`)
- **Workspace deps**: Use `workspace:^` for internal packages
- **DevDeps**: Keep dev tools in root when possible