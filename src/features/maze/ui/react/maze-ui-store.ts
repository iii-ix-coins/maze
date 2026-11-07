export type MazeMenuView = 'create' | 'rooms' | 'live' | 'room';

export interface MazeUiState {
  visible: boolean;
  showVersion: number;
  view: MazeMenuView;
  homeView: 'create' | 'rooms' | 'live';
  step: number;
  maxStep: number;
  levelIndex: number;
  players: number;
  goals: number;
  separate: boolean;
  playerName: string;
  launching: boolean;
  holdProgress: number;
  holdPhase: 'idle' | 'holding' | 'done';
  network: string;
  waitingByMode: Record<string, number>;
  openRooms: any[] | null;
  tabCounts: { rooms: number; live: number };
  rooms: any[];
  live: any[];
  recent: any[];
  storeReady: boolean;
  roomMode: 'joining' | 'room' | 'notice';
  roomJoining: any | null;
  room: any | null;
  roomYouId: string;
  roomNotice: { title: string; text: string; eyebrow?: string; actions: any[] } | null;
  legacyRoom: { waiting: number; required: number } | null;
  busyRoomIds: string[];
  peekMazes: Record<string, any>;
  peekFrames: Record<string, any>;
  copied: boolean;
  toast: { id: number; message: string; tone?: string; action?: { label: string; key?: string; onClick?: () => void } } | null;
  now: number;
}

const initialState: MazeUiState = {
  visible: false,
  showVersion: 0,
  view: 'create',
  homeView: 'create',
  step: 0,
  maxStep: 0,
  levelIndex: 1,
  players: 1,
  goals: 3,
  separate: false,
  playerName: '',
  launching: false,
  holdProgress: 0,
  holdPhase: 'idle',
  network: 'offline',
  waitingByMode: {},
  openRooms: null,
  tabCounts: { rooms: 0, live: 0 },
  rooms: [],
  live: [],
  recent: [],
  storeReady: false,
  roomMode: 'joining',
  roomJoining: null,
  room: null,
  roomYouId: '',
  roomNotice: null,
  legacyRoom: null,
  busyRoomIds: [],
  peekMazes: {},
  peekFrames: {},
  copied: false,
  toast: null,
  now: Date.now(),
};

type Listener = () => void;

class MazeUiStore {
  private state: MazeUiState = initialState;
  private listeners = new Set<Listener>();
  private toastId = 0;
  private actions: Record<string, (...args: any[]) => any> = {};

  getSnapshot = () => this.state;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  patch(patch: Partial<MazeUiState> | ((current: MazeUiState) => Partial<MazeUiState>)) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  registerActions(actions: Record<string, (...args: any[]) => any>) {
    this.actions = { ...this.actions, ...actions };
  }

  action(name: string, ...args: any[]) {
    return this.actions[name]?.(...args);
  }

  showToast(message: string, options: any = {}) {
    const id = ++this.toastId;
    this.patch({ toast: { id, message: String(message || ''), tone: options.tone, action: options.action } });
    return id;
  }

  clearToast(id?: number) {
    if (id == null || this.state.toast?.id === id) this.patch({ toast: null });
  }
}

export const mazeUiStore = new MazeUiStore();
