# Feature Specification: 多语言支持（i18n）

**Feature Branch**: `001-i18n-support`

**Created**: 2025-07-11

**Status**: Draft

**Input**: User description: "为插件新增多语言支持，可以在设置页面选择语言，默认实现中文和英语"

## Clarifications

### Session 2025-07-11

- Q: 设置面板本身是否需要在用户选择新语言后不关闭设置页就即时更新自身文字？ → A: 仅 React 组件即时更新；设置面板文字在下次打开时应用新语言

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 在设置中切换界面语言（Priority: P1）

用户打开插件的设置页面，在语言选项中选择自己偏好的语言（中文或英语），整个插件界面（包括设置面板、阅读器控件、工具栏提示、通知消息等）立即切换为所选语言显示，无需重启 Obsidian。

**Why this priority**: 这是多语言功能的核心——用户能够选择并使用自己理解的语言来操作插件。没有此功能，多语言支持无从谈起。

**Independent Test**: 打开设置 → 切换语言 → 验证界面文字立即变为目标语言，无需重新打开插件或重启 Obsidian。

**Acceptance Scenarios**:

1. **Given** 插件已安装且默认为中文界面，**When** 用户打开设置页面，**Then** 看到语言选项，默认选中"中文"
2. **Given** 设置页面中语言选项显示"中文"，**When** 用户选择"English"，**Then** 阅读器工具栏、菜单项等 React 组件区域立即切换为英文显示；设置面板文字在下次打开时以英文呈现
3. **Given** 当前语言为英文，**When** 用户关闭并重新打开 Obsidian，**Then** 插件界面保持英文显示
4. **Given** 用户将语言切换为中文，**When** 查看设置页中的语言下拉选项本身，**Then** 该选项的标签也以中文显示（"语言"而非"Language"）

---

### User Story 2 - 默认语言的合理选择（Priority: P2）

用户首次安装插件时，插件根据 Obsidian 的界面语言自动选择匹配的语言。如果 Obsidian 使用中文，则插件默认显示中文；否则默认显示英文。

**Why this priority**: 良好的首次体验能减少用户手动切换语言的操作，降低使用门槛。但相比手动切换功能，这是增强而非必需。

**Independent Test**: 在不同语言的 Obsidian 环境中全新安装插件，验证默认语言是否正确匹配。

**Acceptance Scenarios**:

1. **Given** Obsidian 界面语言为中文且插件首次加载，**When** 用户打开插件，**Then** 插件界面默认显示中文
2. **Given** Obsidian 界面语言为英文（或其他非中文语言）且插件首次加载，**When** 用户打开插件，**Then** 插件界面默认显示英文
3. **Given** 用户之前手动选择过语言，**When** 插件再次加载，**Then** 以用户手动选择的语言为准，不自动覆盖

---

### User Story 3 - 完整的中英文翻译覆盖（Priority: P1）

插件中所有用户可见的文字（包括设置项标签与描述、阅读器控件按钮提示、菜单项、通知/错误消息、快捷键名称等）均有对应的中文和英文翻译，不存在遗漏或显示翻译键名（如 `settings.language.label`）的情况。

**Why this priority**: 与 P1 核心功能同等重要——即使有切换功能，如果翻译不完整，用户体验仍然糟糕。

**Independent Test**: 分别在中文和英文模式下，操作插件的所有功能页面和控件，检查是否存在未翻译的文字或显示原始键名。

**Acceptance Scenarios**:

1. **Given** 界面语言设为中文，**When** 用户浏览设置页面的每一项，**Then** 所有标签、描述、分组标题均为中文
2. **Given** 界面语言设为英文，**When** 用户浏览设置页面的每一项，**Then** 所有标签、描述、分组标题均为英文
3. **Given** 界面语言设为中文，**When** 用户触发各类通知和错误提示，**Then** 所有消息以中文显示
4. **Given** 任一语言模式下，**When** 用户使用插件所有功能，**Then** 不会出现如 `i18n.key.not.found` 之类的翻译键名

---

### Edge Cases

- 当翻译文件中缺少某个键的翻译时，系统回退显示英文文本（英文作为基础语言的兜底），同时不显示原始键名
- 当用户在移动端（Android/iOS）切换语言时，与桌面端行为一致，界面即时更新
- 语言配置文件损坏或无法读取时，系统回退到英文并记录警告
- 用户通过直接编辑 Obsidian 的 `data.json` 将语言值设为不支持的值（如 `"fr"`）时，系统回退到英文
- 设置页面本身的语言选项标签，需要随当前语言变化（中文模式下显示"语言"，英文模式下显示"Language"）

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系统 MUST 提供语言选择设置项，以 Obsidian 标准下拉框（dropdown）形式呈现在插件设置页面中
- **FR-002**: 系统 MUST 支持至少两种语言：简体中文（`zh`）和英语（`en`），其中英语作为回退语言
- **FR-003**: 用户切换语言后，系统 MUST 立即更新所有 React 渲染的界面文字（阅读器控件、工具栏、菜单等），无需刷新或重启；设置面板（Obsidian SettingTab）的文字在下次打开该面板时以新语言呈现，行为与 Obsidian 原生一致
- **FR-004**: 系统 MUST 在插件首次加载时，根据 Obsidian 界面语言自动选择默认语言（Obsidian 为中文则选中文，否则选英文）
- **FR-005**: 系统 MUST 将用户的语言选择持久化到 Obsidian 插件数据中，后续启动时恢复用户选择
- **FR-006**: 系统 MUST 为所有用户可见文字提供完整的中英文翻译，设置项标签、描述、按钮提示、菜单项、通知消息、错误提示均须覆盖
- **FR-007**: 系统 MUST 在翻译键缺失时回退显示英文文本，且不得显示翻译键名
- **FR-008**: 系统 MUST 在桌面端和移动端（Android/iOS）上均支持语言切换，行为一致
- **FR-009**: 翻译资源 MUST 以独立模块/文件组织，与业务逻辑代码分离

### Key Entities

- **翻译资源（Translation Resource）**: 一组键值对，键为翻译标识符（如 `settings.language`），值为对应语言的实际文字。每种语言一个独立资源文件（如 `zh.json`、`en.json`）
- **语言设置（Language Setting）**: 用户在设置页面的选择值，存储于 Obsidian 插件设置数据中，包含当前语言代码（`zh` 或 `en`）

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 用户从打开设置到完成语言切换，整个过程在 5 秒内完成（不含首次加载翻译资源）
- **SC-002**: 所有用户可见文字中，中文和英文的翻译覆盖率达到 100%，不存在未翻译的硬编码文字
- **SC-003**: 在翻译键缺失的异常情况下，100% 的场景回退显示英文而非原始键名，用户无感知异常
- **SC-004**: 语言切换在桌面端和移动端（Android/iOS）上表现一致，无平台特有缺陷
- **SC-005**: 用户手动选择的语言在 Obsidian 重启后正确保持，不出现回退为默认语言的问题

## Assumptions

- 翻译资源文件作为静态资源打包在插件中，不涉及运行时从外部加载
- 多语言功能仅覆盖插件自有 UI，不处理 EPUB/PDF 等阅读内容本身的翻译
- 翻译键名使用点分隔的层级命名规范（如 `settings.language.label`）
- Obsidian 的语言设置可通过 `moment.locale()` 或 `navigator.language` 获取
- 新增语言时将翻译文件放置在约定目录并以语言代码命名，不涉及 UI 界面的调整
- 插件的 React 组件和 Obsidian 设置面板均在同一 i18n 机制下管理

## Constitution Check

- **I. Engine-UI Separation**: i18n 属于 UI 层关注点，翻译函数作为独立工具模块（非 engine 层），不违反 engine-UI 分离原则
- **II. Event-Driven Decoupling**: 语言切换通过标准的 Obsidian 设置变更流程触发，UI 组件通过 i18n 工具模块响应式获取翻译文本
- **III. Cross-Platform Compatibility**: 语言切换逻辑不依赖桌面特有 API，在移动端同样可用
- **IV. Obsidian Ecosystem Compliance**: 设置项通过 `loadData()`/`saveData()` 持久化，使用标准 Obsidian setting UI API
- **V. Code Quality Baseline**: 新增代码须通过 `bun run check` 和 `bun run format`
- **VI. Testable Engine Layer**: i18n 工具模块须有对应的 Vitest 单元测试
