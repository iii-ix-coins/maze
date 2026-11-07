/** Persisted presentation preferences shared by the React Rooms and Live panels. */
const STORAGE_KEY = 'mazeLobbyPrefs';

export function loadLobbyPreferences(): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function saveLobbyPreferences(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadLobbyPreferences(), ...patch }));
  } catch {
    // Storage may be disabled or full; preferences remain usable for this session.
  }
}
