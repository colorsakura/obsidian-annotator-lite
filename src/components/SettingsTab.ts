import { App, PluginSettingTab, Setting } from 'obsidian';
import type AnnotatorLitePlugin from '../main';
import { DEFAULT_HIGHLIGHT_COLORS } from '../constants';
import { t, getLanguage, setLanguage } from '../i18n';
import type { Locale } from '../i18n/types';

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

    containerEl.createEl('h2', { text: t('settings.title') });

    // ─── 语言设置 ───────────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t('settings.language.label'))
      .setDesc(t('settings.language.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('zh', '中文');
        dropdown.addOption('en', 'English');
        // 如果 settings.language 为 undefined（自动检测），用当前实际语言显示
        const displayLang = this.plugin.settings.language ?? getLanguage();
        dropdown.setValue(displayLang);
        dropdown.onChange(async (value) => {
          const locale = value as Locale;
          this.plugin.settings.language = locale;
          this.plugin.setLanguageExplicitlySet();
          setLanguage(locale);
          await this.plugin.saveSettings();
          // 刷新设置面板以应用新语言（下次 display 触发时翻译设置面板自身文字）
        });
      });

    // ─── 阅读器默认设置 ─────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('settings.reader') });

    new Setting(containerEl)
      .setName(t('settings.fontSize.label'))
      .setDesc(t('settings.fontSize.desc'))
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
      .setName(t('settings.flowMode.label'))
      .setDesc(t('settings.flowMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('paginated', t('reader.flowMode.paginated'));
        dropdown.addOption('scrolled', t('reader.flowMode.scrolled'));
        dropdown.setValue(this.plugin.settings.defaultFlowMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultFlowMode = value as 'paginated' | 'scrolled';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('settings.columnMode.label'))
      .setDesc(t('settings.columnMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('single', t('reader.columnMode.single'));
        dropdown.addOption('double', t('reader.columnMode.double'));
        dropdown.setValue(this.plugin.settings.defaultColumnMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultColumnMode = value as 'single' | 'double';
          await this.plugin.saveSettings();
        });
      });

    // ─── Highlight Colors ────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('settings.highlightColors') });

    const colors = this.plugin.settings.highlightColors;

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      new Setting(containerEl)
        .setName(color.name || `${t('settings.color.defaultName')} ${i + 1}`)
        .addText((text) =>
          text
            .setPlaceholder(t('settings.colorValue.placeholder'))
            .setValue(color.value)
            .onChange(async (value) => {
              colors[i].value = value;
              await this.plugin.saveSettings();
            }),
        )
        .addText((text) =>
          text
            .setPlaceholder(t('settings.colorName.placeholder'))
            .setValue(color.name)
            .onChange(async (value) => {
              colors[i].name = value;
              await this.plugin.saveSettings();
            }),
        )
        .addButton((btn) =>
          btn
            .setIcon('trash')
            .setTooltip(t('settings.delete.tooltip'))
            .onClick(async () => {
              colors.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    }

    new Setting(containerEl).setName(t('settings.addColor.label')).addButton((btn) =>
      btn
        .setButtonText(t('settings.addColor.button'))
        .setCta()
        .onClick(async () => {
          colors.push({
            id: `custom-${Date.now()}`,
            value: '#ffffff',
            name: t('settings.color.defaultName'),
          });
          await this.plugin.saveSettings();
          this.display();
        }),
    );

    new Setting(containerEl).setName(t('settings.resetColors.label')).addButton((btn) =>
      btn.setButtonText(t('settings.resetColors.button')).onClick(async () => {
        this.plugin.settings.highlightColors = [...DEFAULT_HIGHLIGHT_COLORS];
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }
}
