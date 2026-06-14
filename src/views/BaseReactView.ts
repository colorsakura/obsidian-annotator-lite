import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { AppContext } from '../hooks/useObsidianApp';
import { ReaderStoreContext, getSessionStore } from '../contexts/ReaderStoreContext';
import { ReaderAPIContext, getReaderAPI } from '../contexts/ReaderAPIContext';
import { QueryProvider } from '../providers/QueryProvider';

/**
 * 基类：提取三个 ItemView（ReaderView / OutlineView / AnnotationsView）的共同样板。
 *
 * 子类只需实现 `renderReact()` 提供 React 元素。
 * 基类负责：React root 创建、挂载、卸载、Provider 注入。
 */
export abstract class BaseReactView extends ItemView {
  protected reactRoot: HTMLElement;
  protected root: Root;

  constructor(leaf: WorkspaceLeaf, containerClass: string) {
    super(leaf);
    this.reactRoot = this.contentEl.createDiv({ cls: containerClass });
    this.root = createRoot(this.reactRoot);
  }

  async onClose() {
    this.root.unmount();
  }

  /**
   * 渲染 React 树。子类通过 `renderReact()` 提供要渲染的元素，
   * 基类自动包裹 AppContext.Provider、ReaderStoreContext.Provider、ReaderAPIContext.Provider。
   */
  protected render() {
    const store = getSessionStore();
    const api = getReaderAPI();
    let element = this.renderReact();

    // Provider 嵌套顺序（从内到外）：
    // QueryProvider → ReaderStoreContext → ReaderAPIContext → AppContext
    if (store) {
      element = React.createElement(ReaderStoreContext.Provider, { value: store }, element);
    }
    if (api) {
      element = React.createElement(ReaderAPIContext.Provider, { value: api }, element);
    }
    element = React.createElement(QueryProvider, null, element);
    this.root.render(React.createElement(AppContext.Provider, { value: this.app }, element));
  }

  /**
   * 子类实现：返回要渲染的 React 元素。
   * 已自动包裹在 AppContext.Provider 中，可直接使用 useObsidianApp()。
   */
  protected abstract renderReact(): React.ReactElement;
}
