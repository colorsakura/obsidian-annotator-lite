<!--
Sync Impact Report
==================
Version change: N/A → 1.0.0 (initial creation)
Modified principles: N/A (all new)
Added sections:
  - Core Principles (6 principles)
  - Technical Constraints
  - Development Workflow
  - Governance
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed (generic)
  - .specify/templates/spec-template.md ✅ no update needed (generic)
  - .specify/templates/tasks-template.md ✅ no update needed (generic)
Follow-up TODOs: none
-->

# Obsidian Annotator Lite Constitution

## Core Principles

### I. Engine-UI Separation

Core reading logic MUST reside in the framework-agnostic
`src/engine/` layer (`ReaderEngine`, `AnnotationManager`,
`SelectionDetector`, `bookLoader`, etc.). React components
serve only as a thin adapter layer for rendering and event
bridging. Engine modules MUST NOT import from `react`,
`react-dom`, or any `src/components/` / `src/viewers/` module.

**Rationale**: Engine-UI separation enables independent
testing of core logic (Vitest without DOM), keeps the door
open for non-React UIs, and prevents React lifecycle concerns
from leaking into business logic.

### II. Event-Driven Decoupling

Components MUST communicate through typed event buses, not
direct references. The architecture defines two layers:
`EngineEventBus` for engine-internal events and
`ReaderEventBus` for view-controller communication. State
propagation from controller to views MUST go through
`ReaderSessionStore` via React Context, not imperative
method calls across module boundaries.

**Rationale**: Event-driven decoupling prevents cascading
changes when one component evolves, enables independent
development of controller and view layers, and ensures
predictable data flow direction.

### III. Cross-Platform Compatibility

Every user-facing feature MUST work on both Obsidian desktop
and mobile (Android/iOS). Code MUST NOT assume access to
desktop-only APIs (e.g., `window.open`, `popout window`,
`ownerDocument`). Mobile-specific behavior differences
SHOULD be handled through `Platform.isMobile` checks and
dedicated patch modules (e.g., `androidPatches.ts`).

**Rationale**: The plugin declares `isDesktopOnly: false` in
its manifest. A significant portion of users read on mobile
devices. Breaking mobile support is a breaking change.

### IV. Obsidian Ecosystem Compliance

The plugin MUST follow Obsidian plugin conventions: register
views via `registerView`, use `manifest.json` for metadata,
persist settings through `loadData()`/`saveData()`, and
respect the Obsidian API lifecycle. Custom DOM elements MUST
be properly cleaned up on view close. All external
dependencies MUST be bundled (no dynamic imports to CDN).

**Rationale**: Obsidian is a closed ecosystem with specific
expectations. Violating conventions leads to rejection from
the community plugin list and user-facing breakage on
Obsidian updates.

### V. Code Quality Baseline

All code MUST pass `bun run check` (ESLint + TypeScript type
checking) and `bun run format:check` (Prettier) before
commit. TypeScript strict mode is enforced — `any` types
MUST be accompanied by a `// eslint-disable` comment
explaining why. New modules SHOULD include code comments
for non-obvious logic.

**Rationale**: Consistent style and type safety reduce
regression risk and make the codebase approachable for
contributors.

### VI. Testable Engine Layer

Engine-layer modules (`src/engine/`) MUST be designed for
unit testability with Vitest. Each module SHOULD have
corresponding test files. Tests MUST NOT depend on Obsidian
runtime or DOM — use mocks/stubs for external dependencies.
Run `bun run test` before merging any engine-layer change.

**Rationale**: The engine layer is the most complex and
bug-prone part of the codebase. Unit tests at this layer
catch regressions early and serve as executable documentation
of expected behavior.

## Technical Constraints

- **Build tool**: esbuild via `build.ts` with custom plugins
  (`foliatePdfPlugin`, `ignoreCssPlugin`). CSS is built
  separately via `buildStyles()`.
- **Package manager**: bun. All scripts in `package.json`
  use `bun run`.
- **Reading engine**: foliate-js (GitHub dependency). Its
  API surface is consumed through the engine layer only.
- **UI framework**: React 19 with `createRoot` API.
  TanStack Query for async data caching.
- **Code standard**: ESLint + Prettier +
  eslint-plugin-obsidianmd. Zero lint errors in production.
- **Type checking**: TypeScript 6.0, check-only (no emit).
- **Output artifacts**: `main.js`, `styles.css`,
  `manifest.json` at plugin root. No declaration files.
- **Release**: GitHub Actions on tag push, auto-build and
  publish.

## Development Workflow

1. **Before writing code**: Run `bun run check` to confirm
   a clean baseline on the current branch.
2. **During development**: Use `bun run dev` (watch mode)
   for iterative testing in Obsidian.
3. **Before committing**: Run `bun run check` and
   `bun run format`. Fix all errors.
4. **Engine-layer changes**: Run `bun run test` to verify
   unit tests pass. Add tests for new engine modules.
5. **Production build**: Run `bun run build` which performs
   type checking + minification in one step.
6. **Code review**: Every PR MUST pass CI (build + lint +
   type check + tests). Reviewers SHOULD verify
   constitutional compliance, especially engine-UI separation
   and cross-platform compatibility.

## Governance

- This constitution is the authoritative reference for
  architectural decisions in obsidian-annotator-lite.
- All code reviews MUST verify compliance with the Core
  Principles above.
- Amendments require: (1) a written proposal explaining the
  change and rationale, (2) review of impact on dependent
  templates and existing code, (3) version bump per semver
  rules below.
- Constitution versioning follows semver:
  - **MAJOR**: Principle removal or incompatible redefinition.
  - **MINOR**: New principle or section added; material
    expansion of existing guidance.
  - **PATCH**: Wording clarification, typo fix, non-semantic
    refinement.
- Compliance review: each feature spec/plan SHOULD include a
  "Constitution Check" section verifying alignment with
  applicable principles.

**Version**: 1.0.0 | **Ratified**: 2026-06-27 | **Last Amended**: 2026-06-27
