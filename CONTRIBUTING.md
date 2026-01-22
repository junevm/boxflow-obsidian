# Contributing to Boxflow

First off, thanks for taking the time to contribute! Boxflow is built for the community, and we appreciate your help in making it better.

## Development Workflow

Our primary development happens on **GitLab**. GitHub is used as a mirror for distribution and Obsidian Community Plugin requirements.

- **GitLab (Main)**: [https://gitlab.com/junevm/boxflow-obsidian](https://gitlab.com/junevm/boxflow-obsidian)
- **GitHub (Mirror)**: [https://github.com/junevm/boxflow-obsidian](https://github.com/junevm/boxflow-obsidian)

Please submit all Merge Requests (MRs) and Issues to the **GitLab** repository.

## Getting Started

1. Fork the repository on GitLab.
2. Clone your fork locally.
3. Install [mise-en-place](https://mise.jdx.dev/) (recommended) or use `npm`.
4. Run `mise run setup` to install project tools and dependencies.
5. Create a new branch for your feature or fix.
6. Run the development server with watch mode: `mise run watch` (or `npm run dev`).

## Implementation Details

- **React**: The UI is built with React 19.
- **Styles**: Use the Material 3 design tokens defined in `styles.css`.
- **Data**: We use a hidden code block (` ```boxflow ... ``` `) to store structured data. Ensure your changes maintain data integrity during parsing.

## Submitting Changes

1. Ensure your code passes linting: `npm run lint`.
2. Commit your changes with clear, descriptive messages.
3. Push to your fork and submit a Merge Request on GitLab.

## Code of Conduct

Be kind, keep it simple, and focus on the user experience.

---

Thank you for being part of Boxflow!
