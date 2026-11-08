/**
 * Data/protocol coordinator for multiplayer lobby flows.
 * No view classes, DOM writes, or element references live here. React owns all
 * Rooms, Room Details and Live Races markup; this class only coordinates the
 * multiplayer client and publishes immutable UI snapshots.
 */
import { LobbyStore } from './lobby-store';
import { ICONS } from './icons';
import { getPlayerName } from './player-name';
import { mazeUiStore } from '../react/maze-ui-store';

const LOBBY_VIEWS = new Set(['create', 'rooms', 'live']);
const MAX_PEEK_CACHE = 24;

function frameThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let queued = false;
  return ((...args: any[]) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...args); });
  }) as T;
}

export class LobbyHub {
  client: any;
  shell: any;
  getServerUrl: () => string;
  retryConnection: () => void;
  store: LobbyStore;
  network = 'offline';
  phase: 'idle' | 'joining' | 'inRoom' = 'idle';
  pending = '';
  returnView: 'create' | 'rooms' | 'live' | 'room' = 'create';
  lastSetup: any = null;
  watching = false;
  pendingCode = '';
  tickTimer: ReturnType<typeof setInterval> | 0 = 0;
  peekedIds: string[] = [];
  mazeCache = new Map<string, any>();
  frameCache = new Map<string, any>();
  busyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  noticeTimer: ReturnType<typeof setTimeout> | 0 = 0;

  constructor({ client, shell, getServerUrl, retryConnection }: any) {
    this.client = client;
    this.shell = shell;
    this.getServerUrl = getServerUrl;
    this.retryConnection = retryConnection;
    this.store = new LobbyStore();

    const publish = frameThrottle(() => this.refreshAll());
    this.store.subscribe(() => publish());
    shell.onViewChange = (view: string, previous: string) => this.viewChanged(view, previous);
    shell.onVisibility = (visible: boolean) => this.visibilityChanged(visible);

    mazeUiStore.registerActions({
      joinRoom: (room: any) => this.joinRoom(room),
      joinCode: (code: string) => this.joinCode(code),
      watchRoom: (room: any) => this.watchRoom(room),
      leaveRoom: () => this.leaveRoom(),
      startRoom: () => this.client.startRoom(),
      retryConnection: () => this.retryConnection(),
      browseRooms: () => this.shell.setView('rooms'),
      backToLobby: () => this.backToLobby(),
      copyInvite: (code: string) => this.copyInvite(code),
      requestPeeks: (ids: string[]) => this.requestPeeks(ids),
      roomNoticeAction: (key: string) => this.roomNoticeAction(key),
      toastAction: (key: string) => this.toastAction(key),
    });
  }

  get online() { return this.network === 'online'; }
  get status() {
    if (this.network === 'online' && this.client.protocol && this.client.protocol < 2) return 'old';
    return this.network;
  }
  get supportsRooms() { return this.client.supportsRooms(); }
  get youId() { return this.client.selfId; }

  onNetwork(state: string) {
    const was = this.network;
    this.network = state;
    this.shell.setNetworkStatus(state);
    if (state !== 'online') {
      this.watching = false;
      this.store.reset();
      this.forgetPeeks();
      if (was === 'online' || was === 'connecting') this.connectionLost(state);
    }
    this.pushStatus();
    this.refreshAll();
  }

  pushStatus() {
    mazeUiStore.patch({ network: this.status });
    this.syncWatch();
  }

  connectionLost(state: string) {
    if (state === 'connecting') return;
    if (this.phase === 'joining' || this.phase === 'inRoom') {
      const joining = this.phase === 'joining';
      this.phase = 'idle';
      if (this.shell.view === 'room' && this.shell.visible) {
        this.showRoomNotice({
          title: joining ? 'Server unavailable' : 'Connection lost',
          text: joining
            ? 'Could not reach the game. Check your connection and try again.'
            : 'The connection dropped, so you were removed from the room. Reconnecting happens automatically.',
          actions: [
            { label: 'Back to lobby', primary: true, key: 'back', icon: ICONS.back },
            { label: 'Reconnect', key: 'retry', icon: ICONS.server },
          ],
        });
      }
    }
    this.clearBusy();
  }

  handleMessage(message: any) {
    switch (message.type) {
      case 'connected':
        this.pushStatus();
        this.consumePendingCode();
        return false;
      case 'lobby:state':
        this.store.applyState(message);
        return true;
      case 'lobby:patch':
        this.store.applyPatch(message);
        return true;
      case 'peek:maze':
      case 'peek:frame':
      case 'peek:end':
        this.onPeekMessage(message);
        return true;
      case 'room:joined':
        this.onJoined(message);
        return true;
      case 'room:state':
        if (this.phase === 'inRoom' || this.phase === 'joining') this.onJoined({ room: message.room, you: this.youId });
        return true;
      case 'room:notice':
        this.notice(message.message || 'The room changed.');
        return true;
      case 'room:error':
        return this.onRoomError(message);
      case 'room:closed':
        if (!this.shell.visible) return false;
        if (this.phase !== 'idle') this.closedWhileWaiting(message);
        return true;
      case 'queue:waiting':
        if (this.supportsRooms || !this.shell.visible) return this.supportsRooms;
        if (this.phase === 'joining' || this.phase === 'inRoom') {
          this.phase = 'inRoom';
          mazeUiStore.patch({
            roomMode: 'room',
            room: null,
            roomJoining: null,
            roomNotice: null,
            legacyRoom: {
              waiting: Math.max(0, Number(message.waitingPlayers) || 0),
              required: Math.max(1, Number(message.requiredPlayers || message.players) || 1),
            },
          });
          this.shell.setView('room');
        }
        return true;
      case 'room:forming':
        return this.supportsRooms;
      case 'queue:left':
        return this.supportsRooms;
      case 'match:error':
      case 'protocol:error':
        return this.shell.visible ? this.onRoomError({ ...message, code: message.code || 'invalid' }) : false;
      default:
        return false;
    }
  }

  onJoined(message: any) {
    this.phase = 'inRoom';
    this.pending = '';
    this.clearBusy();
    mazeUiStore.patch({
      roomMode: 'room',
      roomJoining: null,
      room: message.room || null,
      roomYouId: message.you || this.youId,
      roomNotice: null,
      legacyRoom: null,
    });
    if (this.shell.visible && this.shell.view !== 'room') this.shell.setView('room');
  }

  onRoomError(message: any) {
    const code = message.code;
    if (code === 'stale') return true;
    const wasPending = this.pending;
    this.clearBusy();
    if (this.phase === 'joining') {
      this.phase = 'idle';
      this.pending = '';
      this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
    }
    if ((code === 'started' || code === 'full') && message.roomId && wasPending !== 'quick') {
      const room = this.store.get(message.roomId);
      if (room && room.phase === 'playing') {
        this.notice('That race has already started.', {
          tone: 'warn',
          action: { label: 'Watch it', onClick: () => this.watchRoom(room), key: `watch:${room.id}` },
        });
        return true;
      }
    }
    this.notice(message.message || 'That did not work.', { tone: 'warn' });
    return true;
  }

  closedWhileWaiting(message: any) {
    const was = this.phase;
    this.phase = 'idle';
    this.pending = '';
    this.notice(message.message || 'The room closed.', { tone: 'warn' });
    if (this.shell.view === 'room') this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
    return was;
  }

  showJoining(details: any) {
    mazeUiStore.patch({
      roomMode: 'joining',
      room: null,
      roomYouId: '',
      roomNotice: null,
      legacyRoom: null,
      roomJoining: details,
    });
  }

  showRoomNotice({ title = 'Something went wrong', text = 'Please try again.', actions = [], eyebrow = 'Online race' }: any = {}) {
    mazeUiStore.patch({
      roomMode: 'notice',
      room: null,
      roomJoining: null,
      legacyRoom: null,
      roomNotice: { title, text, eyebrow, actions },
    });
  }

  quickMatch(config: any) {
    const url = this.getServerUrl();
    this.rememberReturn();
    this.lastSetup = config;
    this.showJoining({
      size: config.size, players: config.players, goals: config.goals,
      title: config.separate ? 'Opening your room…' : 'Finding you a seat…',
      text: config.separate ? 'A new room with your setup, listed for everyone.' : 'Joining a room with this exact setup, or opening one.',
      seats: [],
    });
    this.shell.setView('room');
    if (!url) {
      this.phase = 'idle';
      this.pending = '';
      this.showRoomNotice({
        eyebrow: 'Multiplayer unavailable',
        title: 'Online play is not configured',
        text: 'The game server address is missing for this site. Solo play is still available; ask the site administrator to finish the multiplayer server settings.',
        actions: [{ label: 'Back to setup', primary: true, key: 'back', icon: ICONS.back }],
      });
      return;
    }
    this.phase = 'joining';
    this.pending = 'quick';
    this.client.connect(url);
    this.client.quickMatch(config, { separate: !!config.separate });
  }

  joinRoom(room: any) {
    if (!this.beginJoin(room, 'join')) return;
    this.client.joinRoom({ roomId: room.id, name: getPlayerName() });
  }

  joinCode(code: string) {
    if (this.phase !== 'idle') return;
    const known = this.store.findByCode(code);
    if (known && !this.beginJoin(known, 'join')) return;
    if (!known) {
      this.rememberReturn();
      this.phase = 'joining';
      this.pending = 'join';
      this.showJoining({ size: 33, players: 2, goals: 3, title: `Opening room ${code}…`, text: 'Taking a seat.', seats: [] });
      this.shell.setView('room');
    }
    this.client.joinRoom({ code, name: getPlayerName() });
  }

  beginJoin(room: any, kind: string) {
    if (this.phase !== 'idle') return false;
    this.rememberReturn();
    this.phase = 'joining';
    this.pending = kind;
    this.showJoining({
      size: room.size, players: room.capacity, goals: room.goals, seats: room.seats || [],
      title: `Joining ${room.host}'s room…`, text: `Taking a seat in room ${room.code}.`,
    });
    this.shell.setView('room');
    return true;
  }

  watchRoom(room: any) {
    if (!room) return;
    this.setBusy(room.id, true);
    this.pending = 'spectate';
    this.client.spectate({ roomId: room.id });
  }

  leaveRoom() {
    this.client.leaveRoom();
    this.phase = 'idle';
    this.pending = '';
    this.backToLobby();
  }

  backToLobby() {
    this.phase = 'idle';
    this.pending = '';
    this.shell.setView(this.returnView === 'room' ? 'create' : this.returnView);
  }

  rememberReturn() {
    if (this.shell.view !== 'room') this.returnView = this.shell.view;
  }

  async copyInvite(code: string) {
    const link = /^https?:$/.test(location.protocol)
      ? `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`
      : code;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(link);
      mazeUiStore.patch({ copied: true });
      window.setTimeout(() => mazeUiStore.patch({ copied: false }), 1800);
    } catch {
      mazeUiStore.showToast('Copy is not available here. Select the room code to copy it.', { tone: 'warn' });
    }
  }

  joinWhenReady(code: string) {
    this.pendingCode = code;
    if (this.online && this.client.protocol) this.consumePendingCode();
  }

  consumePendingCode() {
    if (!this.pendingCode || !this.client.supportsRooms() || !this.shell.visible) return;
    const code = this.pendingCode;
    this.pendingCode = '';
    this.shell.setView('rooms');
    this.joinCode(code);
  }

  gameStarted() {
    this.phase = 'idle';
    this.pending = '';
    this.clearBusy();
    this.syncWatch();
  }

  menuShown() {
    this.phase = 'idle';
    this.pending = '';
    this.syncWatch();
  }

  notice(message: string, options: any = {}) {
    const action = options.action ? {
      label: options.action.label,
      key: options.action.key || '',
      onClick: options.action.onClick,
    } : undefined;
    mazeUiStore.showToast(message, { tone: options.tone, action });
  }

  toastAction(key: string) {
    if (key.startsWith('watch:')) {
      const room = this.store.get(key.slice(6));
      if (room) this.watchRoom(room);
    }
  }

  roomNoticeAction(key: string) {
    if (key === 'back') this.backToLobby();
    else if (key === 'retry') this.retryConnection();
  }

  viewChanged(view: string, _previous?: string) {
    this.syncWatch();
    this.syncTicker();
    if (view === 'rooms' || view === 'live') this.refreshAll();
  }

  visibilityChanged(visible: boolean) {
    if (!visible) {
      this.requestPeeks([]);
    } else {
      this.viewChanged(this.shell.view);
      this.consumePendingCode();
    }
    this.syncWatch();
    this.syncTicker();
  }

  syncWatch() {
    const wanted = this.online && this.shell.visible && LOBBY_VIEWS.has(this.shell.view);
    if (wanted && !this.watching) {
      this.client.watchLobby();
      this.watching = true;
    } else if (!wanted && this.watching) {
      this.client.unwatchLobby();
      this.watching = false;
      this.forgetPeeks();
    } else if (!wanted) {
      this.client.lobbyWanted = false;
    }
  }

  syncTicker() {
    const want = this.shell.visible && (this.shell.view === 'rooms' || this.shell.view === 'live');
    if (want && !this.tickTimer) {
      this.tickTimer = setInterval(() => mazeUiStore.patch({ now: this.store.now() }), 1000);
    } else if (!want && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = 0;
    }
  }

  setBusy(roomId: string, on: boolean) {
    clearTimeout(this.busyTimers.get(roomId));
    this.busyTimers.delete(roomId);
    mazeUiStore.patch(current => ({
      busyRoomIds: on
        ? [...new Set([...current.busyRoomIds, roomId])]
        : current.busyRoomIds.filter(id => id !== roomId),
    }));
    if (on) this.busyTimers.set(roomId, setTimeout(() => this.setBusy(roomId, false), 9000));
  }

  clearBusy() {
    for (const id of [...this.busyTimers.keys()]) this.setBusy(id, false);
  }

  requestPeeks(ids: string[]) {
    const normalized = this.shell.visible && this.shell.view === 'live' ? ids.slice(0, 12) : [];
    const key = normalized.join();
    if (key === this.peekedIds.join()) return;
    this.peekedIds = normalized;
    this.client.peek(normalized);
  }

  forgetPeeks() {
    this.peekedIds = [];
    this.mazeCache.clear();
    this.frameCache.clear();
    mazeUiStore.patch({ peekMazes: {}, peekFrames: {} });
    this.client.peek([]);
  }

  onPeekMessage(message: any) {
    const id = String(message.roomId || '');
    if (!id) return;
    if (message.type === 'peek:maze') {
      this.mazeCache.delete(id);
      this.mazeCache.set(id, message);
      while (this.mazeCache.size > MAX_PEEK_CACHE) this.mazeCache.delete(this.mazeCache.keys().next().value as string);
      mazeUiStore.patch(current => ({ peekMazes: { ...current.peekMazes, [id]: message } }));
    } else if (message.type === 'peek:frame') {
      this.frameCache.delete(id);
      this.frameCache.set(id, message);
      while (this.frameCache.size > MAX_PEEK_CACHE) this.frameCache.delete(this.frameCache.keys().next().value as string);
      mazeUiStore.patch(current => ({ peekFrames: { ...current.peekFrames, [id]: message } }));
    } else if (message.type === 'peek:end') {
      this.mazeCache.delete(id);
      this.frameCache.delete(id);
      mazeUiStore.patch(current => {
        const peekMazes = { ...current.peekMazes };
        const peekFrames = { ...current.peekFrames };
        delete peekMazes[id];
        delete peekFrames[id];
        return { peekMazes, peekFrames };
      });
    }
  }

  refreshAll() {
    const waiting = this.store.waiting();
    const live = this.store.live();
    const counts = this.store.counts;
    mazeUiStore.patch({
      rooms: waiting,
      live,
      recent: this.store.recentRaces(),
      storeReady: this.store.ready,
      network: this.status,
      now: this.store.now(),
    });
    this.shell.setTabCount('rooms', this.store.ready ? counts.waitingRooms : 0);
    this.shell.setTabCount('live', this.store.ready ? counts.liveRooms : 0);
    this.shell.setOpenRooms(this.store.ready && this.supportsRooms ? waiting : null, counts);
  }
}
