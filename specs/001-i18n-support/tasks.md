# Tasks: 多语言支持（i18n）

**Input**: Design documents from `/specs/001-i18n-support/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/i18n-api.md

**Tests**: i18n 工具模块单元测试（Constitution VI 要求）已包含

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup（项目初始化）

**Purpose**: 创建 i18n 模块目录结构

- [x] T001 Create i18n module directory structure: `src/i18n/`

---

## Phase 2: Foundational（基础设施 — 阻塞所有用户故事）

**Purpose**: 核心 i18n 模块和翻译资源，所有用户故事的前置依赖

**⚠️ CRITICAL**: 所有用户故事的实现必须在本阶段完成后才能开始

- [x] T002 Add `language` field to `AnnotatorLiteSettings` interface in `src/services/Settings.ts` (type: `'zh' | 'en' | undefined`, default: `undefined`)
- [x] T003 [P] Create i18n type definitions (`Locale`, `TranslationMap`) in `src/i18n/types.ts`
- [x] T004 [P] Create English translation resource file `src/i18n/en.json` with all translation keys (base/fallback language, must be complete)
- [x] T005 [P] Create Chinese translation resource file `src/i18n/zh.json` with all translation keys
- [x] T006 Implement core i18n module in `src/i18n/index.ts`: `t()`, `loadTranslations()`, `setLanguage()`, `getLanguage()`, `resolveDefaultLanguage()`, module-level subscriber mechanism
- [x] T007 Write unit tests for i18n module in `src/i18n/index.test.ts` (cover: translation lookup, English fallback, double-missing fallback to key, `resolveDefaultLanguage` for zh/en/other, subscriber notification on `setLanguage`)
- [x] T008 Initialize i18n module in `src/main.ts` onload: call `loadTranslations()`, resolve default language from `moment.locale()` / user setting, call `setLanguage()`

**Checkpoint**: i18n 基础设施就绪 — 用户故事开发可以开始

---

## Phase 3: User Story 1 — 在设置中切换界面语言（Priority: P1）🎯 MVP

**Goal**: 用户在设置页面通过下拉框选择语言，React 组件即时切换，设置持久化

**Independent Test**: 打开设置 → 切换语言 → 阅读器 UI 即时变为目标语言；重启 Obsidian 后设置保持

### Implementation for User Story 1

- [x] T009 [US1] Add language dropdown setting to `AnnotatorLiteSettingTab` in `src/components/SettingsTab.ts`: add `Setting` with `.addDropdown()` offering `zh` (中文) and `en` (English), default to current `settings.language`, call `setLanguage()` + `saveSettings()` on change
- [x] T010 [US1] Implement React `useT()` hook in `src/i18n/index.ts`: subscribe to module-level language changes via `useState` + `useEffect`, return `t()` bound to current locale
- [x] T011 [US1] Translate SettingsTab heading and section titles in `src/components/SettingsTab.ts`: replace hardcoded `'Annotator Lite 设置'`, `'阅读器默认设置'`, `'高亮颜色'` with `t()` calls
- [x] T012 [US1] Translate SettingsTab setting labels and descriptions in `src/components/SettingsTab.ts`: replace `.setName()`, `.setDesc()`, `.setPlaceholder()`, `.setTooltip()`, `.setButtonText()` strings with `t()` calls
- [x] T013 [US1] Translate readerHeader action labels in `src/views/readerHeader.ts`: replace hardcoded `'Open outline'`, `'Open annotations'`, `'切换滚动模式'`, `'切换为单列'`, `'切换为双列'`, `'减小字体'`, `'增大字体'`, `'返回笔记'` and dynamic aria-label strings with `t()` calls
- [x] T014 [US1] Translate ReaderViewInner placeholder strings in `src/components/ReaderViewInner.tsx`: replace `'No file selected...'`, `'Unsupported file type'`, `'Missing source path.'` with `useT()` calls
- [x] T015 [US1] Add language dropdown labels to translation files: `settings.language.label` / `settings.language.desc` in both `src/i18n/zh.json` and `src/i18n/en.json`
- [x] T016 [US1] Verify language switch triggers instant React re-render: confirm `useT()` subscribers update when `setLanguage()` is called from SettingsTab dropdown onChange

**Checkpoint**: User Story 1 完成 — 核心语言切换功能可独立验证

---

## Phase 4: User Story 2 — 默认语言的合理选择（Priority: P2）

**Goal**: 首次安装时根据 Obsidian 语言自动选择默认语言；用户手动选择后不自动覆盖

**Independent Test**: 在中文 Obsidian 中全新安装 → 默认中文；在英文 Obsidian 中全新安装 → 默认英文

### Implementation for User Story 2

- [x] T017 [US2] Implement auto-detect logic in `src/main.ts` onload: if `settings.language` is `undefined`, call `resolveDefaultLanguage(moment.locale())`, set `settings.language` to the result (but don't persist — keep `undefined` in saved data to distinguish "auto" from "user-chosen")
- [x] T018 [US2] Add `settings.language` save guard in `src/main.ts`: only persist `language` to `data.json` when user explicitly changes it in SettingsTab (not on auto-detect)
- [x] T019 [US2] Add `settings.language` validation on load in `src/main.ts` `loadSettings()`: if stored value is not `'zh'` or `'en'`, reset to `'en'` and log warning via logger
- [x] T020 [US2] Update `SettingsTab` dropdown default value logic in `src/components/SettingsTab.ts`: if `settings.language` is `undefined`, display as auto-detected language but don't show `undefined` in dropdown

**Checkpoint**: User Story 2 完成 — 首次安装自动检测 + 手动选择保持

---

## Phase 5: User Story 3 — 完整的中英文翻译覆盖（Priority: P1）

**Goal**: 所有用户可见文字均有中英文翻译，无遗漏、无键名暴露

**Independent Test**: 分别在中文和英文模式下遍历所有 UI，确认无一遗漏

### Implementation for User Story 3

- [x] T021 [P] [US3] Translate AnnotationsComponent in `src/components/AnnotationsComponent.tsx`: replace `"Add a note..."` placeholder with `useT()` call
- [x] T022 [P] [US3] Translate NoteModal in `src/components/NoteModal.ts`: replace `'保存'`, `'取消'`, `'输入笔记内容...'` with `t()` calls
- [x] T023 [P] [US3] Translate SelectionMenu (annotation popup) in `src/components/SelectionMenu.tsx`: if any user-visible strings exist, use `useT()`
- [x] T024 [US3] Translate FoliateViewer user-facing strings in `src/viewers/FoliateViewer.tsx`: any visible labels or tooltips
- [x] T025 [US3] Translate AnnotationsView view name/display in `src/views/AnnotationsView.ts`
- [x] T026 [US3] Translate OutlineView view name/display in `src/views/OutlineView.ts`
- [x] T027 [US3] Translate ReaderView `getDisplayText()` fallback in `src/views/ReaderView.ts`: replace `'Reader'` with `t()` call
- [x] T028 [US3] Translate context menu item in `src/main.ts`: replace `'Annotate'` in file-menu with `t()` call
- [x] T029 [US3] Final audit: run `rg` for any remaining hardcoded Chinese/English UI strings in `src/` (exclude engine/, types/, test files, comments) and translate all found
- [x] T030 [US3] Fill complete translation entries in `src/i18n/zh.json` for all keys discovered during audit
- [x] T031 [US3] Fill complete translation entries in `src/i18n/en.json` for all keys discovered during audit (en.json is the base — must contain every key)

**Checkpoint**: User Story 3 完成 — 100% 翻译覆盖率

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 边界场景处理、质量保证、跨平台验证

- [x] T032 [P] Add edge case handling for corrupt translation data in `src/i18n/index.ts`: wrap `loadTranslations()` in try-catch, fallback to English on parse error, log warning
- [x] T033 [P] Add edge case handling for unsupported locale value in `src/i18n/index.ts`: `setLanguage()` should validate input, fallback to `'en'` for invalid values
- [x] T034 Verify cross-platform behavior: test language switch on Android/iOS Obsidian (if mobile test environment available), confirm no platform-specific issues
- [x] T035 Run `bun run check` (ESLint + TypeScript) and fix all errors/warnings
- [x] T036 Run `bun run format` to ensure code style compliance
- [x] T037 Run `bun run test` to verify all tests pass (existing + new i18n tests)
- [x] T038 Run quickstart.md validation scenarios V1-V6 and confirm all pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 — **阻塞所有用户故事**
- **User Story 1 (Phase 3)**: 依赖 Phase 2 完成
- **User Story 2 (Phase 4)**: 依赖 Phase 2 完成；可与 US1 并行
- **User Story 3 (Phase 5)**: 依赖 Phase 2 完成 + US1 中 i18n 机制已完成（useT/Tab 翻译模式已确立）
- **Polish (Phase 6)**: 依赖所有用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: Phase 2 后即可开始 — 无其他故事依赖。US1 建立了翻译 UI 模式。
- **User Story 2 (P2)**: Phase 2 后即可开始 — 独立于 US1（仅涉及 main.ts 逻辑和 Settings 字段）
- **User Story 3 (P1)**: Phase 2 后即可开始 — 翻译工作依赖 i18n 模块，但可在 US1 翻译模式建立后批量进行

### Within Each User Story

- US1: T009 (dropdown) → T010 (hook) → T011-T015 (翻译文字, 可并行) → T016 (验证)
- US2: T017-T020 顺序执行（紧密耦合）
- US3: T021-T028 (翻译各组件, 均可并行) → T029 (审计) → T030-T031 (补全翻译文件)

### Parallel Opportunities

- Phase 2: T003, T004, T005 可并行（不同文件）
- Phase 3: T011, T012, T013, T014, T015 可并行（T009-T010 完成后）
- Phase 4: 可与 Phase 3 完全并行（不同文件：main.ts vs SettingsTab/components）
- Phase 5: T021-T028 全部可并行（每个任务修改不同文件）
- Phase 6: T032, T033 可并行

---

## Parallel Example: User Story 1

```bash
# Step 1: Setup language dropdown (T009) — prerequisite for all US1 tasks
Task: "Add language dropdown setting to SettingsTab in src/components/SettingsTab.ts"

# Step 2: Implement useT hook (T010) — prerequisite for React component translations
Task: "Implement React useT() hook in src/i18n/index.ts"

# Step 3: Launch all translations in parallel (T011-T015)
Task: "Translate SettingsTab headings in src/components/SettingsTab.ts"
Task: "Translate SettingsTab labels/descriptions in src/components/SettingsTab.ts"
Task: "Translate readerHeader action labels in src/views/readerHeader.ts"
Task: "Translate ReaderViewInner placeholders in src/components/ReaderViewInner.tsx"
Task: "Add language dropdown labels to translation files in src/i18n/zh.json and src/i18n/en.json"
```

## Parallel Example: User Story 3

```bash
# All component translations can run in parallel:
Task: "Translate AnnotationsComponent in src/components/AnnotationsComponent.tsx"
Task: "Translate NoteModal in src/components/NoteModal.ts"
Task: "Translate SelectionMenu in src/components/SelectionMenu.tsx"
Task: "Translate FoliateViewer in src/viewers/FoliateViewer.tsx"
Task: "Translate AnnotationsView in src/views/AnnotationsView.ts"
Task: "Translate OutlineView in src/views/OutlineView.ts"
Task: "Translate ReaderView fallback in src/views/ReaderView.ts"
Task: "Translate context menu in src/main.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T008)
3. Complete Phase 3: User Story 1 (T009-T016)
4. **STOP and VALIDATE**: 打开设置 → 切换语言 → React 组件即时切换 → 重启保持
5. MVP 已可用：用户可手动切换中英文

### Incremental Delivery

1. Setup + Foundational → i18n 基础设施就绪
2. Add User Story 1 → 测试独立 → **MVP：用户可手动切换语言**
3. Add User Story 2 → 测试独立 → 首次安装自动匹配语言
4. Add User Story 3 → 测试独立 → 100% 翻译覆盖，无遗漏
5. Polish → 边界场景 + 质量检查

### Suggested MVP Scope

仅完成 Phase 1-3（User Story 1）。US2 和 US3 可在后续迭代中增量添加，不阻塞 MVP。

---

## Notes

- [P] 任务 = 不同文件，无依赖，可并行
- [Story] 标签将任务映射到特定用户故事以便追溯
- Constitution VI 要求的 i18n 单元测试在 T007
- 英文 (en.json) 是回退语言，必须包含所有键；中文 (zh.json) 可部分覆盖
- 翻译资源是静态 JSON，esbuild 会打包到输出中
- 所有 t() 调用使用点分隔键名（如 `settings.language.label`）

---

## Phase 7: Convergence

**Purpose**: 修复 `/speckit.converge` 发现的规范-实现偏差。Phase 6 之后遗留的未完成/部分完成工作。

- [x] T039 修复 `src/views/readerHeader.ts` 中 `updateFontSizeAction` 的硬编码中文 aria-label 格式字符串 `（当前 ${fontSize}%）`，改用翻译键 `reader.toolbar.fontSize.current`（如 `"（当前 {0}%）"` / `" (currently {0}%)"`），并在 `en.json` 和 `zh.json` 中添加对应翻译条目，per SC-002/FR-006（partial）
- [x] T040 修复 `src/i18n/index.ts` 中 `t()` 函数在双缺失场景（当前语言和英语均无对应键）回退返回键名本身的行为，改为返回空字符串并记录警告日志，确保不暴露原始键名，per FR-007/SC-003（partial）
