import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

export interface NoteModalResult {
  note: string;
  cancelled: boolean;
}

export class NoteModal extends Modal {
  private note = '';
  private saved = false;
  private resolvePromise!: (value: NoteModalResult) => void;
  private promise: Promise<NoteModalResult>;

  constructor(app: App) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });

    this.titleEl.setText(t('annotations.noteModal.title'));

    const textarea = this.contentEl.createEl('textarea', {
      attr: {
        rows: '6',
        placeholder: t('annotations.noteModal.placeholder'),
        style:
          'width: 100%; resize: vertical; padding: 8px; border-radius: 4px; ' +
          'border: 1px solid var(--background-modifier-border); ' +
          'background: var(--background-primary); color: var(--text-normal); font-size: 14px;',
      },
    });
    textarea.addEventListener('input', () => {
      this.note = textarea.value;
    });
    // Focus and select a reasonable width
    textarea.focus();
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.saved = true;
        this.close();
      }
    });

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn
          .setButtonText(t('common.save'))
          .setCta()
          .onClick(() => {
            this.saved = true;
            this.close();
          });
      })
      .addButton((btn) => {
        btn.setButtonText(t('common.cancel')).onClick(() => {
          this.close();
        });
      });
  }

  get result(): Promise<NoteModalResult> {
    return this.promise;
  }

  onClose(): void {
    this.resolvePromise({ note: this.saved ? this.note : '', cancelled: !this.saved });
  }
}
