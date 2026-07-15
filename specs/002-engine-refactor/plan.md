# Implementation Plan: 重构 Engine 层

**Branch**: `002-engine-refactor` | **Date**: 2025-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-engine-refactor/spec.md`

## Summary

对 `src/engine/` 目录进行模块化重构，将当前职责混杂的 `ReaderEngine`（God class）和过程式 `bookLoader` 分解为职责单一的模块。核心策略：提取 `FoliateViewAdapter` 作为 foliate-js 的类型安全适配层，分离 `AnnotationRenderer` 持有 overlay 映射，将动态导入替换为显式依赖注入，统一事件发射与异步策略，并为所有模块补充单元测试。

## Technical Context

**Language/Version**: TypeScript 7.0 (check-only, no emit)

**Primary Dependencies**: foliate-js (GitHub dependency), Obsidian API, React 19 (UI layer only, not imported by engine)

**Storage**: N/A (engine层不涉及存储)

**Testing**: Vitest 4 + jsdom

**Target Platform**: Obsidian Desktop + Mobile (Android/iOS)，通过 esbuild 打包为单文件 `main.js`

**Project Type**: Obsidian plugin (desktop + mobile)

**Performance Goals**: 书籍打开时间不超过重构前 110%（SC-007）

**Constraints**: 零循环依赖 (SC-004)，`bun run check` 零错误 (SC-006)，100% 向后兼容现有公共 API (FR-009/010)

**Scale/Scope**: 13 个 engine 源文件 → 重构后预计 15-17 个文件，禁止引入框架级 DI 容器

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status  | Evidence                                                                               |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| I. Engine-UI Separation           | ✅ PASS | 重构强化此原则：新模块不导入 React/组件，foliate-js 调用封装在 `FoliateViewAdapter` 中 |
| II. Event-Driven Decoupling       | ✅ PASS | FR-003 统一事件发射规则，FR-010 保持事件契约不变                                       |
| III. Cross-Platform Compatibility | ✅ PASS | FR-007 确保 Android 补丁清理；FR-008 格式差异在适配层                                  |
| IV. Obsidian Ecosystem Compliance | ✅ PASS | 重构不改变 Obsidian API 交互方式                                                       |
| V. Code Quality Baseline          | ✅ PASS | SC-006 要求零错误；SC-004 无循环依赖                                                   |
| VI. Testable Engine Layer         | ✅ PASS | FR-004 (DI) 和 User Story 5 直接提升可测试性                                           |

**Gate Result**: ALL PASS — 可以进入 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/002-engine-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── engine-api.md    # 公共 API 契约
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/engine/
├── ReaderEngine.ts           # 精简门面（协调生命周期）
├── engineTypes.ts            # 类型定义（EngineEventMap, EngineState 等）
├── FoliateViewAdapter.ts     # [NEW] foliate-js 类型安全适配层
├── BookLoader.ts             # [NEW] 书籍加载管道
├── AnnotationManager.ts      # 标注数据管理（增强事件一致性）
├── AnnotationRenderer.ts     # [NEW] 标注渲染 + overlay 映射
├── SelectionDetector.ts      # 文本选择检测（保持不变）
├── readerSettings.ts         # 阅读设置应用
├── foliateNavigation.ts      # [NEW 替代] 导航操作（合并 foliateKeyboard）
├── foliateAnnotations.ts     # 标注创建/绘制事件处理
├── foliateBookMetadata.ts    # 元数据提取
├── theme.ts                  # 主题应用
├── androidPatches.ts         # Android 补丁（增强清理）
└── __tests__/                # [NEW] 集中测试目录
    ├── ReaderEngine.test.ts
    ├── engineTypes.test.ts
    ├── FoliateViewAdapter.test.ts
    ├── BookLoader.test.ts
    ├── AnnotationManager.test.ts
    ├── AnnotationRenderer.test.ts
    ├── SelectionDetector.test.ts
    └── foliateNavigation.test.ts
```

**Structure Decision**: 采用现有单项目结构，在 `src/engine/` 内重组。新增 `FoliateViewAdapter`、`BookLoader`、`AnnotationRenderer` 三个模块，将现有 `foliateKeyboard.ts` 合并入 `foliateNavigation.ts`。测试文件集中到 `__tests__/` 子目录减少根级文件数量。

## Complexity Tracking

> 无 Constitution 违规需要 justify。
