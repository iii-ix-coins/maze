/**
 * One player name shared by every input that edits it (the launch step of the wizard and the Rooms / Live
 * toolbars), persisted in localStorage. Typing in one box updates the others instantly.
 */
const KEY = 'mazePlayerName';
const MAX = 24;
const inputs = new Set<any>();
let value = '';
try { value = String(localStorage.getItem(KEY) || '').slice(0, MAX); } catch (_) { /* storage unavailable */ }

export const getPlayerName = () => value.trim() || 'Player';

function set(next, source) {
    value = String(next).slice(0, MAX);
    try { localStorage.setItem(KEY, value.trim()); } catch (_) { /* ignore */ }
    for (const input of inputs) if (input !== source && input.value !== value) input.value = value;
}

export function bindNameInput(input) {
    if (!input || inputs.has(input)) return;
    inputs.add(input);
    input.value = value;
    input.maxLength = MAX;
    input.addEventListener('input', () => set(input.value, input));
}
