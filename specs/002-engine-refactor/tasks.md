# Tasks: 重构 Engine 层

**Input**: Design documents from `specs/002-engine-refactor/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/engine-api.md ✅, quickstart.md ✅

**Tests**: User Story 5 明确要求测试覆盖率提升至 80%。任务包含对应测试任务。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup（环境与基线）

**Purpose**: 确认重构前基线，准备测试基础设施

- [x] T001 运行 `bun run check && bun run test` 确认重构前基线全部通过
- [x] T002 [P] 创建 `src/engine/__tests__/` 目录（测试集中目录）
- [x] T003 [P] 将现有测试文件移入 `src/engine/__tests__/` 并更新 vitest 配置中的 include 路径

---

## Phase 2: Foundational（类型与接口定义）

**Purpose**: 定义重构所需的内部接口和类型，这些是后续所有模块工作的基础

**⚠️ CRITICAL**: 所有 User Story 阶段依赖此阶段完成

- [x] T004 在 `src/engine/engineTypes.ts` 中新增 `IFoliateViewAdapter` 接口定义（参考 `contracts/engine-api.md`）
- [x] T005 [P] 在 `src/engine/engineTypes.ts` 中新增 `IAnnotationRenderer` 接口定义（参考 `contracts/engine-api.md`）
- [x] T006 [P] 在 `src/engine/engineTypes.ts` 中新增 `IAndroidPatcher` 接口定义（enable/disable 方法）
- [x] T007 确认 `EngineEventMap`、`EngineEventBus`、`ReaderSettings`、`OpenOptions`、`AddAnnotationParams` 类型定义不变，添加 JSDoc 注释

**Checkpoint**: 接口定义就绪，可以并行开始 User Story 实现

---

## Phase 3: User Story 1 - Engine 层模块职责清晰可维护 (Priority: P1) 🎯 MVP

**Goal**: 将 `ReaderEngine` 分解为职责单一模块，创建 `FoliateViewAdapter`、`BookLoader`、`AnnotationRenderer`，精简门面

**Independent Test**: 开发者查看 `src/engine/` 目录，各模块职责可通过文件名定位

### Implementation for User Story 1

- [x] T008 [P] [US1] 创建 `src/engine/FoliateViewAdapter.ts`，实现 `IFoliateViewAdapter` 接口，封装 foliate-js 视图操作（open/init/close/goTo/next/prev/addAnnotation/deleteAnnotation/resolveNavigation/getCFI/renderer）
- [x] T009 [P] [US1] 创建 `src/engine/BookLoader.ts`，从现有 `bookLoader.ts` 提取加载管道，内部步骤函数化（readFile → createView → applyPatches → openBook → applySettings → extractMetadata → installListeners → initRenderer），保持 `BookLoaderCallbacks` 和 `BookLoaderOptions` 接口不变
- [x] T010 [US1] 创建 `src/engine/AnnotationRenderer.ts`，实现 `IAnnotationRenderer` 接口，从 `ReaderEngine` 迁移 `appliedOverlayMap`、`syncOverlays()`、`installCreateOverlayListener` 和 `installAnnotationRendering` 逻辑（FR-005）
- [x] T011 [US1] 重构 `src/engine/ReaderEngine.ts`：使用 `FoliateViewAdapter`、`BookLoader`、`AnnotationRenderer` 替代内联逻辑，精简为门面协调器；`open()` 方法委托给 `BookLoader.load()`，保持公共 API 签名不变（FR-009）
- [x] T012 [US1] 更新 `src/engine/ReaderEngine.ts` 的 `close()` 方法：调用 `AnnotationRenderer.uninstall()`、清理 `FoliateViewAdapter`、调用 `disableAndroidPatches()`（FR-007）
- [x] T013 [US1] 删除旧的 `src/engine/bookLoader.ts`（已迁移到 `BookLoader.ts`）
- [x] T014 [US1] 运行 `bun run check` 修复所有类型和 lint 错误；运行 `bun run test` 确保现有测试通过

**Checkpoint**: 新模块就绪，`ReaderEngine` 精简，所有现有功能正常

---

## Phase 4: User Story 2 - 状态管理与事件流一致可靠 (Priority: P1)

**Goal**: 统一事件发射规则，实现标注操作串行队列，定义显式状态转换规则

**Independent Test**: 自动化测试覆盖所有标注操作和状态转换路径，验证事件发射一致性

### Implementation for User Story 2

- [x] T015 [US2] 修复 `src/engine/AnnotationManager.ts`：`setAnnotations()` 方法增加 `this.bus.emit('annotations-changed', ...)` 调用，使事件发射与 `addAnnotation`/`deleteAnnotation` 一致（FR-003）
- [x] T016 [US2] 在 `src/engine/AnnotationRenderer.ts` 中实现内部串行队列（Promise 链），确保 `syncOverlays()` 内的 `addAnnotation`/`deleteAnnotation` 调用顺序执行（FR-003 后半）
- [x] T017 [US2] 在 `src/engine/ReaderEngine.ts` 中实现显式状态转换规则：`open()` 接受 `idle`/`closed`，拒绝 `loading`/`ready`（FR-006）；`close()` 在 `loading` 状态下中断加载并释放资源
- [x] T018 [US2] 运行 `bun run check && bun run test` 修复回归

**Checkpoint**: 状态管理一致，串行队列运行，状态转换显式定义

---

## Phase 5: User Story 4 - 依赖注入取代动态导入 (Priority: P2)

**Goal**: Engine 层模块通过构造函数参数注入依赖，消除 `await import(...)` 形式的动态导入（foliate-js 例外）

**Independent Test**: 检查 engine 层源码，不存在对外部 engine 模块的动态导入调用

### Implementation for User Story 4

- [x] T019 [US4] 重构 `src/engine/ReaderEngine.ts` 构造函数：通过参数接收 `IAnnotationRenderer` 和 `IFoliateViewAdapter` 接口（或工厂函数），移除 `open()` 中的动态导入
- [x] T020 [US4] 重构 `src/engine/ReaderEngine.ts`：将 `this.selectionDetector` 也改为通过构造函数注入（或通过工厂），便于测试 mock
- [x] T021 [US4] 在 `src/engine/BookLoader.ts` 中保留 `await import('foliate-js/...')` 动态导入（符合 US4 例外条款），但将 engine 内部模块的导入改为静态 `import` 语句
- [x] T022 [US4] 更新 `src/services/ReaderController.ts` 或引擎消费者代码（如有变化）以适配新的构造函数签名
- [x] T023 [US4] 运行 `bun run check && bun run test` 确保无回归

**Checkpoint**: Engine 层无动态导入（foliate-js 例外），依赖关系类型可见

---

## Phase 6: User Story 3 - 阅读体验与性能不受影响 + 兼容性验证 (Priority: P1)

**Goal**: 验证重构后所有现有功能正常，性能不倒退，向后兼容性 100%

**Independent Test**: 冒烟测试全部通过，书籍打开时间 ≤ 重构前 110%

### Implementation for User Story 3

- [x] T024 [US3] 合并 `src/engine/foliateKeyboard.ts` 的键盘导航逻辑到 `src/engine/foliateNavigation.ts`，删除 `foliateKeyboard.ts`
- [x] T025 [US3] 将 `src/engine/androidPatches.ts` 中的模块级函数（`enableAndroidPatches`/`disableAndroidPatches`）重构为 `AndroidPatcher` 类实现 `IAndroidPatcher` 接口，支持引用计数避免嵌套启用问题
- [x] T026 [US3] 在 `src/engine/BookLoader.ts` 中确保 PDF/EPUB 格式差异处理集中在适配层，核心加载管道不包含格式特定分支（FR-008）
- [x] T027 [US3] 运行全量回归：`bun run check` 零错误（SC-006）、`bun run test` 全部通过（SC-005）
- [x] T028 [US3] 按照 `quickstart.md` 执行冒烟测试 9 项 + Edge Case 5 项验证（手动）
- [ ] T029 [US3] 手工验证书籍打开时间（SC-007），对比重构前后大文件（>10MB EPUB）加载时间（手动）

**Checkpoint**: 所有功能正常，性能无倒退，向后兼容

---

## Phase 7: User Story 5 - Engine 层测试覆盖率提升 (Priority: P3)

**Goal**: Engine 层每个模块有对应测试文件，语句覆盖率 ≥ 80%

**Independent Test**: `bun run test -- --coverage` 输出 engine 层覆盖率 ≥ 80%

### Tests for User Story 5

- [x] T030 [P] [US5] 编写 `src/engine/__tests__/FoliateViewAdapter.test.ts`：mock foliate-js，覆盖 open/init/close/goTo/next/prev/addAnnotation/deleteAnnotation 方法
- [x] T031 [P] [US5] 编写 `src/engine/__tests__/BookLoader.test.ts`：从旧文件迁移并扩展，覆盖文件不存在、EPUB 加载、PDF 加载、设置应用、失败清理、Android 补丁启用等场景
- [x] T032 [P] [US5] 编写 `src/engine/__tests__/AnnotationRenderer.test.ts`：覆盖 install/syncOverlays/串行队列/uninstall，验证 appliedOverlayMap 增删逻辑
- [x] T033 [P] [US5] 扩展 `src/engine/__tests__/AnnotationManager.test.ts`：新增 `setAnnotations` 触发事件的测试用例
- [x] T034 [P] [US5] 扩展 `src/engine/__tests__/ReaderEngine.test.ts`：新增状态转换测试（idle→loading→ready→closed→idle 循环）、loading 中 close 测试、重复 open 拒绝测试
- [x] T035 [P] [US5] 编写 `src/engine/__tests__/foliateNavigation.test.ts`：覆盖 navigateFoliate/goToSection/goNext/goPrev/goToFirstSection/goToLastSection/installRelocateListener

### Implementation for User Story 5

- [x] T036 [US5] 运行 `bun run test -- --coverage --coverage.include='src/engine/**'` 验证 engine 层语句覆盖率 ≥ 80%（SC-003）
- [x] T037 [US5] 补充遗漏覆盖路径的测试用例，直到覆盖率达标

**Checkpoint**: 覆盖率 ≥ 80%，测试全部通过

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 代码清理、文档更新、最终验证

- [x] T038 [P] 运行 `bun run format` 统一所有 engine 文件格式
- [x] T039 [P] 运行循环依赖检测工具验证 `src/engine/` 下无循环依赖（SC-004）
- [x] T040 [P] 检查 `src/engine/ReaderEngine.ts` 公共方法 ≤ 12 个且文件 ≤ 200 行（SC-001）
- [x] T041 [P] 检查 `src/engine/BookLoader.ts` 总行数 ≤ 80 且每个内部步骤函数 ≤ 40 行（SC-002）
- [x] T042 按照 `quickstart.md` 完整验证清单逐项确认
- [x] T043 运行 `bun run check && bun run test && bun run format:check` 最终质量门

---

## Phase 9: Convergence

**Purpose**: 收敛 `/speckit.converge` 发现的 spec/plan/tasks 与当前实现的差距

- [x] T044 进一步精简 `src/engine/ReaderEngine.ts` 使公共方法 ≤12 且文件 ≤200 行 per SC-001 (partial)：将导航方法（navigate/goToSection/goNext/goPrev）委托给独立的 `NavigationCoordinator` 或直接由调用方通过 `foliateNavigation` 静态函数调用
- [x] T045 将 `src/engine/BookLoader.ts` 的大步骤函数（如 `openBook` 中的 EPUB/PDF 分支处理）提取为独立工具函数或策略类 per SC-002 (partial)，目标总行数 ≤80
- [x] T046 将 `src/engine/ReaderEngine.ts` 中的 `new AnnotationRenderer()` 改为通过构造函数参数注入 `IAnnotationRenderer` per US4/T019 (partial)，默认值保持向后兼容
- [ ] T047 [US3] 手工验证书籍打开时间 per SC-007/T029 (missing)：对比重构前后大文件（>10MB EPUB）加载时间，确认 ≤110%

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — Core refactoring
- **US2 (Phase 4)**: Depends on US1 — State management builds on new modules
- **US4 (Phase 5)**: Depends on US1+US2 — DI conversion after modules stable
- **US3 (Phase 6)**: Depends on US1+US2+US4 — Compatibility validation after refactoring complete
- **US5 (Phase 7)**: Depends on US1+US2+US4 — Tests for finalized modules
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

```text
Phase 2 (Foundational)
    ↓
Phase 3 (US1: 模块分解)
    ↓
Phase 4 (US2: 状态管理)
    ↓
Phase 5 (US4: 依赖注入)
    ↓
Phase 6 (US3: 兼容性验证)
    ↓
Phase 7 (US5: 测试覆盖)
    ↓
Phase 8 (Polish)
```

### Within Each User Story

- New module creation tasks marked [P] can run in parallel
- Module creation → ReaderEngine refactoring → cleanup → verify

### Parallel Opportunities

- Phase 2: T004, T005, T006 can run in parallel (different interface definitions)
- Phase 3: T008, T009 can run in parallel (FoliateViewAdapter and BookLoader are independent new files)
- Phase 7: T030-T035 (6 test files) can ALL run in parallel (different test files)
- Phase 8: T038, T039, T040, T041 can run in parallel

---

## Parallel Example: Phase 7 (US5 Tests)

```bash
# Launch all 6 test file tasks simultaneously:
Task: "编写 src/engine/__tests__/FoliateViewAdapter.test.ts"
Task: "编写 src/engine/__tests__/BookLoader.test.ts"
Task: "编写 src/engine/__tests__/AnnotationRenderer.test.ts"
Task: "扩展 src/engine/__tests__/AnnotationManager.test.ts"
Task: "扩展 src/engine/__tests__/ReaderEngine.test.ts"
Task: "编写 src/engine/__tests__/foliateNavigation.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 - Module decomposition
4. **STOP and VALIDATE**: `bun run check && bun run test` 通过
5. 新模块结构可被其他开发者审查和验证

### Incremental Delivery

1. Setup + Foundational → 接口定义就绪
2. US1 → 模块分解完成，现有功能保持 → **MVP!**
3. US2 → 状态管理一致化
4. US4 → 依赖注入清晰化
5. US3 → 兼容性验证通过
6. US5 → 测试覆盖率达标
7. Polish → 最终质量门

### Suggested MVP Scope

**Phase 1-3 (T001-T014)** 即为 MVP：

- 新模块创建（FoliateViewAdapter、BookLoader、AnnotationRenderer）
- ReaderEngine 精简为门面
- 现有测试全部通过
- 即可交付审查，后续 Phase 增量叠加

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 每个 Phase 结束时运行 `bun run check && bun run test` 确保不积累问题
- foliate-js 动态导入在 `BookLoader.ts` 中保留（US4 例外条款）
- 公共 API（`ReaderEngine` 方法签名、`EngineEventBus` 事件契约）必须保持向后兼容
- Commit after each task or logical group
