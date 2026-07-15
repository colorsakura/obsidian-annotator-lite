# obsidian-annotator-lite

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/colorsakura/obsidian-annotator-lite)

[obsidian-annotator](https://github.com/elias-sundqvist/obsidian-annotator) 的轻量替代品，在 Obsidian 内直接阅读和标注
EPUB、MOBI、KF8 (AZW3)、FB2、FBZ、CBZ 和 PDF 文件。基于 [foliate-js](https://github.com/johnfactotum/foliate-js)
作为阅读引擎，支持移动端（Android/iOS）。

## 功能特性

- 📖 **多格式支持**：EPUB、MOBI、KF8 (AZW3)、FB2、FBZ、CBZ、PDF
- 🖊️ **文本标注**：高亮文本并添加笔记，支持自定义高亮颜色
- 📑 **目录导航**：左侧栏目录视图，快速跳转章节
- 📝 **标注面板**：右侧栏标注列表，集中管理所有标注
- 🔗 **标注链接**：点击标注可跳转到阅读器中对应位置
- 📄 **分页/滚动**：支持翻页模式和连续滚动模式
- 📐 **单列/双列**：支持单列和双列布局
- 🎨 **主题适配**：自动跟随 Obsidian 亮色/暗色主题
- 📱 **移动端兼容**：支持 Android 和 iOS 移动端
- 💾 **阅读进度**：自动记录和恢复阅读位置
- 🔌 **Datacore 集成**：自动检测 Datacore 插件，优先使用其索引能力

## 安装

### 社区插件市场

待上架。

### 手动安装

1. 从 [Releases](https://github.com/colorsakura/obsidian-annotator-lite/releases) 下载最新版本
2. 解压到 vault 的 `.obsidian/plugins/annotator-lite/` 目录
3. 在 Obsidian 设置 → 社区插件中启用「Annotator Lite」

### 从源码构建

```bash
git clone https://github.com/colorsakura/obsidian-annotator-lite.git
cd obsidian-annotator-lite
bun install
bun run build
```

## 用法

### 基本使用

1. 将 EPUB/PDF 等电子书文件放入 Obsidian vault 目录
2. 创建或打开一个 Markdown 笔记，在 frontmatter 中添加 `annotation-target` 字段：

```yaml
---
annotation-target: 我的书.epub
---
```

3. 右键点击 Markdown 文件的编辑器区域，选择「Annotate」打开阅读器
4. 选中文本即可高亮标注，点击高亮可添加笔记或删除

### 标注管理

- **创建标注**：选中文本 → 右键菜单选择高亮颜色 → 可选添加笔记
- **查看标注**：点击右侧栏的标注列表，或点击标注链接跳转
- **删除标注**：点击已有高亮 → 选择删除

### 阅读设置

阅读器顶部工具栏支持：

- 📄 **翻页模式** / **滚动模式** 切换
- 📐 **单列** / **双列** 布局切换
- 🔍 **字体大小** 调整

## 设置

在 Obsidian 设置 → Annotator Lite 中可配置：

| 设置项       | 说明                         | 默认值             |
| ------------ | ---------------------------- | ------------------ |
| 高亮颜色     | 自定义高亮颜色列表           | 黄、红、蓝、绿、紫 |
| 默认字体大小 | 阅读器默认字体大小 (80-160%) | 100%               |
| 默认分栏模式 | 单列或双列布局               | 双列               |
| 默认翻页模式 | 翻页或连续滚动               | 翻页               |

## 开发

### 环境要求

- [Bun](https://bun.sh) 运行时
- Obsidian >= 0.15.0

### 常用命令

```bash
bun install          # 安装依赖
bun run dev          # 开发模式（watch，自动输出 main.js + styles.css）
bun run build        # 生产构建（类型检查 + 压缩）
bun run lint         # ESLint 检查
bun run format       # Prettier 格式化
bun run check        # ESLint + TypeScript 类型检查
bun run test         # 运行测试
bun run test:watch   # 测试监听模式
```

### 本地调试

复制 `.env.example` 为 `.env`，设置 `OBSIDIAN_VALTE_PATH` 指向你的测试 vault 插件目录，开发构建完成后会自动复制产物。

### 技术栈

- **构建工具**：esbuild（通过 `build.ts`）
- **运行时/包管理**：Bun
- **阅读引擎**：[foliate-js](https://github.com/johnfactotum/foliate-js)
- **UI 框架**：React 19
- **数据获取**：TanStack Query
- **图标**：lucide-react
- **测试**：Vitest + jsdom
- **代码规范**：ESLint 9 + Prettier

## 致谢

- [obsidian-annotator](https://github.com/elias-sundqvist/obsidian-annotator) — 原始项目，本插件受其启发
- [foliate-js](https://github.com/johnfactotum/foliate-js) — 核心阅读引擎

## 许可证

MIT
