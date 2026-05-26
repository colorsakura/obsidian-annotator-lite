# AGENTS.md

这是一个 Obsidian 插件，可以直接在 Obsidian 中对 EPUB, MOBI, KF8 (AZW3), FB2, CBZ 和 PDF 文件进行标注（高亮、笔记）。

## 项目规则

- 禁止编辑 `main.js` 和 `styles.css`，这是编译生成的文件。
- HTML元素只添加必要的class类
- 冻结PDF相关的功能和代码

### 语言

默认用简体中文回复；用户明确指定时再切换语言。

## 核心架构

### 工作流程

1. **触发**：打开一个包含 `annotation-target` 前置元（frontmatter）的 Markdown 笔记时，插件自动识别并打开读者视图。
2. **视图**：
    - `ReaderView`（主区域）：渲染 PDF/EPUB 内容，支持选中文本添加高亮。高亮数据以 JSON 块形式存储在同名的 MD 笔记中。
    - `OutlineView`（左侧边栏）：展示书籍封面、元数据、目录树，点击可导航到指定位置。
    - `AnnotationsView`（右侧边栏）：展示书籍当前的所有高亮和笔记，可以编辑和删除。
3. **标注存储**：所有高亮和笔记保存在 Markdown 文件的 `%% ANNOTATION-LITE-DATA ... %%` 隐藏数据块中，同时生成可读的引用块。

### 关键技术栈

| 技术                | 用途                                              |
|---------------------|---------------------------------------------------|
| **Obsidian API**    | 插件框架、视图系统（ItemView）、文件读写、设置    |
| **React 19**        | UI 渲染（读者视图和大纲视图）                     |
| **foliate-js**      | EPUB 渲染引擎，提供 `<foliate-view>` 自定义元素   |
| **pdfjs-dist v5**   | PDF 渲染（通过 pdf-book.ts 适配 foliate-js 接口） |
| **Tailwind CSS v4** | 样式（通过 PostCSS）                              |
| **esbuild**         | 打包构建，内联 PDF worker 和 CSS                  |

## 开发命令

```bash
npm run build    # 构建（修改结束后，必须运行，确保构建成功）
```

构建产物：`main.js`（插件代码）和 `styles.css`（样式文件）。
