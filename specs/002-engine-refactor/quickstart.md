# Quickstart: 验证 Engine 层重构

**Feature**: 002-engine-refactor
**Date**: 2025-07-15

## 前提条件

- Node.js / bun 已安装
- 项目依赖已安装：`bun install`
- 重构前的代码检查基线已确认：`bun run check` 通过

## 验证步骤

### 1. 代码质量基线

```bash
# TypeScript 类型检查 + ESLint
bun run check

# Prettier 格式检查
bun run format:check

# 预期：零错误零警告
```

### 2. 单元测试

```bash
# 运行 engine 层所有测试
bun run test -- --reporter=verbose

# 预期：所有现有测试通过（SC-005）
# 覆盖率检查
bun run test -- --coverage --coverage.include='src/engine/**'

# 预期：engine 层语句覆盖率 ≥ 80%（SC-003）
```

### 3. 循环依赖检测

```bash
# 使用 madge 检查循环依赖
npx madge --circular --extensions ts src/engine/

# 预期：无循环依赖输出（SC-004）
```

### 4. 功能冒烟测试（Obsidian 内）

以下操作必须在桌面端和 Android 移动端都通过：

| #   | 操作                                           | 预期结果                   |
| --- | ---------------------------------------------- | -------------------------- |
| 1   | 打开包含 `annotation-target` 的 Markdown 笔记  | EPUB/PDF 书籍正确渲染      |
| 2   | 右键选择一段文本 → 创建标注                    | 高亮立即显示，无闪烁       |
| 3   | 在标注面板中查看已创建的标注                   | 标注列表正确显示           |
| 4   | 在标注面板中删除一个标注                       | 高亮消失，其余标注不受影响 |
| 5   | 切换阅读设置（分页/滚动、单列/双列、字体大小） | 设置立即生效               |
| 6   | 使用 PageUp/PageDown/Home/End 导航             | 翻页/跳转正确              |
| 7   | 切换暗色/亮色模式                              | 书籍内容主题跟随           |
| 8   | 关闭阅读器 → 重新打开同一本书                  | 引擎复用正常，无残留状态   |
| 9   | 打开一本书 → 关闭 → 打开另一本书               | 引擎正确重置               |

### 5. 性能回归测试（手动计时）

```bash
# 记录重构前后书籍打开时间
# 打开大型 EPUB（>10MB）从点击到首次渲染的时间差
# 预期：重构后打开时间 ≤ 重构前 × 110%（SC-007）
```

### 6. 文件大小检查

```bash
# 模块行数检查
wc -l src/engine/ReaderEngine.ts     # 预期 ≤ 200（SC-001）
wc -l src/engine/BookLoader.ts       # 预期 ≤ 80（SC-002）

# 公共方法计数（手工检查 ReaderEngine.ts 导出类的方法数）
# 预期 ≤ 12 个（SC-001）
```

### 7. Edge Case 验证

| 场景               | 操作                              | 预期                          |
| ------------------ | --------------------------------- | ----------------------------- |
| loading 期间 close | `open()` 后立即 `close()`         | 加载中断，资源释放，无泄漏    |
| 重复 close         | 连续调用 `close()` 两次           | 无报错（幂等）                |
| 文件被删除         | 加载后从 vault 删除文件，然后翻页 | 导航返回错误，不崩溃          |
| 批量标注           | 连续创建 10 个标注                | 所有高亮正确显示，无重叠/遗漏 |
| 移动端             | Android 设备上打开 PDF/EPUB       | 无空白页，翻页正常            |

## 验证清单

- [ ] `bun run check` 零错误
- [ ] `bun run test` 全部通过
- [ ] engine 层测试覆盖率 ≥ 80%
- [ ] 无循环依赖
- [ ] 冒烟测试 9 项全部通过
- [ ] 性能不倒退（≤110%）
- [ ] Edge cases 全部通过
- [ ] SC-001（行数/方法数）满足
- [ ] SC-002（bookLoader行数）满足
