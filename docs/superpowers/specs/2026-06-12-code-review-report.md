# 代码质量审查报告

**日期**: 2026-06-12
**范围**: 全项目 (`src/`)
**深度**: 标准审查
**方法**: 并行多维度审查

---

## 总览

| 维度       | Critical | Warning | Info      |
| ---------- | -------- | ------- | --------- |
| 死代码     | 0        | 14      | 20+       |
| 依赖健康   | 0        | 1       | 3         |
| 类型完整性 | 0        | 0       | 38 处 any |
| 未使用文件 | 0        | 0       | 1         |

**结论**: 代码库整体质量良好，无 Critical 级别问题。

---

## 一、死代码检测

### 1.1 Warning 级别

#### AnnotationIndexService 大量方法未使用

| 文件                                  | 符号                      | 建议                   |
| ------------------------------------- | ------------------------- | ---------------------- |
| `src/datacore/annotationIndex.ts:41`  | `get hasDatacore`         | 删除或标记 `@internal` |
| `src/datacore/annotationIndex.ts:51`  | `getCurrentEntries()`     | 同上                   |
| `src/datacore/annotationIndex.ts:56`  | `findAnnotationsForUri()` | 同上                   |
| `src/datacore/annotationIndex.ts:66`  | `findEntryById()`         | 同上                   |
| `src/datacore/annotationIndex.ts:88`  | `upsertEntry()`           | 同上                   |
| `src/datacore/annotationIndex.ts:103` | `removeEntry()`           | 同上                   |
| `src/datacore/annotationIndex.ts:110` | `clear()`                 | 同上                   |
| `src/datacore/annotationIndex.ts:118` | `clearAll()`              | 同上                   |
| `src/datacore/annotationIndex.ts:126` | `countForPath()`          | 同上                   |
| `src/datacore/annotationIndex.ts:131` | `countWithNotesForPath()` | 同上                   |

只有 `rebuildIndex()` 被外部调用，其余 10 个方法全部未使用。

#### 废弃事件仍在 emit

| 文件                                | 事件名                | 建议                 |
| ----------------------------------- | --------------------- | -------------------- |
| `src/services/ReaderEventBus.ts:7`  | `annotations:changed` | 删除定义 + emit 调用 |
| `src/services/ReaderEventBus.ts:9`  | `navigation:target`   | 同上                 |
| `src/services/ReaderEventBus.ts:17` | `session:closed`      | 同上                 |
| `src/services/ReaderEventBus.ts:19` | `view:switch`         | 同上                 |

这些事件已被 `ReaderSessionStore` 观察者模式取代，emit 是无效操作。

#### NoteModal Promise 重复 resolve

| 文件                          | 行号          | 问题                                                             | 建议                                        |
| ----------------------------- | ------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `src/components/NoteModal.ts` | 20-22 + 74-76 | `setCloseCallback` 和 `onClose()` 都 resolve Promise，行为不一致 | 删除 `setCloseCallback`，只保留 `onClose()` |

### 1.2 Info 级别

| 文件                                                   | 符号                  | 建议                |
| ------------------------------------------------------ | --------------------- | ------------------- |
| `src/services/ReaderController.ts:206`                 | 冗余 `if` 条件        | 移除，直接执行      |
| `src/views/OutlineView.ts:37-39`                       | 空回调占位符          | 实现或移除          |
| `src/views/AnnotationsView.ts:37-39`                   | 空回调占位符          | 同上                |
| `src/viewers/hooks/useSelectionMenu.ts:257-260`        | `onClose` 未被消费    | 移除                |
| `src/views/ReaderView.ts:9-11` + `readerHeader.ts:4-5` | 常量重复定义          | 提取到 constants.ts |
| `src/components/OutlineComponent.tsx:15`               | 未使用的 `index` prop | 移除                |

---

## 二、依赖健康

| 问题     | 包名                                    | 建议                         |
| -------- | --------------------------------------- | ---------------------------- |
| 分类错误 | `eslint-plugin-react` (在 dependencies) | 移到 devDependencies         |
| 未使用   | `eslint-plugin-obsidianmd`              | 确认是否为 Obsidian 审核要求 |
| 可能过时 | `@eslint/js`, `eslint` (9 → 10)         | 观望，暂不升级               |

**优先级**: 先将 `eslint-plugin-react` 移到 devDependencies（影响打包产物）。

---

## 三、类型完整性

### 3.1 any 类型使用（38 处）

**核心问题**: `src/types/foliate-js.d.ts` 仅 3 行声明，导致 80% 的 any 来自 foliate-js 类型缺失。

**最高优先级修复**: 扩展 `foliate-js.d.ts`，定义：

- `<foliate-view>` 自定义元素接口（`open()`, `close()`, `goTo()`, `next()`, `prev()`, `book`, `renderer` 等）
- `FoliateBook` 接口（`toc`, `sections`, `metadata`, `getCover()`）
- `FoliateRenderer` 接口（`getContents()`, `atStart`, `atEnd`）
- 自定义事件类型（`load`, `relocate`, `draw-annotation`）

可一次性消除约 30 处 `any`。

### 3.2 可直接修复的类型断言

| 文件                    | 行号   | 断言                           | 修复方式         |
| ----------------------- | ------ | ------------------------------ | ---------------- |
| `useBookLoader.ts`      | 85     | `tfile as any`                 | 删除，已是 TFile |
| `foliateSelection.ts`   | 68     | `app: any`                     | 改为 `app: App`  |
| `foliateAnnotations.ts` | 34, 98 | `...find(...) as any`          | 使用类型守卫     |
| `markdownStorage.ts`    | 81     | `as unknown as Record`         | 简化断言         |
| `ReaderView.ts`         | 112    | `(leaf as any).updateHeader()` | 声明扩展接口     |

---

## 四、未使用文件

**孤立文件**: 0 个（所有文件均被引用）
**临时/备份文件**: 0 个
**未使用模块声明**: `declare module "foliate-js/epub.js"`（无文件 import）

---

## 五、清理优先级建议

### P0 - 立即修复（影响代码正确性）

1. **NoteModal Promise 重复 resolve** - 删除 `setCloseCallback`，统一到 `onClose()`

### P1 - 高优先级（影响维护性）

2. **扩展 foliate-js.d.ts** - 消除 30+ 处 any
3. **删除废弃事件** - 清理 4 个无监听的事件定义 + emit 调用
4. **移动 eslint-plugin-react** - 从 dependencies 到 devDependencies

### P2 - 中优先级（代码清洁度）

5. **清理 AnnotationIndexService** - 删除或标记 10 个未使用方法
6. **移除不必要的 export** - 16 个仅内部使用的导出符号
7. **移除空回调占位符** - OutlineView/AnnotationsView 的 header 按钮

### P3 - 低优先级（可选优化）

8. **精简 barrel 文件** - hooks/index.ts 的 re-export
9. **提取重复常量** - 字体大小边界值
10. **确认 eslint-plugin-obsidianmd 必要性**
