import { PluginSettingTab, Setting } from 'obsidian';
import type AnnotatorLitePlugin from './main';

export interface AnnotatorLiteSettings {
  flow: 'scrolled' | 'paginated';
  maxColumns: 'auto' | '1';
  margin: number;
  maxInlineSize: number;
  /** 列间距百分比（3-15），仅在 paginated 模式生效 */
  gap: number;
  /** 字体大小覆盖（px），0 表示不覆盖 */
  fontSize: number;
  /** 行高倍率 */
  lineHeight: number;
  /** 段落间距（em） */
  paragraphSpacing: number;
  /** 文本对齐 */
  textAlign: 'left' | 'justify';
  /** 断字 */
  hyphens: 'none' | 'auto';
  /** 首行缩进（em），0 表示不缩进 */
  textIndent: number;
}

export const DEFAULT_SETTINGS: AnnotatorLiteSettings = {
  flow: 'scrolled',
  maxColumns: 'auto',
  margin: 60,
  maxInlineSize: 720,
  gap: 7,
  fontSize: 0,
  lineHeight: 1.8,
  paragraphSpacing: 0.5,
  textAlign: 'justify',
  hyphens: 'none',
  textIndent: 0,
};

export class AnnotatorLiteSettingTab extends PluginSettingTab {
  plugin: AnnotatorLitePlugin;

  constructor(app: any, plugin: AnnotatorLitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Flow mode')
      .setDesc('How the reader advances through content')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('scrolled', 'Scrolled')
          .addOption('paginated', 'Paginated')
          .setValue(this.plugin.settings.flow)
          .onChange(async (value) => {
            this.plugin.settings.flow = value as 'scrolled' | 'paginated';
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Max columns')
      .setDesc(
        'Maximum number of columns in paginated mode. Auto lets the reader decide based on viewport size',
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('auto', 'Auto')
          .addOption('1', 'Single column')
          .setValue(this.plugin.settings.maxColumns)
          .onChange(async (value) => {
            this.plugin.settings.maxColumns = value as 'auto' | '1';
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Margin')
      .setDesc('Page margin in pixels')
      .addSlider((slider) =>
        slider
          .setLimits(0, 200, 10)
          .setValue(this.plugin.settings.margin)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.margin = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Max inline size')
      .setDesc('Maximum width of the text area in pixels')
      .addSlider((slider) =>
        slider
          .setLimits(400, 1200, 20)
          .setValue(this.plugin.settings.maxInlineSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxInlineSize = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Column gap')
      .setDesc('Gap between columns in paginated mode (percentage)')
      .addSlider((slider) =>
        slider
          .setLimits(3, 15, 1)
          .setValue(this.plugin.settings.gap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.gap = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl).setName('Typography').setHeading();

    new Setting(containerEl)
      .setName('Font size')
      .setDesc('Override base font size in px. Set to 0 to use the book default')
      .addSlider((slider) =>
        slider
          .setLimits(0, 32, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Line height')
      .setDesc('Line height multiplier')
      .addSlider((slider) =>
        slider
          .setLimits(1.2, 2.8, 0.1)
          .setValue(this.plugin.settings.lineHeight)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.lineHeight = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Paragraph spacing')
      .setDesc('Space between paragraphs in em')
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.paragraphSpacing)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.paragraphSpacing = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Text indent')
      .setDesc('First-line indent in em. Set to 0 for no indent')
      .addSlider((slider) =>
        slider
          .setLimits(0, 4, 0.5)
          .setValue(this.plugin.settings.textIndent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.textIndent = value;
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Text alignment')
      .setDesc('How text is aligned in the body')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('left', 'Left')
          .addOption('justify', 'Justify')
          .setValue(this.plugin.settings.textAlign)
          .onChange(async (value) => {
            this.plugin.settings.textAlign = value as 'left' | 'justify';
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );

    new Setting(containerEl)
      .setName('Hyphens')
      .setDesc('Enable automatic hyphenation for Latin scripts')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('none', 'Off')
          .addOption('auto', 'Auto')
          .setValue(this.plugin.settings.hyphens)
          .onChange(async (value) => {
            this.plugin.settings.hyphens = value as 'none' | 'auto';
            await this.plugin.saveSettings();
            this.plugin.applySettings();
          }),
      );
  }
}
