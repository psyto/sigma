# Contributing to Sigma

Thank you for your interest in contributing to Sigma.

## Development Setup

### Prerequisites

- Rust 1.70+
- Solana CLI 1.17+
- Anchor 0.29+
- Node.js 18+

### Local Development

```bash
# Clone and install
git clone https://github.com/psyto/sigma.git
cd sigma
npm install

# Build
anchor build

# Test
anchor test
```

## Code Style

### Rust

- Follow standard Rust conventions
- Use `cargo fmt` before committing
- Run `cargo clippy` and address warnings
- Add doc comments for public functions

### TypeScript

- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting

## Commit Messages

Use clear, descriptive commit messages:

```
<type>: <short description>

<optional body>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat: add variance calculation to VolSwap
fix: correct TWAP calculation for edge cases
docs: update ExoticVault implementation plan
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`anchor test`)
5. Commit with clear messages
6. Push to your fork
7. Open a pull request

### PR Guidelines

- Keep changes focused and atomic
- Include tests for new functionality
- Update documentation as needed
- Reference related issues

## Testing

### Unit Tests

```bash
# Run all tests
anchor test

# Run specific program tests
anchor test --skip-local-validator -- --test <test_name>
```

### Integration Tests

```bash
# Start local validator
solana-test-validator

# Run integration tests
npm run test:integration
```

## Architecture Guidelines

### Program Design

- Keep instructions focused and single-purpose
- Use PDAs for deterministic account addresses
- Validate all inputs at instruction boundaries
- Use custom errors with descriptive messages

### State Management

- Minimize on-chain storage
- Use appropriate data types (u64 for amounts, i64 for timestamps)
- Document all state fields

### Security

- Never trust client-provided data
- Check account ownership and signatures
- Use checked math operations
- Consider reentrancy and CPI safety

## Questions?

Open an issue for questions or discussions.
