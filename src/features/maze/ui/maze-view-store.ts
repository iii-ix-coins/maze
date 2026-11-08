/**
 * Small external store for the in-race HUD. The simulation remains the source of
 * truth; the engine publishes display snapshots at its existing update points.
 * React subscribes to these snapshots and owns every rendered HUD node.
 */
export type WinStat = { value: string | number; label: string };

export type MazeHudSnapshot = {
  steps: number;
  time: string;
  goals: string;
  zoom: string;
  hintsLeft: number;
  hintDisabled: boolean;
  follow: boolean;
  fogOn: boolean;
  miniMapVisible: boolean;
  resultVisible: boolean;
  resultMessage: string;
  resultStats: WinStat[];
  resultButtonLabel: string;
  panelButtonLabel: string;
  bannerVisible: boolean;
  bannerText: string;
  confirmVisible: boolean;
  confirmTitle: string;
  confirmText: string;
  mazeTheme: string;
};

const initialSnapshot: MazeHudSnapshot = {
  steps: 0,
  time: '0:00',
  goals: '0/3',
  zoom: '100%',
  hintsLeft: 0,
  hintDisabled: true,
  follow: true,
  fogOn: false,
  miniMapVisible: false,
  resultVisible: false,
  resultMessage: '',
  resultStats: [],
  resultButtonLabel: 'New Maze',
  panelButtonLabel: 'New Maze',
  bannerVisible: false,
  bannerText: '',
  confirmVisible: false,
  confirmTitle: 'End current game?',
  confirmText: 'The game will stop and the shortest paths from the start to every point will be shown.',
  mazeTheme: 'grass',
};

let snapshot = initialSnapshot;
const listeners = new Set<() => void>();

export const mazeHudStore = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function publish(next: MazeHudSnapshot) {
  const keys = Object.keys(next) as (keyof MazeHudSnapshot)[];
  if (keys.every(key => Object.is(snapshot[key], next[key]))) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

export function publishHud(patch: Partial<MazeHudSnapshot>) {
  publish({ ...snapshot, ...patch });
}

export function showMazeResult(message: string, stats: WinStat[]) {
  publish({ ...snapshot, resultVisible: true, resultMessage: message, resultStats: stats });
}

export function hideMazeResult() {
  publish({ ...snapshot, resultVisible: false, resultMessage: '', resultStats: [] });
}

export function setNewMazeButtonLabel(label: string) {
  publishHud({ resultButtonLabel: label, panelButtonLabel: label });
}

export function showMazeBanner(message: string) {
  publishHud({ bannerVisible: true, bannerText: message });
}

export function hideMazeBanner() {
  publishHud({ bannerVisible: false, bannerText: '' });
}

export function setMazeConfirmContent(title: string, message: string) {
  publishHud({ confirmTitle: title, confirmText: message });
}

export function showMazeConfirm() {
  publishHud({ confirmVisible: true });
}

export function hideMazeConfirm() {
  publishHud({ confirmVisible: false });
}

export function setMazeTheme(theme: string) {
  publishHud({ mazeTheme: theme });
}
