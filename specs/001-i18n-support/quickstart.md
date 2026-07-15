# Quickstart: 多语言支持（i18n）验证指南

**Feature**: 001-i18n-support | **Date**: 2025-07-11

## 前置条件

- Obsidian（桌面版或移动版均可）已安装
- 插件已构建并加载到 Obsidian vault 的 `.obsidian/plugins/` 目录
- 项目已执行 `bun install`

## 验证场景

### V1: 语言切换 — React 组件即时响应

1. 打开 Obsidian，确保插件已启用
2. 打开一个包含 `annotation-target` 的 Markdown 笔记，进入阅读视图
3. 打开插件设置（Settings → Community plugins → Annotator Lite → Options）
4. 观察当前语言选项（首次安装应显示与 Obsidian 语言匹配的默认值）
5. 将语言从中文切换为英文
6. **验证**: 阅读器工具栏、菜单、按钮提示立即切换为英文
7. **验证**: 设置面板文字不变（除非关闭后重新打开）
8. 关闭设置面板，重新打开
9. **验证**: 设置面板所有文字以英文显示，语言下拉框标签显示 "Language"

### V2: 语言设置持久化

1. 在设置中将语言切换为英文
2. 完全关闭 Obsidian
3. 重新打开 Obsidian
4. 打开插件设置
5. **验证**: 语言选项保持英文
6. **验证**: 阅读器 UI 以英文显示

### V3: 默认语言自动检测

1. 将 Obsidian 界面语言设为中文（Settings → About → Language → 简体中文）
2. 删除插件的 `data.json`（或首次全新安装）
3. 重新加载插件
4. **验证**: 插件默认语言为中文
5. 将 Obsidian 界面语言改为英文，重复步骤 2-3
6. **验证**: 插件默认语言为英文

### V4: 翻译回退机制

1. 临时修改 `zh.json`，删除某个翻译键（模拟翻译缺失）
2. 将插件语言设为中文
3. **验证**: 该键对应的 UI 显示英文文本（回退），而非显示键名
4. 恢复 `zh.json`

### V5: 单元测试

```bash
bun run test
```

**预期输出**: i18n 模块测试全部通过，覆盖以下场景：

- `t()` 正确返回各语言的翻译文本
- 缺失键回退到英文
- 中英文均缺失的键返回键名本身（不崩溃）
- `resolveDefaultLanguage()` 正确识别中文变体和非中文
- `setLanguage()` 触发订阅者回调

### V6: 代码质量检查

```bash
bun run check
bun run format:check
```

**预期输出**: 零错误，零警告。
