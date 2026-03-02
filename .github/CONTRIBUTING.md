# Contributing to OpenLoaf

First off, thank you for considering contributing to OpenLoaf! It's people like you that make OpenLoaf such a great tool.

## 📝 Contributor License Agreement (CLA)

OpenLoaf uses a dual-licensing model (AGPLv3 + Commercial License). To allow us to continue providing this model, **all contributors must sign our Contributor License Agreement (CLA)**.

When you open your first Pull Request, a CLA assistant bot will automatically comment on your PR and ask you to sign the CLA using your GitHub account.

You only need to sign the CLA once. If you modify your PR or open new PRs in the future, you won't be asked to sign it again (unless the terms of the CLA change).

You can read the full text of our CLA [here](./CLA.md).

## 🚀 How to Contribute

Please read [DEVELOPMENT.md](../docs/DEVELOPMENT.md) for the complete development guide, including commit conventions, branch strategy, and PR workflow.

1. **Fork the Repository** and clone your fork locally.
2. **Install Dependencies:**
   ```bash
   pnpm install
   ```
3. **Create a Branch** for your feature or bug fix:
   ```bash
   git checkout -b feature/<scope>-<description>
   ```
4. **Make Your Changes** and ensure all existing tests and linters pass.
   ```bash
   pnpm run lint
   pnpm run check-types
   ```
5. **Commit Your Changes** following [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```bash
   # Format: <type>(<scope>): <subject>
   git commit -m "feat(web): add dark mode toggle"
   ```
   Commit messages are automatically validated by commitlint. See [DEVELOPMENT.md](../docs/DEVELOPMENT.md) for the full list of types and scopes.
6. **Push to Your Fork** and open a Pull Request against the `main` branch.

## 🐛 Reporting Bugs

If you find a bug, please create an Issue in the GitHub repository. Provide as much detail as possible, including:
- Steps to reproduce
- Expected behavior vs actual behavior
- Your environment (OS, browser, Node version)

## 💡 Suggesting Features

We welcome new ideas! Please open an Issue to discuss your feature before submitting a Pull Request, especially for large changes. This saves everyone time and ensures your PR aligns with the project's direction.

Thanks again for your support!
