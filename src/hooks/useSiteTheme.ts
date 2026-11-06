import { useContext } from 'react';
import { ThemeBridgeContext } from '../app/providers/ThemeBridgeProvider';

export function useSiteTheme() {
  return useContext(ThemeBridgeContext);
}
