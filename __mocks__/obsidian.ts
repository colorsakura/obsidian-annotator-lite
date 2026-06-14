/**
 * Minimal obsidian module mock for vitest.
 * Only exports what's needed for unit tests in the engine layer.
 */

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
}

export class TFolder {
  path = '';
  name = '';
}

export class Plugin {
  app: any;
  addCommand = () => {};
  addSettingTab = () => {};
  registerView = () => {};
  registerEvent = () => {};
  loadData = async () => ({});
  saveData = async () => {};
}

export class ItemView {
  app: any;
  leaf: any;
  containerEl: any;
  constructor(leaf: any) {
    this.leaf = leaf;
  }
  async onOpen() {}
  async onClose() {}
  getViewType() {
    return '';
  }
  getDisplayText() {
    return '';
  }
}

export class Modal {
  app: any;
  open() {}
  close() {}
}

export class Setting {
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addSlider() {
    return this;
  }
  addToggle() {
    return this;
  }
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: false,
  isWin: false,
  isLinux: true,
};

export const Notice = class {
  constructor(_message?: string) {}
};

export const MarkdownView = class {
  editor: any = { getValue: () => '' };
};

export function normalizePath(p: string): string {
  return p;
}
