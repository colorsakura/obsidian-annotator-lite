import { DEBUG } from '../env';

type LogMethod = (...args: unknown[]) => void;

const noop: LogMethod = () => {};

interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

/**
 * 创建带命名空间的日志器。
 *
 * - `debug` / `info`：仅在开发模式（`__DEBUG__=true`）下输出，生产构建中被 tree-shake。
 * - `warn` / `error`：始终输出，用于关键错误和用户可见的警告。
 *
 * @param namespace 日志命名空间（如 `'ReaderController'`、`'AnnotationService'`）
 */
export function createLogger(namespace: string): Logger {
  const prefix = `[Annotator Lite][${namespace}]`;

  if (!DEBUG) {
    return {
      debug: noop,
      info: noop,
      warn: console.warn.bind(console, prefix),
      error: console.error.bind(console, prefix),
    };
  }

  return {
    debug: console.debug.bind(console, `${prefix}[DEBUG]`),
    info: console.info.bind(console, prefix),
    warn: console.warn.bind(console, prefix),
    error: console.error.bind(console, prefix),
  };
}
