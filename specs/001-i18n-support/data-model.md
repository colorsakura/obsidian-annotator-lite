# Data Model: 多语言支持（i18n）

**Feature**: 001-i18n-support | **Date**: 2025-07-11

## 实体

### 1. Language Setting（语言设置）

扩展现有 `AnnotatorLiteSettings`，新增 `language` 字段。

| 字段       | 类型                        | 必需 | 默认值      | 说明                                                                           |
| ---------- | --------------------------- | ---- | ----------- | ------------------------------------------------------------------------------ |
| `language` | `'zh' \| 'en' \| undefined` | 否   | `undefined` | 用户选择的语言。`undefined` 表示「自动检测」，首次加载时根据 Obsidian 语言决定 |

**状态转换**:

```
                     ┌──────────────────┐
                     │    undefined     │  ← 首次安装，未手动选择
                     │  (自动检测)       │
                     └───────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Obsidian zh  │              │ Obsidian en/其他
              ▼              │              ▼
        ┌──────────┐        │        ┌──────────┐
        │   'zh'   │◄───────┘        │   'en'   │
        └────┬─────┘                 └────┬─────┘
             │                            │
             │  用户在设置中选择 English    │  用户在设置中选择 中文
             ├───────────────────────────►│◄──────────────────────┤
             │                            │                       │
             └────────────────────────────┘                       │
                      任意状态可通过设置下拉框互相切换               │
```

**验证规则**:

- 有效值：`'zh'`、`'en'`、`undefined`
- 非法值（如 `'fr'`）：回退到 `'en'`，不写入存储

### 2. Translation Resource（翻译资源）

每种语言一个 JSON 文件，键值对结构。

| 字段            | 类型     | 说明                               |
| --------------- | -------- | ---------------------------------- |
| `[key: string]` | `string` | 翻译键（点分隔层级命名）→ 翻译文本 |

**文件位置**: `src/i18n/zh.json`、`src/i18n/en.json`

**类型定义**:

```typescript
type Locale = 'zh' | 'en';
type TranslationMap = Record<string, string>;
```

**翻译键契约示例**:

```json
{
  "settings.language.label": "语言",
  "settings.language.desc": "选择插件界面的显示语言",
  "settings.fontSize.label": "默认字体大小",
  "settings.fontSize.desc": "阅读器打开时的初始字体大小百分比",
  "reader.noFile": "未选择文件",
  "reader.unsupportedType": "不支持的文件类型",
  "common.close": "关闭"
}
```

### 3. I18n Module State（i18n 模块运行时状态）

非持久化，仅存在于运行时。

| 字段             | 类型                             | 说明                                     |
| ---------------- | -------------------------------- | ---------------------------------------- |
| `_currentLocale` | `Locale`                         | 当前生效的语言（已解析，非 `undefined`） |
| `_translations`  | `Record<Locale, TranslationMap>` | 已加载的翻译资源内存缓存                 |
| `_subscribers`   | `Set<() => void>`                | React 组件订阅者集合，语言切换时通知     |

## 关系

```
AnnotatorLiteSettings.language ──设置──► I18n Module (_currentLocale)
                                                  │
                                          ┌───────┴───────┐
                                          ▼               ▼
                                  React useT() hook    t() 函数
                                  (响应式更新)          (SettingTab)
```
