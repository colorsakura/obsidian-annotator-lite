# Research: 多语言支持（i18n）

**Feature**: 001-i18n-support | **Date**: 2025-07-11

## R1: Obsidian 插件 i18n 最佳实践

**Decision**: 自建轻量 i18n 模块，不引入第三方库

**Rationale**:

- Obsidian 插件生态中无标准 i18n 库；社区插件（如 Dataview、Calendar）均采用自建方案
- 第三方 i18n 库（i18next、react-intl）体积大（>30KB），与 esbuild 单文件输出模式冲突，且功能过剩
- 本功能需求简单：2 种语言、50-80 个翻译键、无复数/插值复杂场景
- 自建模块预计 < 100 行代码，零依赖，减少构建复杂度

**Alternatives considered**:

- `i18next` + `react-i18next`: 功能齐全但体积大（~35KB min+gz），对 2 种语言的简单场景过度设计
- Obsidian `moment.locale()` 直接翻译: 只能拿到语言代码，无法提供翻译文本

---

## R2: React 响应式语言切换方案

**Decision**: 模块级响应式状态 + React Context + 自定义 hook

**Rationale**:

- 现有代码已使用模块级单例模式（`ReaderStoreContext`、`ReaderAPIContext`）作为跨组件状态共享
- 语言状态属于全局 UI 状态，适合此模式
- 不使用 React state 管理库（Redux/Zustand）：增加不必要的依赖
- 实现方式：
  1. `src/i18n/index.ts` 维护模块级 `_currentLocale` 变量 + 订阅者集合
  2. React 组件通过 `useT()` hook 订阅语言变化，自动重渲染
  3. 非 React 代码（SettingTab）通过 `t()` 函数直接读取当前语言翻译

**Alternatives considered**:

- React Context + `useState` (顶层 Provider)：可行但需要确保 Provider 包裹所有组件，侵入性大
- `window` 全局变量 + 强制刷新：粗暴，不可控
- 事件总线 `ReaderEventBus` 扩展：事件总线用于 view-controller 通信，不适合 UI 状态传播

---

## R3: Obsidian 语言检测方式

**Decision**: 使用 `moment.locale()` 作为主要检测手段，回退 `navigator.language`

**Rationale**:

- Obsidian 内部使用 moment.js 管理语言，`moment.locale()` 返回 Obsidian 设置的语言（`zh-cn`、`en` 等）
- `navigator.language` 是浏览器/系统级别语言，作为回退
- 检测逻辑：`zh` 开头（`zh-cn`、`zh-tw`、`zh`）→ 中文；其他 → 英文
- 用户手动选择后以用户选择为准，不再自动检测

**Alternatives considered**:

- `this.app.vault.getConfig('language')`：Obsidian API 未公开此方法，可能随版本变化
- 仅 `navigator.language`：无法感知 Obsidian 设置的语言覆盖

---

## R4: 翻译键命名规范

**Decision**: 点分隔层级命名，按功能模块分组

**Rationale**:

- 与业界常见 i18n 命名一致（参考 i18next、rails-i18n）
- 便于按模块维护和查找：`settings.*` 对应设置面板，`reader.*` 对应阅读器 UI
- 结构与现有代码模块划分对齐

**命名空间划分**:

| 前缀            | 覆盖范围                                 |
| --------------- | ---------------------------------------- |
| `settings`      | 设置面板 tabs、分组标题、设置项标签/描述 |
| `reader`        | 阅读器控件、工具栏、菜单                 |
| `annotations`   | 标注相关 UI                              |
| `common`        | 通用按钮（确认、取消、关闭）             |
| `notifications` | 通知/错误消息                            |

**Alternatives considered**:

- 扁平命名（如 `settings_font_size`）：简单但难以维护，键多了以后冲突风险高
- 自然语言键（如 `"字体大小"`）：无法区分翻译缺失和键名，且与回退逻辑冲突

---

## R5: 设置面板翻译方案

**Decision**: `SettingsTab.display()` 内直接调用 `t()` 函数获取翻译文本

**Rationale**:

- 根据澄清 Q1，设置面板不要求即时更新 —— 下次打开时 `display()` 重新执行自然会用新语言
- `t()` 是同步纯函数，可直接在 Obsidian Setting API 的字符串参数处调用
- 无需引入 React 依赖或 context 到 SettingTab

**Alternatives considered**:

- 预计算翻译对象传给 SettingTab：增加中间层，不必要
- 让 SettingTab 继承 React 组件：违反 Obsidian API 约定（`PluginSettingTab` 必须是原生类）
