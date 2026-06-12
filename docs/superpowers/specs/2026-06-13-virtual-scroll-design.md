# 虚拟滚动设计文档

**日期**: 2026-06-13
**状态**: 设计完成
**作者**: iFlygo + Claude

## 问题陈述

在滚动模式下，foliate-js 将整个章节渲染到单个 iframe 中。当用户打开/关闭侧边栏时，Obsidian 窗口大小变化触发 `expand()` 调用，导致整个 DOM 树的同步 reflow。对于中型章节（1000-5000 节点），这会造成明显的 UI 卡顿。

现有优化（`content-visibility: auto` 和 ResizeObserver 防抖）已减少部分开销，但仍无法完全消除卡顿。

## 设计目标

1. **激进 DOM 卸载**：只渲染视口附近的区块，屏幕外的完全卸载
2. **按需恢复**：屏幕外的标注不显示，滚动到视口时恢复
3. **最小侵入**：主要在插件层面实现，必要时通过 monkey-patch 扩展 foliate-js
4. **渐进增强**：可降级到现有 content-visibility 方案

## 架构概述

```
┌─────────────────────────────────────────────────────────┐
│                   VirtualScrollManager                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ BlockSplitter│  │ Viewport    │  │ BlockCache  │     │
│  │             │  │ Observer    │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │               │               │               │
│         ▼               ▼               ▼               │
│  ┌─────────────────────────────────────────────────────┐│
│  │              BlockRegistry (数据结构)                ││
│  │  - blockId → { placeholder, domFragment, range }    ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**数据流**：
1. foliate-js 渲染完成 → `BlockSplitter` 切分区块
2. 用户滚动 → `Viewport Observer` 检测区块进出视口
3. 区块离开视口 → 保存 DOM 到 `BlockCache` → 插入占位符
4. 区块进入视口 → 从 `BlockCache` 恢复 DOM → 重新应用标注

## 区块切分策略

### 算法

基于累积高度的贪心切分：

1. 遍历 DOM 树的所有顶级块级元素（p, div, h1-h6, blockquote, ul, ol, table）
2. 维护累积高度 accumulator
3. 当 `accumulator + 当前元素高度 > BLOCK_SIZE`（默认 1000px）时：
   - 创建新区块，包含之前累积的元素
   - 重置 accumulator
4. 最后一个区块可能不足 BLOCK_SIZE，保持原样

### 约束

- 不拆分单个元素（如一个很长的段落不会被切成两半）
- 不跨越表格、列表等容器（保持结构完整性）
- 区块边界记录每个元素的原始位置（用于恢复）

### 数据结构

```typescript
interface BlockDescriptor {
  id: number;                    // 区块 ID
  startOffset: number;           // 起始偏移量（用于滚动位置计算）
  height: number;                // 区块高度（px）
  elements: Node[];              // 包含的 DOM 节点引用
  range: Range;                  // 原始 DOM Range（用于标注恢复）
  state: 'rendered' | 'cached';  // 当前状态
}
```

### 触发时机

- foliate-js 首次渲染完成后
- 章节切换时
- 字体大小改变时（需要重新计算高度）
- 窗口大小改变时（需要重新计算高度）

## 视口观察与区块生命周期

### IntersectionObserver 配置

```typescript
const observer = new IntersectionObserver(callback, {
  root: iframe.contentDocument,  // 观察区域是 iframe 的视口
  rootMargin: '200px 0px',       // 上下预加载 200px
  threshold: 0                    // 完全离开视口时触发
});

// 每个区块对应一个观察目标（占位符元素）
observer.observe(placeholderElement);
```

### 生命周期状态机

```
[创建] → rendered → [离开视口] → cached → [进入视口] → rendered
                 ↑                               │
                 └───────────────────────────────┘
```

### 状态转换

| 当前状态 | 触发条件 | 动作 |
|---------|---------|------|
| rendered | 区块完全离开视口 | 1. 保存 DOM 引用到缓存<br>2. 移除 DOM 节点<br>3. 插入等高占位符<br>4. 状态 → cached |
| cached | 区块进入视口（或预加载区域） | 1. 从缓存获取 DOM<br>2. 移除占位符<br>3. 插入 DOM 节点<br>4. 重新应用标注<br>5. 状态 → rendered |

### 预加载策略

- `rootMargin: '200px 0px'` 让区块在进入视口前 200px 就开始加载
- 避免用户看到空白区域
- 实现方式：当区块的占位符进入 IntersectionObserver 的扩展区域时，触发加载

### 边界情况

- **快速滚动**：多个区块同时进出视口，需要防抖处理
- **首次加载**：初始视口内的区块直接标记为 rendered
- **区块高度变化**：字体/窗口大小改变时需要重建所有区块

## 标注恢复机制

### 保存格式

```typescript
interface CachedAnnotation {
  id: string;                    // 标注 ID
  range: Range;                  // 保存时的 DOM Range
  color: string;                 // 颜色
  text: string;                  // 标注文本（用于验证）
  blockId: number;               // 所属区块 ID
}
```

### 保存流程（区块离开视口时）

1. 遍历区块内的所有标注高亮元素
2. 对每个标注，保存其 Range 和元数据
3. 将标注从 DOM 中移除（高亮元素）
4. 标注数据保留在内存中（与区块缓存关联）

### 恢复流程（区块进入视口时）

1. 从缓存获取该区块的所有标注
2. 对每个标注，检查 Range 是否仍然有效
3. 如果有效，重新创建高亮元素
4. 如果无效（DOM 结构变化），尝试基于文本内容重新定位

### 验证机制

- 恢复时比对 `text` 字段，确保标注位置正确
- 如果文本不匹配，标记为"位置偏移"并尝试修复

### 与现有标注系统集成

- `useAnnotationRendering` hook 需要感知区块状态
- 区块 cached 时，跳过该区块的标注渲染
- 区块 rendered 时，触发该区块的标注渲染

## 与 foliate-js 集成

### 集成点

在 `useContentVirtualization.ts` 基础上扩展为 `useVirtualScrolling.ts`。

### 现有代码扩展

```typescript
// 当前实现：monkey-patch renderer.render()
const originalRender = renderer.render.bind(renderer);
renderer.render = () => {
  originalRender();
  if (flow === 'scrolled') {
    injectContentVisibilityCSS(doc);
  }
};

// 扩展为：
renderer.render = () => {
  originalRender();
  if (flow === 'scrolled') {
    injectContentVisibilityCSS(doc);
    virtualScrollManager.initialize(doc);  // 新增
  }
};

// 新增：监听滚动事件
iframe.contentWindow.addEventListener('scroll', () => {
  virtualScrollManager.update();
});

// 新增：监听 resize 事件
iframe.contentWindow.addEventListener('resize', debounce(() => {
  virtualScrollManager.rebuildBlocks();
}, 100));
```

### 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `useContentVirtualization.ts` | 扩展为 `useVirtualScrolling.ts`，集成区块管理 |
| `foliateNavigation.ts` | `next()`/`prev()` 需要感知虚拟滚动状态 |
| `useAnnotationRendering.ts` | 标注渲染需要按区块触发 |
| `FoliateViewer.tsx` | 可能需要传递虚拟滚动配置 |

### foliate-js 扩展（通过 monkey-patch）

- 通过 `getContents()` 获取 iframe Document，无需修改 foliate-js 源码
- 通过 monkey-patch `expand()` 方法，在虚拟滚动模式下跳过 cached 区块的布局计算
- 如果 foliate-js 内部有滚动位置管理，通过事件监听同步状态

## 错误处理与降级策略

### 潜在风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 区块切分破坏 DOM 结构 | 布局错乱 | 保守切分，不拆分容器元素 |
| 恢复时 Range 无效 | 标注位置错误 | 基于文本内容重新定位 |
| 快速滚动导致频繁切换 | 性能下降 | 防抖 + 批量处理 |
| 内存缓存过大 | 内存溢出 | LRU 缓存，限制最大缓存区块数 |
| foliate-js re-render | 区块映射失效 | MutationObserver 监听，必要时重建 |

### 配置选项

```typescript
interface VirtualScrollConfig {
  enabled: boolean;              // 总开关
  blockSize: number;             // 区块高度（默认 1000px）
  preloadMargin: number;         // 预加载区域（默认 200px）
  maxCachedBlocks: number;       // 最大缓存区块数（默认 10）
  fallbackMode: 'none' | 'content-visibility';  // 降级模式
}
```

### 降级触发条件

1. 浏览器不支持 `IntersectionObserver` → 降级到 content-visibility
2. 内存使用超过阈值 → 减少缓存区块数
3. 用户手动关闭 → 完全禁用

### 监控指标

- 区块切换频率
- 缓存命中率
- 内存使用量
- 恢复失败次数

### 用户控制

- 在插件设置中提供开关
- 可调整区块大小和预加载距离
- 显示性能统计（可选）

## 实现计划

### 阶段 1：基础框架

1. 创建 `VirtualScrollManager` 类
2. 实现 `BlockSplitter` 区块切分逻辑
3. 实现 `IntersectionObserver` 视口观察
4. 实现基础的区块卸载/加载

### 阶段 2：标注集成

1. 实现 `CachedAnnotation` 保存/恢复
2. 修改 `useAnnotationRendering` 支持按区块渲染
3. 处理标注恢复失败的情况

### 阶段 3：foliate-js 集成

1. 修改 `useContentVirtualization.ts` 为 `useVirtualScrolling.ts`
2. 处理 foliate-js 的 re-render 事件
3. 同步滚动位置和导航状态

### 阶段 4：优化与降级

1. 实现 LRU 缓存策略
2. 添加配置选项和用户控制
3. 实现降级到 content-visibility
4. 性能监控和统计

## 测试策略

### 单元测试

- `BlockSplitter` 切分算法
- `BlockRegistry` 状态管理
- 标注保存/恢复逻辑

### 集成测试

- 滚动时区块切换
- 侧边栏开关时的性能
- 标注恢复的准确性

### 性能测试

- 不同规模章节的渲染时间
- 内存使用量对比
- 滚动流畅度（帧率）

## 成功标准

1. **性能**：侧边栏开关时无明显卡顿（< 16ms 帧时间）
2. **内存**：长时间阅读后内存稳定（< 100MB 增长）
3. **标注**：标注恢复准确率 > 95%
4. **兼容**：支持主流浏览器（Chrome, Firefox, Safari）
