# Implementation Plan: 多语言支持（i18n）

**Branch**: `001-i18n-support` | **Date**: 2025-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-i18n-support/spec.md`

## Summary

为 obsidian-annotator-lite 插件添加多语言支持，默认实现简体中文（`zh`）和英语（`en`）两种语言。在设置页面通过下拉框选择语言，React 组件即时切换，设置面板下次打开时应用新语言。翻译资源以独立 JSON 文件组织，与业务代码分离。英语作为回退语言，翻译键缺失时回退显示英文文本。

技术方案：创建 `src/i18n/` 模块，提供框架无关的 `t()` 翻译函数（同时服务于 React 组件和 Obsidian SettingTab），通过模块级响应式状态实现 React 组件即时重渲染，无需引入第三方 i18n 库。

## Technical Context

**Language/Version**: TypeScript 7.0

**Primary Dependencies**: React 19, Obsidian API, foliate-js

**Storage**: Obsidian 插件数据 (`loadData()`/`saveData()`)

**Testing**: Vitest（engine 层单元测试 + i18n 工具模块测试）

**Target Platform**: Obsidian 桌面端（Electron）+ 移动端（Android/iOS）

**Project Type**: Obsidian 插件（单项目结构，esbuild 构建）

**Performance Goals**: 语言切换 < 5 秒（SC-001）；翻译函数调用 < 1ms（内存查找）

**Constraints**: 不引入第三方 i18n 库（保持零额外依赖）；翻译资源静态打包；React 组件和 Obsidian SettingTab 共用同一翻译机制

**Scale/Scope**: 2 种语言，估计 50-80 个翻译键，覆盖 5 个设置项 + 阅读器 UI + 通知/错误消息

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status  | Notes                                                                                            |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| I. Engine-UI Separation           | ✅ PASS | i18n 模块位于 `src/i18n/`，不导入 engine 层代码。翻译函数是纯工具函数。                          |
| II. Event-Driven Decoupling       | ✅ PASS | 语言切换通过模块级事件通知 React context，不跨模块直接调用。                                     |
| III. Cross-Platform Compatibility | ✅ PASS | `navigator.language` / `moment.locale()` 在两平台均可用；翻译逻辑无 DOM 依赖。                   |
| IV. Obsidian Ecosystem Compliance | ✅ PASS | 语言设置通过 `loadData()`/`saveData()` 持久化；设置项使用 Obsidian `Setting.addDropdown()` API。 |
| V. Code Quality Baseline          | ✅ PASS | 新增代码通过 `bun run check` + `bun run format`。                                                |
| VI. Testable Engine Layer         | ✅ PASS | i18n 模块为纯函数，可无 DOM/Obsidian 依赖地单元测试。                                            |

**Gate Result**: ALL PASS — 可进入 Phase 0 研究阶段。

## Project Structure

### Documentation (this feature)

```text
specs/001-i18n-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── i18n/                    # 新增：多语言模块
│   ├── index.ts             # 核心导出：t(), useT(), setLanguage(), getLanguage()
│   ├── types.ts             # 类型定义：Locale, TranslationMap, I18nState
│   ├── zh.json              # 简体中文翻译资源
│   └── en.json              # 英文翻译资源（回退语言）
├── services/
│   └── Settings.ts          # 修改：AnnotatorLiteSettings 新增 language 字段
├── components/
│   └── SettingsTab.ts       # 修改：使用 t() 翻译所有文字，新增语言下拉框
├── contexts/                # 新增：语言 context（或扩展现有 context）
├── main.ts                  # 修改：初始化 i18n，语言自动检测
├── views/
│   └── ReaderView.ts        # 修改：注入语言 context
│   └── readerHeader.ts      # 修改：控件文字使用 t()
├── viewers/
│   └── FoliateViewer.tsx    # 修改：内部文字使用 t()
└── ... (其他含硬编码文字的组件)

tests/
└── i18n/                    # 新增：i18n 模块单元测试
    └── index.test.ts
```

**Structure Decision**: 单项目结构，与现有架构一致。i18n 模块作为 `src/i18n/` 独立目录，通过 `index.ts` 导出公共 API，不与其他模块耦合。

## Complexity Tracking

> 无违规项，无需记录。
