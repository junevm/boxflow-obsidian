# Findings & Decisions

## Requirements

- Full automated deployment for the Obsidian plugin.
- Semantic versioning (automatically determine next version based on changes).
- Automatic creation of GitHub releases with built assets.

## Research Findings

- Project uses `esbuild` for bundling.
- There is a `version-bump.mjs` script already in the project.
- `manifest.json` and `versions.json` are used for Obsidian plugin versioning.
- `package.json` contains version information.
- Existing GitHub Action: `.github/workflows/release.yml` triggers on any tag push.
- Current process requires manual `npm version` and tag pushing.
- Repository in `package.json` points to GitLab, but `.github` folder exists, suggesting GitHub is the primary or target platform.

## Technical Decisions

| Decision                             | Rationale                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| GitHub Actions as Primary            | Development happens on GitHub; all automation (versioning, releasing) is centralized here. |
| `release-it`                         | Standard Node.js tool for semantic versioning, robust and highly configurable.             |
| `@release-it/conventional-changelog` | Automates version detection and changelog maintenance using Conventional Commits.          |
| `pnpm`                               | Preferred efficient package manager.                                                       |
| Automated Publishing                 | GitHub Actions handles version bumping on `main` and asset building on tag creation.       |

## Issues Encountered

| Issue | Resolution |
| ----- | ---------- |
|       |            |

## Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)

## Visual/Browser Findings

- None yet.
