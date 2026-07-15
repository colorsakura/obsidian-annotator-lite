# Feature Specification: 重构 Engine 层

**Feature Branch**: `002-engine-refactor`

**Created**: 2025-07-15

**Status**: Draft

**Input**: User description: "重构engine层"

## Clarifications

### Session 2025-07-15

- Q: 重构后标注 overlay 同步应该采用何种异步策略？ → A: 返回 awaitable Promise，调用方可选等待（兼容 fire-and-forget）
- Q: `close()` 后引擎是否可以复用（重新 `open()`）？ → A: 可复用，`open()` 接受 `idle` 或 `closed` 状态，自动重置内部资源
- Q: 标注操作（增/删/改）的并发控制策略是什么？ → A: 引擎内部串行队列，同一时刻只有一个标注操作在执行

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Engine 层模块职责清晰可维护 (Priority: P1)

开发者阅读和修改 engine 层代码时，每个模块的职责边界清晰，单一模块的变更不会产生意外的级联影响。`ReaderEngine` 不再是一个承担所有协调逻辑的大类，而是将书籍加载、标注管理、选择检测、主题应用等关注点分离到专注的、可独立测试的模块中。

**Why this priority**: Engine 层是插件最核心、最复杂的部分。当前的 `ReaderEngine` 和 `bookLoader` 承担了过多职责，代码难以理解和维护。这是重构的首要目标——让代码结构变得清晰，降低后续所有修改的风险。

**Independent Test**: 开发者查看 engine 目录下各文件的导出，每个模块的职责可以通过文件名和导出的符号名一目了然，无需阅读全部源码即可理解其功能边界。

**Acceptance Scenarios**:

1. **Given** engine 层重构完成，**When** 新开发者查看 `src/engine/` 目录结构，**Then** 能通过文件名快速定位到每个功能的实现位置
2. **Given** 需要修改阅读设置逻辑，**When** 开发者修改设置相关模块，**Then** 该变更不会影响到标注管理或导航模块的代码
3. **Given** 需要新增一种书籍格式支持，**When** 开发者修改书籍加载相关模块，**Then** 只需改动格式相关的适配代码，不需要理解标注或选择检测逻辑

---

### User Story 2 - 状态管理与事件流一致可靠 (Priority: P1)

Engine 层内部的状态转换和事件发射遵循一致的规则。所有标注变更（包括替换全部标注）都触发相同的事件通知，异步操作有明确的错误处理和恢复机制，不存在"静默失败"或状态不一致的情况。

**Why this priority**: 当前存在状态管理不一致的问题（如 `setAnnotations` 不触发事件、`syncOverlays` 异步执行但不等待结果），这会导致难以调试的 bug。一致的状态管理是可靠性的基础。

**Independent Test**: 编写自动化测试，覆盖所有标注操作和状态转换路径，验证事件发射次数和状态变化的一致性。

**Acceptance Scenarios**:

1. **Given** 外部调用 `setAnnotations` 替换全部标注，**When** 替换完成，**Then** 引擎触发 `annotations-changed` 事件通知所有订阅者
2. **Given** 引擎在 `loading` 或 `closed` 状态下收到标注操作请求，**When** 调用方法，**Then** 返回明确的错误或在 idle 状态下静默忽略（行为有文档说明）
3. **Given** overlay 同步过程中发生异常，**When** 某个标注无法渲染，**Then** 引擎记录警告日志且不影响其他标注的渲染，不丢失标注数据；若调用方 await 了同步操作，可通过 rejected Promise 获知失败

---

### User Story 3 - 阅读体验与性能不受影响 (Priority: P1)

重构后，用户使用插件的体验与重构前完全一致。书籍打开速度、翻页响应、标注创建/删除等操作的感知延迟不增加。所有现有功能（EPUB/PDF 阅读、标注增删改、设置切换、目录导航、键盘翻页、暗色模式、移动端兼容）正常工作，不引入回归 bug。

**Why this priority**: 重构不能牺牲用户体验。用户不关心内部架构，只关心功能是否正常、是否变快。这是重构成功的底线标准。

**Independent Test**: 使用重构前后的插件版本，分别在桌面端和移动端打开同一本书，执行标注创建、删除、导航、设置切换等操作，主观体验无明显差异。

**Acceptance Scenarios**:

1. **Given** 用户打开一本 EPUB 书籍，**When** 书籍加载完成，**Then** 打开时间不超过重构前的 110%
2. **Given** 用户在阅读中创建标注，**When** 标注创建完成，**Then** 高亮立即显示且无闪烁或延迟
3. **Given** 用户在暗色模式下阅读，**When** 切换章节，**Then** 新章节正确应用暗色主题样式
4. **Given** 用户在 Android 移动端阅读，**When** 打开书籍并翻页，**Then** 内容正常显示，无空白页或加载失败
5. **Given** 用户同时打开多个标注，**When** 删除其中一个，**Then** 其余标注不受影响，界面正确更新

---

### User Story 4 - 依赖注入取代动态导入 (Priority: P2)

Engine 层的模块依赖通过构造函数或函数参数显式注入，而非在运行时通过 `import()` 动态加载。这消除动态导入带来的延迟不确定性，同时让模块的依赖关系在类型层面可见。

**Why this priority**: 动态导入在运行时引入额外的异步开销和潜在的加载失败点，且使依赖关系难以追踪。改为显式依赖注入后，代码更容易推理和测试。但相比职责分离（P1），这是优化而非必需。

**Independent Test**: 检查 engine 层源码，不存在 `await import(...)` 形式的动态导入调用（对于需要根据条件加载的大型模块如 foliate-js 可以例外）。

**Acceptance Scenarios**:

1. **Given** 重构后的 `ReaderEngine`，**When** 开发者查看其构造函数，**Then** 所有运行所需的依赖通过参数列出，类型可见
2. **Given** 需要 mock 导航功能进行单元测试，**When** 编写测试，**Then** 可以通过注入 mock 实现来替换真实导航模块，无需 mock 动态导入

---

### User Story 5 - Engine 层测试覆盖率提升 (Priority: P3)

Engine 层每个模块都有对应的单元测试文件，核心路径（书籍加载、标注 CRUD、选择检测、状态转换）的测试覆盖率不低于 80%。测试不依赖 Obsidian 运行时或真实 DOM，运行速度快且稳定。

**Why this priority**: 测试是重构信心的来源——有测试保障才能放心重构。但测试本身是重构的产物和手段，优先级略低于架构改进本身。

**Independent Test**: 运行 `bun run test -- --coverage`，engine 目录下的覆盖率报告满足目标。

**Acceptance Scenarios**:

1. **Given** engine 层模块，**When** 运行单元测试，**Then** 存在对应的 `.test.ts` 文件，覆盖主要公共 API
2. **Given** 测试文件，**When** 审查测试内容，**Then** 测试通过 mock/stub 隔离外部依赖，不依赖真实的 Obsidian App 或 foliate-js 实例

---

### Edge Cases

- 当 foliate-js 版本升级导致 API 变化时，受影响的代码应集中在 foliate-js 适配层（如 `foliateViewAdapter`），不扩散到业务逻辑层
- 当引擎在 `loading` 状态下被请求 `close()` 时，应能正确中断加载并释放已分配资源
- 当书籍文件在加载后被外部删除或移动时，引擎不应崩溃，且后续导航操作返回明确错误
- Android 平台兼容补丁的作用域应限制在必要时段，引擎关闭后须恢复原始原型
- PDF 和 EPUB 的处理路径差异应在适配层封装，核心引擎不应包含格式特定的分支逻辑
- 当多个标注操作快速连续发生时（如批量删除），引擎内部通过串行队列确保每次操作的状态一致性，不出现重叠冲突

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系统 MUST 将 `ReaderEngine` 分解为职责单一的模块：生命周期管理、书籍加载、标注管理、选择检测、视图适配，每个模块独立文件和独立接口
- **FR-002**: 系统 MUST 为 foliate-js 视图操作提供统一的类型安全适配层，消除代码中 `(view as any)` 式的类型断言分散出现的情况
- **FR-003**: 系统 MUST 确保所有标注变更路径（增/删/改/批量替换）触发一致的事件通知，且各操作返回 awaitable Promise，调用方可选等待渲染完成；引擎内部通过串行队列确保同一时刻仅一个标注变更操作在执行
- **FR-004**: 系统 MUST 为 `bookLoader` 的加载流程提取独立步骤（文件读取、视图创建、补丁应用、元数据提取、渲染器初始化），每步职责单一
- **FR-005**: 系统 MUST 将 `appliedOverlayMap` 管理逻辑移入标注渲染相关模块，与 `ReaderEngine` 解耦
- **FR-006**: 系统 MUST 为引擎生命周期状态转换定义显式规则：`idle → loading → ready → closed`，`open()` 接受 `idle` 或 `closed` 状态并自动重置资源进入 `loading`，拒绝在 `loading` 或 `ready` 状态下重复 `open()`
- **FR-007**: 系统 MUST 确保 Android 平台补丁在引擎关闭时恢复原始原型，不残留全局副作用
- **FR-008**: 系统 MUST 将 PDF 与 EPUB 的格式差异处理集中到格式适配层，核心引擎不包含格式特定的条件分支
- **FR-009**: 系统 MUST 保持重构后的外部 API（`ReaderEngine.open`、`close`、`addAnnotation`、`deleteAnnotation`、`navigate`、`updateSettings`）签名和行为与重构前兼容
- **FR-010**: 系统 MUST 保持 `EngineEventBus` 的事件契约（事件名和 payload 类型）与重构前一致，不破坏与上层服务的兼容性

### Key Entities

- **ReaderEngine（重构后）**: 精简的引擎门面，协调各子模块的生命周期，对外暴露统一的阅读操作接口
- **FoliateViewAdapter**: foliate-js 视图元素的类型安全包装器，封装所有 `(view as any)` 调用，提供导航、渲染、设置、事件监听的统一接口
- **BookLoader**: 独立的书籍加载管道，负责从文件读取到视图初始化的完整流程，通过回调或事件报告进展
- **AnnotationManager**: 标注数据的单一数据源，保持内部状态一致性，所有变更触发事件
- **AnnotationRenderer**: 标注渲染器，管理 overlay 的创建、更新和删除，持有 `appliedOverlayMap`
- **SelectionDetector**: 文本选择检测器，在 iframe 中监听文本选择事件并转换为标注就绪数据
- **EngineState**: 引擎状态枚举及转换规则，支持 idle ⇢ loading ⇢ ready ⇢ closed ⇢ idle 循环（`open()` 从 idle 或 closed 均可进入 loading）

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 重构后 `ReaderEngine` 的公共方法不超过 12 个，单文件不超过 200 行代码
- **SC-002**: 重构后 `bookLoader` 总函数不超过 80 行，加载步骤的每个独立函数不超过 40 行
- **SC-003**: Engine 层所有模块的自动化测试语句覆盖率不低于 80%
- **SC-004**: 重构后引擎目录不存在模块间循环依赖（通过循环依赖检测工具验证）
- **SC-005**: 所有现有自动化回归测试在重构后仍然通过（100% 向后兼容现有测试用例）
- **SC-006**: 重构后通过项目代码质量检查，零错误零警告
- **SC-007**: 书籍打开时间（从调用 `open()` 到触发 `ready` 状态）不超过重构前的 110%

## Assumptions

- foliate-js 的 API 保持稳定，重构期间不升级 foliate-js 版本以避免组合变更
- 上层服务（`ReaderController`、`ReaderAPI`）通过 `EngineEventBus` 和 `ReaderEngine` 公共方法与 engine 层交互，重构不改变这些接口的契约
- 重构不涉及 UI 层（React 组件）的变更，UI 层通过现有的事件总线适配新 engine 层
- Android 移动端的 foliate-js 行为差异与重构前一致，重构不引入新的平台特定问题
- 现有关键模块（`AnnotationManager`、`SelectionDetector`）的单元测试在重构后作为回归测试保留
- 重构采用增量方式，每提取一个模块后验证现有测试通过，而非一次性重写全部代码

## Constitution Check

- **I. Engine-UI Separation**: 重构强化 engine-UI 分离——当前 engine 层已不导入 React，重构后会更清晰地划分 engine 内部模块边界，不改变与 UI 层的接口契约
- **II. Event-Driven Decoupling**: 重构将统一事件发射规则（FR-003），修复 `setAnnotations` 不触发事件的不一致问题，强化事件驱动模式
- **III. Cross-Platform Compatibility**: FR-008 要求格式和平台差异集中到适配层；FR-007 确保 Android 补丁优雅清理——重构关注跨平台兼容的健壮性
- **IV. Obsidian Ecosystem Compliance**: 重构不改变与 Obsidian API 的交互方式（文件读取、设置持久化等），保持兼容
- **V. Code Quality Baseline**: SC-006 要求 `bun run check` 零错误；SC-004 要求无循环依赖——重构后代码质量只升不降
- **VI. Testable Engine Layer**: 这是本次重构的核心目标之一（User Story 5、SC-003），模块化设计天然提升可测试性
