import { App, PluginSettingTab, Setting } from 'obsidian';
import type AnnotatorLitePlugin from '../main';
import { DEFAULT_HIGHLIGHT_COLORS } from '../constants';

const FONT_SIZE_OPTIONS = [80, 90, 100, 110, 120, 130, 140, 150, 160];

export class AnnotatorLiteSettingTab extends PluginSettingTab {
  plugin: AnnotatorLitePlugin;

  constructor(app: App, plugin: AnnotatorLitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Annotator Lite 设置' });

    // ─── 阅读器默认设置 ─────────────────────────────────────────────
    containerEl.createEl('h3', { text: '阅读器默认设置' });

    new Setting(containerEl)
      .setName('默认字体大小')
      .setDesc('阅读器打开时的初始字体大小百分比')
      .addDropdown((dropdown) => {
        for (const size of FONT_SIZE_OPTIONS) {
          dropdown.addOption(String(size), `${size}%`);
        }
        dropdown.setValue(String(this.plugin.settings.defaultFontSize));
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultFontSize = Number(value);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('默认显示模式')
      .setDesc('阅读器打开时的默认翻页模式')
      .addDropdown((dropdown) => {
        dropdown.addOption('paginated', '分页');
        dropdown.addOption('scrolled', '滚动');
        dropdown.setValue(this.plugin.settings.defaultFlowMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultFlowMode = value as 'paginated' | 'scrolled';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('默认分栏')
      .setDesc('阅读器打开时的默认分栏模式')
      .addDropdown((dropdown) => {
        dropdown.addOption('single', '单列');
        dropdown.addOption('double', '双列');
        dropdown.setValue(this.plugin.settings.defaultColumnMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultColumnMode = value as 'single' | 'double';
          await this.plugin.saveSettings();
        });
      });

    // ─── 虚拟滚动设置 ────────────────────────────────────────────────
    containerEl.createEl('h3', { text: '虚拟滚动' });

    new Setting(containerEl)
      .setName('启用虚拟滚动')
      .setDesc('启用区块级虚拟滚动以提升大文档的渲染性能')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.virtualScroll.enabled)
          .onChange(async (value) => {
            this.plugin.settings.virtualScroll.enabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('区块大小')
      .setDesc('每个虚拟块的高度（像素），控制单次渲染的内容量')
      .addSlider((slider) =>
        slider
          .setLimits(500, 2000, 100)
          .setValue(this.plugin.settings.virtualScroll.blockSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.virtualScroll.blockSize = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('预加载边距')
      .setDesc('在可视区域上下额外渲染的范围（像素）')
      .addSlider((slider) =>
        slider
          .setLimits(50, 500, 50)
          .setValue(this.plugin.settings.virtualScroll.preloadMargin)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.virtualScroll.preloadMargin = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('最大缓存块数')
      .setDesc('内存中保留的最大虚拟块数量，超出时回收最远的块')
      .addSlider((slider) =>
        slider
          .setLimits(5, 30, 1)
          .setValue(this.plugin.settings.virtualScroll.maxCachedBlocks)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.virtualScroll.maxCachedBlocks = value;
            await this.plugin.saveSettings();
          }),
      );

    // ─── Highlight Colors ────────────────────────────────────────────
    containerEl.createEl('h3', { text: '高亮颜色' });

    const colors = this.plugin.settings.highlightColors;

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      new Setting(containerEl)
        .setName(color.name || `颜色 ${i + 1}`)
        .addText((text) =>
          text
            .setPlaceholder('#ffe066')
            .setValue(color.value)
            .onChange(async (value) => {
              colors[i].value = value;
              await this.plugin.saveSettings();
            }),
        )
        .addText((text) =>
          text
            .setPlaceholder('颜色名称')
            .setValue(color.name)
            .onChange(async (value) => {
              colors[i].name = value;
              await this.plugin.saveSettings();
            }),
        )
        .addButton((btn) =>
          btn
            .setIcon('trash')
            .setTooltip('删除')
            .onClick(async () => {
              colors.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    }

    new Setting(containerEl).setName('添加颜色').addButton((btn) =>
      btn
        .setButtonText('添加')
        .setCta()
        .onClick(async () => {
          colors.push({
            id: `custom-${Date.now()}`,
            value: '#ffffff',
            name: '自定义',
          });
          await this.plugin.saveSettings();
          this.display();
        }),
    );

    new Setting(containerEl).setName('恢复默认颜色').addButton((btn) =>
      btn.setButtonText('恢复默认').onClick(async () => {
        this.plugin.settings.highlightColors = [...DEFAULT_HIGHLIGHT_COLORS];
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }
}
