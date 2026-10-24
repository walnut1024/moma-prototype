import { createContext } from 'react';

// React context follows portals, so backend overlays retain the backend theme.
export const AdminUIContext = createContext(false);
