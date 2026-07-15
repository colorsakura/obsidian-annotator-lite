# Contracts: i18n 模块公共 API

**Feature**: 001-i18n-support | **Date**: 2025-07-11

## 模块导出 (`src/i18n/index.ts`)

### `t(key: string, fallback?: string): string`

获取当前语言下指定键的翻译文本。

- **参数**:
  - `key`: 翻译键（点分隔层级命名，如 `settings.language.label`）
  - `fallback`（可选）: 翻译缺失时的回退文本。若不提供，回退到英文翻译；若英文也不存在，返回 `key` 本身
- **返回**: 翻译后的字符串
- **行为**: 同步纯函数，不触发副作用
- **使用场景**: SettingTab、通知消息、任何非 React 环境

### `useT(): (key: string, fallback?: string) => string`

React hook，返回绑定当前语言的翻译函数。语言切换时自动触发组件重渲染。

- **返回**: 与 `t()` 相同签名的翻译函数，但闭包捕获当前语言状态
- **行为**: 订阅 i18n 模块的语言变更事件，变更时触发重渲染
- **使用场景**: 所有 React 组件

### `setLanguage(locale: Locale): void`

切换当前语言。

- **参数**: `locale` — `'zh'` 或 `'en'`
- **行为**:
  1. 更新模块级 `_currentLocale`
  2. 通知所有 `useT()` 订阅者（React 组件自动重渲染）
  3. 不持久化（持久化由调用方负责，即 SettingTab 的 `onChange`）
- **副作用**: 触发 React 组件重渲染

### `getLanguage(): Locale`

获取当前生效的语言代码。

- **返回**: `'zh'` 或 `'en'`
- **行为**: 同步读取，无副作用

### `resolveDefaultLanguage(obsidianLocale?: string): Locale`

根据 Obsidian 语言自动决定默认语言。

- **参数**: `obsidianLocale` — 来自 `moment.locale()` 的语言字符串（如 `'zh-cn'`、`'en'`）
- **返回**: `'zh'`（若 Obsidian 为中文变体）或 `'en'`（其他）
- **行为**: 纯函数，无副作用
- **逻辑**: `obsidianLocale?.startsWith('zh')` → `'zh'`，否则 `'en'`

### `loadTranslations(): void`

加载所有语言的翻译资源到内存。

- **行为**: 导入 `zh.json` 和 `en.json`，缓存到 `_translations`
- **调用时机**: 插件 `onload()` 时调用一次
- **副作用**: 填充内存缓存

---

## 翻译资源契约 (`src/i18n/{locale}.json`)

每种语言一个 JSON 文件，顶层为扁平键值对。

### 格式约束

- 键名：点分隔的 ASCII 字符串（如 `reader.toolbar.zoomIn`）
- 值：UTF-8 字符串，支持任意 Unicode 字符
- 英文 (`en.json`) 作为基准语言，所有键必须存在
- 中文 (`zh.json`) 键可以仅覆盖部分键，缺失时回退英文

### 键命名规范

| 命名空间 | 格式                                | 示例                                                       |
| -------- | ----------------------------------- | ---------------------------------------------------------- |
| 通用     | `common.{action}`                   | `common.close`, `common.cancel`                            |
| 设置     | `settings.{section}.{item}.{field}` | `settings.language.label`, `settings.reader.fontSize.desc` |
| 阅读器   | `reader.{component}.{key}`          | `reader.toolbar.zoomIn`, `reader.placeholder.noFile`       |
| 标注     | `annotations.{context}.{key}`       | `annotations.menu.highlight`, `annotations.list.empty`     |
| 通知     | `notifications.{type}`              | `notifications.error.loadFailed`                           |

### 示例

**en.json**（基准语言，完整）:

```json
{
  "common.close": "Close",
  "settings.language.label": "Language",
  "settings.language.desc": "Select the display language for the plugin interface",
  "reader.placeholder.noFile": "No file selected. Open a note with annotation-target in its frontmatter.",
  "reader.placeholder.unsupported": "Unsupported file type"
}
```

**zh.json**（可部分覆盖）:

```json
{
  "common.close": "关闭",
  "settings.language.label": "语言",
  "settings.language.desc": "选择插件界面的显示语言",
  "reader.placeholder.noFile": "未选择文件。请打开包含 annotation-target 前置元字段的笔记。",
  "reader.placeholder.unsupported": "不支持的文件类型"
}
```
