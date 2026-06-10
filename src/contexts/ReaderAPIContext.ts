import { createContext, useContext } from 'react';
import type { ReaderAPI } from '../services/ReaderAPI';

export const ReaderAPIContext = createContext<ReaderAPI | null>(null);

let _api: ReaderAPI | null = null;

export function setReaderAPI(api: ReaderAPI): void {
  _api = api;
}

export function getReaderAPI(): ReaderAPI | null {
  return _api;
}

export function useReader(): ReaderAPI {
  const api = useContext(ReaderAPIContext);
  if (!api) throw new Error('useReader must be used within ReaderAPIContext.Provider');
  return api;
}
