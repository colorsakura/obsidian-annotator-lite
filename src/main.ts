import { MarkdownView, MenuItem, Plugin, TFile } from 'obsidian';
import { ReaderView } from './views/ReaderView';
import { OutlineView } from './views/OutlineView';
import { AnnotationsView } from './views/AnnotationsView';
import {
  ANNOTATION_TARGET_PROPERTY,
  ANNOTATIONS_VIEW_TYPE,
  ICON_NAME,
  OUTLINE_VIEW_TYPE,
  READER_VIEW_TYPE,
} from './constants';
import { AnnotationIndexService, DatacoreAdapter } from './datacore';
import {
  type AnnotationRepository,
  MarkdownAnnotationRepository,
} from './services/AnnotationRepository';
import { ReaderSessionStore } from './services/ReaderSessionStore';
import { ObsidianTargetResolver, type TargetResolver } from './services/TargetResolver';
import { AnnotationService } from './services/AnnotationService';
import { ReaderEventBus } from './services/ReaderEventBus';
import { DefaultReaderController } from './services/ReaderController';
import { ObsidianViewCoordinator, type ViewCoordinator } from './services/ViewCoordinator';
import { setSessionStore } from './contexts/ReaderStoreContext';
import { setReaderAPI } from './contexts/ReaderAPIContext';
import { type AnnotatorLiteSettings, DEFAULT_SETTINGS } from './services/Settings';
import { AnnotatorLiteSettingTab } from './components/SettingsTab';

export default class AnnotatorLitePlugin extends Plugin {
  private annotationRepository!: AnnotationRepository;
  private targetResolver!: TargetResolver;
  private sessionStore = new ReaderSessionStore();
  private viewCoordinator!: ViewCoordinator;
  private readerController!: DefaultReaderController;

  /** Datacore 适配器（优先 Datacore API，回退 metadataCache） */
  datacoreAdapter!: DatacoreAdapter;
  /** 标注索引服务（内存索引 + 前置元持久化） */
  annotationIndex!: AnnotationIndexService;

  settings: AnnotatorLiteSettings = DEFAULT_SETTINGS;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    // 注册 SessionStore 到模块级单例，供 React 组件通过 useSessionStore() 访问
    setSessionStore(this.sessionStore);

    // 初始化 Datacore 适配器和标注索引服务
    this.datacoreAdapter = new DatacoreAdapter(this.app);
    this.annotationIndex = new AnnotationIndexService(this.datacoreAdapter);
    this.annotationRepository = new MarkdownAnnotationRepository(this.app.vault);
    this.targetResolver = new ObsidianTargetResolver(this.app, (propertyName, file) =>
      this.getPropertyValue(propertyName, file),
    );
    this.viewCoordinator = new ObsidianViewCoordinator(this.app);
    const bus = new ReaderEventBus();
    const annotationService = new AnnotationService(
      this.app,
      this.annotationRepository,
      this.annotationIndex,
      this.sessionStore,
      bus,
    );
    this.readerController = new DefaultReaderController(
      this.app,
      this.targetResolver,
      annotationService,
      this.sessionStore,
      this.viewCoordinator,
      bus,
      () => this.settings.highlightColors,
      () => this.settings,
    );
    setReaderAPI(this.readerController);

    this.registerView(READER_VIEW_TYPE, (leaf) => new ReaderView(leaf));

    this.registerView(OUTLINE_VIEW_TYPE, (leaf) => new OutlineView(leaf));

    this.registerView(ANNOTATIONS_VIEW_TYPE, (leaf) => new AnnotationsView(leaf));

    await this.loadSettings();
    this.addSettingTab(new AnnotatorLiteSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      // 尝试激活 Datacore 索引层
      this.datacoreAdapter.tryInitialize();

      this.registerEvent(
        this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
          if (
            leaf?.view instanceof MarkdownView &&
            file instanceof TFile &&
            this.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file)
          ) {
            menu.addItem(
              (item: MenuItem): MenuItem =>
                item
                  .setTitle('Annotate')
                  .setIcon(ICON_NAME)
                  .onClick(async () => {
                    await this.readerController.openFromMarkdownLeaf(leaf);
                  }),
            );
          }
        }),
      );

      // 监听标注链接点击：当用户在标注数据 MD 文件中点击 "show annotation" 链接时，
      // 跳转到阅读视图中的对应位置
      this.registerDomEvent(activeDocument, 'click', (evt: MouseEvent) => {
        // 在捕获阶段检查是否是标注链接
        const target = evt.target as HTMLElement;
        const link = target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        // 匹配格式 #^annotationId（如 #^abc123）
        if (!href || !/^#\^[a-z0-9]+$/.test(href)) return;

        // 检查当前活跃的 Markdown 视图是否包含 annotation-target 前置元
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        const file = activeView.file;
        if (!file || !this.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file)) return;

        evt.preventDefault();
        evt.stopPropagation();

        const annotationId = href.substring(2); // 去掉 '#^'
        void this.readerController.navigateToAnnotation(annotationId);
      });
    });
  }

  onunload() {}

  /**
   * 读取前置元字段值
   *
   * 通过 DatacoreAdapter 统一入口：Datacore API 优先 → metadataCache 回退。
   * 所有链接解析逻辑封装在适配器中。
   */
  private getPropertyValue(propertyName: string, file: TFile): unknown {
    return this.datacoreAdapter.getFrontmatter(file, propertyName);
  }
}
