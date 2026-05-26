import React, { useContext } from 'react';
import { App } from 'obsidian';

export const AppContext = React.createContext<App | undefined>(undefined);

export const useObsidianApp = (): App | undefined => {
  return useContext(AppContext);
};
