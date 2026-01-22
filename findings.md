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
| Decision | Rationale |
|----------|-----------|
| Use `semantic-release` | Industry standard for automated semantic versioning and releases. |
| Use Conventional Commits | Required for `semantic-release` to parse commit types (feat, fix). |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
|       |            |

## Resources
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)

## Visual/Browser Findings
- None yet.
