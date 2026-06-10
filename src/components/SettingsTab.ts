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
