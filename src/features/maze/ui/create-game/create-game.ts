/**
 * State-only controller for the Create Game wizard and menu shell.
 * Rendering and user interaction live in React; this class is the stable API
 * consumed by the TypeScript game engine and LobbyHub.
 */
import { DIFFICULTIES, MAX_GOALS, MAX_PLAYERS, MIN_GOALS, MIN_PLAYERS } from '@maze/shared';
import { mazeUiStore, type MazeMenuView } from '../react/maze-ui-store';
import { getPlayerName, setPlayerName } from '../lobby/player-name';

const STORAGE_KEY = 'mazeCreateGame';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function loadState() {
  const fallback = { levelIndex: 1, players: 1, goals: 3, separate: false, playerName: '' };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || typeof value !== 'object') return fallback;
    return {
      levelIndex: clamp(Math.round(Number(value.levelIndex) || fallback.levelIndex), 0, 2),
      players: clamp(Math.round(Number(value.players) || fallback.players), MIN_PLAYERS, MAX_PLAYERS),
      goals: clamp(Math.round(Number(value.goals) || fallback.goals), MIN_GOALS, MAX_GOALS),
      separate: value.separate === true,
      playerName: String(value.playerName || getPlayerName()).slice(0, 24),
    };
  } catch {
    return fallback;
  }
}

export class CreateGameComponent {
  onLaunch: (config: any) => any = () => undefined;
  onViewChange: (view: MazeMenuView, previous: MazeMenuView) => void = () => undefined;
  onVisibility: (visible: boolean) => void = () => undefined;

  constructor() {
    const saved = loadState();
    mazeUiStore.patch(saved);
  }

  private get state() { return mazeUiStore.getSnapshot(); }
  get size() { return DIFFICULTIES[this.state.levelIndex].size; }
  get visible() { return this.state.visible; }
  get view() { return this.state.view; }

  setOnLaunch(callback: (config: any) => any) { this.onLaunch = callback; }

  getConfig() {
    const state = this.state;
    return {
      size: DIFFICULTIES[state.levelIndex].size,
      players: state.players,
      goals: state.goals,
      name: state.playerName.trim() || 'Player',
      separate: state.separate && state.players > 1,
    };
  }

  saveState() {
    try {
      const { levelIndex, players, goals, separate, playerName } = this.state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ levelIndex, players, goals, separate, playerName }));
    } catch { /* Storage may be disabled. */ }
  }

  updateSetup(patch: Partial<Pick<ReturnType<CreateGameComponent['getConfig']>, 'size' | 'players' | 'goals' | 'name' | 'separate'>> & {
    levelIndex?: number; playerName?: string;
  }) {
    const current = this.state;
    const next = {
      levelIndex: patch.levelIndex == null
        ? (patch.size == null ? current.levelIndex : clamp(DIFFICULTIES.findIndex(level => level.size === Number(patch.size)), 0, 2))
        : clamp(Math.round(patch.levelIndex), 0, 2),
      players: patch.players == null ? current.players : clamp(Math.round(patch.players), MIN_PLAYERS, MAX_PLAYERS),
      goals: patch.goals == null ? current.goals : clamp(Math.round(patch.goals), MIN_GOALS, MAX_GOALS),
      separate: patch.separate == null ? current.separate : patch.separate === true,
      playerName: patch.playerName == null && patch.name == null ? current.playerName : String(patch.playerName ?? patch.name).slice(0, 24),
    };
    mazeUiStore.patch(next);
    if (patch.playerName != null || patch.name != null) setPlayerName(next.playerName);
    this.saveState();
  }

  show({ step = 0, view = null }: { step?: number; view?: MazeMenuView | null } = {}) {
    const previousVisible = this.visible;
    const previousView = this.state.view;
    const nextView = view || this.state.homeView || 'create';
    mazeUiStore.patch({
      visible: true,
      showVersion: this.state.showVersion + 1,
      launching: false,
      holdProgress: 0,
      holdPhase: 'idle',
      step: clamp(step, 0, 3),
      maxStep: clamp(step, 0, 3),
      view: nextView,
      homeView: nextView === 'room' ? this.state.homeView : nextView,
    });
    if (!previousVisible) this.onVisibility(true);
    if (nextView !== previousView) this.onViewChange(nextView, previousView);
  }

  hide() {
    if (!this.visible) return;
    mazeUiStore.patch({ visible: false, holdProgress: 0, holdPhase: 'idle' });
    this.onVisibility(false);
  }

  setView(name: MazeMenuView, _options: { instant?: boolean } = {}) {
    const current = this.state.view;
    if (current === name) return;
    mazeUiStore.patch({ view: name, homeView: name === 'room' ? this.state.homeView : name });
    this.onViewChange(name, current);
  }

  setNetworkStatus(state: string, _message?: string) {
    mazeUiStore.patch({ network: state });
  }

  updateLobbyCounts(counts: any) {
    mazeUiStore.patch({ waitingByMode: counts?.waitingByMode || {} });
  }

  setOpenRooms(rooms: any[] | null, counts?: any) {
    mazeUiStore.patch({
      openRooms: Array.isArray(rooms) ? rooms : null,
      ...(counts ? { waitingByMode: counts.waitingByMode || {} } : {}),
    });
  }

  setTabCount(name: 'rooms' | 'live', count: number) {
    mazeUiStore.patch(current => ({ tabCounts: { ...current.tabCounts, [name]: Math.max(0, Number(count) || 0) } }));
  }

  goTo(step: number) {
    if (this.state.launching) return;
    const next = clamp(Math.round(step), 0, 3);
    mazeUiStore.patch(current => ({ step: next, maxStep: Math.max(current.maxStep, next) }));
  }

  setHold(progress: number, phase: 'idle' | 'holding' | 'done') {
    mazeUiStore.patch({ holdProgress: clamp(progress, 0, 1), holdPhase: phase });
  }

  async launch() {
    if (this.state.launching) return;
    mazeUiStore.patch({ launching: true, holdPhase: 'done', holdProgress: 1 });
    try {
      const result = await this.onLaunch(this.getConfig());
      if (result === 'stay') {
        mazeUiStore.patch({ launching: false, holdPhase: 'idle', holdProgress: 0 });
      } else {
        this.hide();
      }
      return result;
    } catch (error) {
      console.error('[Maze] Game launch failed:', error);
      mazeUiStore.patch({ launching: false, holdPhase: 'idle', holdProgress: 0 });
      mazeUiStore.showToast('The game could not start. Please try again.', { tone: 'warn' });
      return 'stay';
    }
  }
}

export const createGame = new CreateGameComponent();
