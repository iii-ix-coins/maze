/** Shared, persisted racer name. The React wizard is the only name editor. */
const KEY = 'mazePlayerName';
const MAX = 24;
let value = '';
try { value = String(localStorage.getItem(KEY) || '').slice(0, MAX); } catch { /* storage unavailable */ }

export const getPlayerName = () => value.trim() || 'Player';
export function setPlayerName(next: string) {
  value = String(next || '').slice(0, MAX);
  try { localStorage.setItem(KEY, value.trim()); } catch { /* ignore */ }
  return value;
}
