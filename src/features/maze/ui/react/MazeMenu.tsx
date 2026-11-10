import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { DIFFICULTIES } from '@maze/shared';
import { createGame } from '../create-game/create-game';
import { MazeStage } from '../create-game/maze-stage';
import { iconUrl, STEP_ICONS } from '../create-game/icons';
import { LiveThumb } from '../lobby/live-thumb';
import { ICONS } from '../lobby/icons';
import {
  cleanCode,
  filterRooms,
  fillRatio,
  formatAge,
  formatClock,
  levelOf,
  liveProgress,
  roomHeat,
  seatColor,
  seatLayout,
  seatsLeft,
  sortLive,
  sortWaiting,
  WAITING_SORT_MODES,
  LIVE_SORT_MODES,
} from '../lobby/lobby-model';
import { loadLobbyPreferences, saveLobbyPreferences } from '../lobby/lobby-preferences';
import { mazeUiStore, type MazeMenuView, type MazeUiState } from './maze-ui-store';

function useMazeUi(): MazeUiState {
  return useSyncExternalStore(mazeUiStore.subscribe, mazeUiStore.getSnapshot, mazeUiStore.getSnapshot);
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <span className="lb-fact-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

const WIZARD_STEPS = [
  { label: 'Maze size', icon: 'size' },
  { label: 'Racers', icon: 'racers' },
  { label: 'Targets', icon: 'targets' },
  { label: 'Launch', icon: 'launch' },
] as const;

function Plural({ count, one, many }: { count: number; one: string; many: string }) {
  return <>{count === 1 ? one : many}</>;
}

function RepeatButton({
  className,
  label,
  id,
  disabled = false,
  onRepeat,
  children,
}: {
  className: string;
  label: string;
  id?: string;
  disabled?: boolean;
  onRepeat: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    onRepeat();
    let delay = 380;
    const tick = () => {
      onRepeat();
      delay = Math.max(50, delay * 0.82);
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, delay);
  };
  return (
    <button
      type="button"
      className={className}
      id={id}
      aria-label={label}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onPointerLeave={stop}
      onBlur={stop}
      onClick={event => { if (event.detail === 0 && !disabled) onRepeat(); }}
    >{children}</button>
  );
}

export function MazeMenu() {
  const state = useMazeUi();
  const rootRef = useRef<HTMLElement | null>(null);
  const activeTab = state.view === 'room' ? state.homeView : state.view;
  const activeIndex = activeTab === 'create' ? 0 : activeTab === 'rooms' ? 1 : 2;

  useEffect(() => {
    document.body.classList.toggle('in-menu', state.visible);
    return () => document.body.classList.remove('in-menu');
  }, [state.visible]);

  const selectView = useCallback((view: MazeMenuView) => createGame.setView(view), []);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    const nextView = (['create', 'rooms', 'live'] as const)[nextIndex];
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-view="${nextView}"]`)?.focus();
    selectView(nextView);
  };

  return (
    <section
      ref={rootRef}
      id="createGame"
      className={`cg ${state.visible ? 'show' : ''} ${state.launching ? 'is-launching' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cgTitle"
      aria-hidden={!state.visible}
      data-view={state.view}
      data-step={state.step}
      data-level={state.levelIndex}
      style={{ '--tab': activeIndex, '--charge': state.holdProgress, '--cg-progress': state.step / 3 } as CSSProperties}
    >
      <header className="cg-top">
        <nav className="cg-tabs" id="cgTabs" role="tablist" aria-label="Menu sections">
          <span className="cg-tabs-glider" aria-hidden="true" />
          {(['create', 'rooms', 'live'] as const).map((view, index) => (
            <button
              key={view}
              className={`cg-tab ${activeTab === view ? 'is-active' : ''}`}
              type="button"
              role="tab"
              id={view === 'create' ? 'tabCreate' : view === 'rooms' ? 'tabRooms' : 'tabLive'}
              data-view={view}
              aria-selected={activeTab === view}
              aria-controls={view === 'create' ? 'cgViewCreate' : view === 'rooms' ? 'lbRooms' : 'lbLive'}
              tabIndex={activeTab === view ? 0 : -1}
              onClick={() => selectView(view)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <span>{view === 'create' ? 'Create' : view === 'rooms' ? 'Rooms' : 'Live'}</span>
              {view !== 'create' && (
                <b className="cg-tab-count" hidden={(view === 'rooms' ? state.tabCounts.rooms : state.tabCounts.live) < 1}>
                  {view === 'rooms' ? state.tabCounts.rooms : state.tabCounts.live}
                </b>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="cg-views" id="cgViews">
        <div className="cg-view" id="cgViewCreate" role="tabpanel" aria-labelledby="tabCreate" hidden={state.view !== 'create'}>
          <CreateWizard state={state} />
        </div>
        <section className="lb cg-view" id="lbRooms" data-view="rooms" role="tabpanel" aria-labelledby="tabRooms" hidden={state.view !== 'rooms'}>
          <RoomsPanel state={state} />
        </section>
        <section className="lb cg-view" id="lbLive" data-view="live" role="tabpanel" aria-labelledby="tabLive" hidden={state.view !== 'live'}>
          <LivePanel state={state} active={state.visible && state.view === 'live'} />
        </section>
        <section className="lb cg-view" id="lbRoom" data-view="room" aria-label="Your room" hidden={state.view !== 'room'}>
          {state.view === 'room' && <RoomPanel state={state} />}
        </section>
      </div>
      <ToastNotice state={state} />
    </section>
  );
}

function CreateWizard({ state }: { state: MazeUiState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<MazeStage | null>(null);
  const holdStart = useRef<number>(0);
  const holdRaf = useRef<number | null>(null);
  const pointerActive = useRef(false);
  const launchPending = useRef(false);
  const lastShowVersion = useRef(0);
  const previousView = useRef(state.view);
  const level = DIFFICULTIES[state.levelIndex];
  const solo = state.players === 1;
  const sizeNotes = [
    'Short corridors and only a few forks.',
    'A balanced twist of paths.',
    'Long routes with plenty of dead ends.',
  ];
  const playersNote = state.players === 1
    ? 'Just you. Starts right away.'
    : `${state.players === 2 ? 'A head-to-head race.' : state.players <= 5 ? 'A small squad.' : state.players <= 12 ? 'A full pack.' : state.players <= 30 ? 'A crowd in the corridors.' : state.players <= 60 ? 'A swarm.' : 'A stampede.'} The race starts once all ${state.players} racers have joined.`;
  const goalsDensity = state.goals / (level.size * level.size) * 100;
  const goalsNote = goalsDensity < 0.8
    ? 'Long walks between targets.'
    : goalsDensity < 3
      ? 'Targets spread across the whole maze.'
      : goalsDensity < 7
        ? 'Targets sit fairly close together.'
        : 'Crowded: targets are only a few steps apart.';

  useEffect(() => {
    if (!canvasRef.current) return;
    const stage = new MazeStage(canvasRef.current);
    stageRef.current = stage;
    stage.shuffle();
    return () => {
      stage.destroy?.();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setLevel(state.levelIndex);
    stage.setRacers(state.players);
    stage.setTargets(state.goals);
    stage.setLayers({ racers: state.step === 1 || state.step === 3, targets: state.step >= 2 });
    stage.setActive(state.visible && state.view === 'create');
  }, [state.levelIndex, state.players, state.goals, state.step, state.visible, state.view]);

  const cancelHold = useCallback(() => {
    pointerActive.current = false;
    if (holdRaf.current !== null) window.cancelAnimationFrame(holdRaf.current);
    holdRaf.current = null;
    const current = mazeUiStore.getSnapshot();
    // Once the hold is complete, keep its full state visible while the canvas
    // plays the launch animation and hands control to the game engine.
    if (!launchPending.current && !current.launching && current.holdPhase !== 'done') {
      createGame.setHold(0, 'idle');
    }
  }, []);

  const startLaunch = useCallback(() => {
    const current = mazeUiStore.getSnapshot();
    if (launchPending.current || current.launching) return;

    launchPending.current = true;
    pointerActive.current = false;
    if (holdRaf.current !== null) window.cancelAnimationFrame(holdRaf.current);
    holdRaf.current = null;
    createGame.setHold(1, 'done');

    const finishLaunch = async () => {
      try {
        await createGame.launch();
      } finally {
        launchPending.current = false;
      }
    };

    const stage = stageRef.current;
    try {
      if (stage?.active) stage.playLaunch(() => { void finishLaunch(); });
      else void finishLaunch();
    } catch (error) {
      launchPending.current = false;
      createGame.setHold(0, 'idle');
      console.error('[Maze] Launch animation failed:', error);
      mazeUiStore.showToast('The game could not start. Please try again.', { tone: 'warn' });
    }
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const justShown = state.visible && state.showVersion !== lastShowVersion.current;
    const enteredCreate = state.view === 'create' && previousView.current !== 'create';
    if (justShown) {
      stage?.resetLaunch();
      if (state.showVersion > 1) stage?.shuffle();
      lastShowVersion.current = state.showVersion;
    }
    if (state.visible && state.view === 'create' && (justShown || enteredCreate)) {
      if (!justShown) stage?.resetLaunch();
      stage?.playReveal();
    } else if (!state.visible || state.view !== 'create') {
      cancelHold();
    }
    previousView.current = state.view;
  }, [state.visible, state.view, state.showVersion, cancelHold]);

  const onRangeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || state.launching) return;
    event.preventDefault();
    createGame.goTo(state.step + 1);
  };

  const beginHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    if (state.launching || launchPending.current) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    pointerActive.current = true;
    holdStart.current = performance.now();
    createGame.setHold(0, 'holding');
    const update = () => {
      if (!pointerActive.current) return;
      const progress = Math.min(1, (performance.now() - holdStart.current) / 900);
      createGame.setHold(progress, 'holding');
      if (progress >= 1) {
        pointerActive.current = false;
        holdRaf.current = null;
        startLaunch();
        return;
      }
      holdRaf.current = window.requestAnimationFrame(update);
    };
    holdRaf.current = window.requestAnimationFrame(update);
  };

  const stepClass = (step: number) =>
    `cg-step${state.step === step ? ' is-active' : state.step > step ? ' is-before' : ''}`;

  const waitingLine = (withGoals: boolean) => {
    if (solo || state.network !== 'online') return '';
    const size = level.size;
    if (state.openRooms) {
      const matching = state.openRooms.filter(room => room.phase === 'waiting'
        && room.size === size && room.capacity === state.players && room.count < room.capacity
        && (!withGoals || room.goals === state.goals));
      if (!matching.length) return 'No open room with this setup yet. You would open one.';
      const racers = matching.reduce((sum, room) => sum + room.count, 0);
      return `${matching.length} open ${matching.length === 1 ? 'room' : 'rooms'} with this setup, ${racers} ${racers === 1 ? 'racer' : 'racers'} waiting inside.`;
    }
    const total = Object.entries(state.waitingByMode).reduce((sum, [key, count]) => {
      const [s, p, g] = key.split(':').map(Number);
      return sum + (s === size && p === state.players && (!withGoals || g === state.goals) ? Number(count) || 0 : 0);
    }, 0);
    return total > 0 ? `${total} ${total === 1 ? 'racer is' : 'racers are'} already waiting for this setup.` : 'Nobody is waiting for this setup yet. You would be first.';
  };

  const onlineLaunchNote = state.network !== 'online'
    ? 'Connecting to online racing… Solo play works right now.'
    : state.openRooms && state.players > 1
      ? `${waitingLine(true)} ${state.players} seats are needed before the race starts.`
      : `${waitingLine(true)} The race starts once all ${state.players} seats are taken.`;

  return (
    <div className="cg-layout" data-level={state.levelIndex}>
      <figure className="cg-stage">
        <canvas id="cgStage" ref={canvasRef} aria-hidden="true" />
        <figcaption>A preview. Your real maze is generated when the game starts.</figcaption>
      </figure>
      <div className="cg-panel">
        <h1 className="cg-title" id="cgTitle">Create Your Game</h1>
        <ol className="cg-rail is-ready" id="cgRail" aria-label="Setup steps">
          {WIZARD_STEPS.map(({ label, icon: iconName }, index) => {
            const value = index === 0 ? level.label : index === 1 ? (solo ? 'Solo' : String(state.players)) : index === 2 ? String(state.goals) : '';
            const icon = STEP_ICONS[iconName];
            const completed = index < state.step;
            const visited = index <= state.maxStep;
            return (
              <li key={iconName}>
                <button
                  type="button"
                  className={`cg-rail-btn ${state.step === index ? 'is-active' : ''} ${visited ? 'is-visited' : ''} ${completed ? 'is-done' : ''} ${!visited ? 'is-locked' : ''} ${index === 3 && state.holdPhase !== 'idle' ? 'is-charging' : ''}`}
                  data-step={index}
                  data-icon={iconName}
                  aria-current={state.step === index ? 'step' : undefined}
                  disabled={!visited || state.launching || state.holdPhase === 'holding' || state.holdPhase === 'done'}
                  onClick={() => createGame.goTo(index)}
                >
                  <span className="cg-node" aria-hidden="true">
                    <span
                      className={`cg-ico${icon.tint ? ' is-tinted' : ''}`}
                      style={{ '--icon': `url("${iconUrl(iconName)}")`, '--ico-scale': icon.fit } as CSSProperties}
                    />
                    {completed && (
                      <span
                        className="cg-ico cg-badge"
                        style={{ '--icon': `url("${iconUrl('check')}")` } as CSSProperties}
                      />
                    )}
                  </span>
                  <span className="cg-rail-text"><b>{label}</b><small>{value}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="cg-steps" id="cgSteps">
          <section className={stepClass(0)} data-step="0" aria-labelledby="cgH0" hidden={state.step !== 0} aria-hidden={state.step !== 0}>
            <h2 className="cg-step-title" id="cgH0">How big should the maze be?</h2>
            <p className="cg-step-help">Drag the lens along the track. A bigger maze means longer routes.</p>
            <div className="cg-readout">
              <span className="cg-readout-main" id="cgSizeName">{level.label}</span>
              <span className="cg-readout-sub" id="cgSizeDetail">{level.size} × {level.size} maze, {(level.size * level.size).toLocaleString('en-US')} cells</span>
            </div>
            <input
              id="cgLens"
              className="cg-react-range cg-react-range-lens"
              type="range"
              min="0"
              max="2"
              step="1"
              value={state.levelIndex}
              aria-label="Maze size"
              aria-valuetext={`${level.label}, ${level.size} by ${level.size}`}
              onChange={event => createGame.updateSetup({ levelIndex: Number(event.target.value) })}
              onKeyDown={onRangeKeyDown}
            />
            <div className="cg-react-range-labels"><span>Easy · 21 × 21</span><span>Medium · 33 × 33</span><span>Hard · 45 × 45</span></div>
            <p className="cg-note" id="cgSizeNote">{sizeNotes[state.levelIndex]}</p>
          </section>

          <section className={stepClass(1)} data-step="1" aria-labelledby="cgH1" hidden={state.step !== 1} aria-hidden={state.step !== 1}>
            <h2 className="cg-step-title" id="cgH1">Who is racing?</h2>
            <p className="cg-step-help">Choose the number of racers. One racer is a solo run; online races take up to 99.</p>
            <div className="cg-dial-wrap cg-react-dial-wrap">
              <div className="cg-dial cg-react-dial" id="cgDial" role="group" aria-label="Number of racers">
                <div className="cg-dial-center" aria-live="polite"><span id="cgPlayersOdo">{state.players}</span><small id="cgPlayersUnit">{state.players === 1 ? 'racer' : 'racers'}</small></div>
              </div>
              <RepeatButton className="cg-nudge cg-nudge-minus" id="cgPlayersMinus" label="One fewer racer" disabled={state.players <= 1} onRepeat={() => createGame.updateSetup({ players: mazeUiStore.getSnapshot().players - 1 })}>−</RepeatButton>
              <RepeatButton className="cg-nudge cg-nudge-plus" id="cgPlayersPlus" label="One more racer" disabled={state.players >= 99} onRepeat={() => createGame.updateSetup({ players: mazeUiStore.getSnapshot().players + 1 })}>+</RepeatButton>
            </div>
            <input className="cg-react-range cg-react-range-dial" type="range" min="1" max="99" value={state.players} aria-label="Number of racers" onChange={event => createGame.updateSetup({ players: Number(event.target.value) })} onKeyDown={onRangeKeyDown} />
            <p className="cg-note" id="cgPlayersNote">{playersNote}</p>
            <p className="cg-note cg-lobby" id="cgPlayersLobby">{waitingLine(false)}</p>
          </section>

          <section className={stepClass(2)} data-step="2" aria-labelledby="cgH2" hidden={state.step !== 2} aria-hidden={state.step !== 2}>
            <h2 className="cg-step-title" id="cgH2">How many targets?</h2>
            <p className="cg-step-help">Choose how many targets to collect, in order from number 1.</p>
            <div className="cg-readout cg-readout-inline"><span id="cgGoalsOdo">{state.goals}</span><span className="cg-readout-sub" id="cgGoalsUnit">{state.goals === 1 ? 'target' : 'targets'}</span></div>
            <input id="cgRuler" className="cg-react-range cg-react-range-ruler" type="range" min="1" max="99" value={state.goals} aria-label="Number of targets" onChange={event => createGame.updateSetup({ goals: Number(event.target.value) })} onKeyDown={onRangeKeyDown} />
            <p className="cg-note" id="cgGoalsNote">{goalsNote}</p>
            <p className="cg-note cg-lobby" id="cgGoalsLobby">{waitingLine(true)}</p>
          </section>

          <section className={stepClass(3)} data-step="3" aria-labelledby="cgH3" hidden={state.step !== 3} aria-hidden={state.step !== 3}>
            <h2 className="cg-step-title" id="cgH3">Ready when you are</h2>
            <ul className="cg-summary" id="cgSummary">
              <li><span>Maze</span><b id="cgSumSize">{level.label}, {level.size} × {level.size}</b><button type="button" data-step="0" onClick={() => createGame.goTo(0)}>Change</button></li>
              <li><span>Racers</span><b id="cgSumPlayers">{solo ? 'Solo' : `${state.players} racers, online`}</b><button type="button" data-step="1" onClick={() => createGame.goTo(1)}>Change</button></li>
              <li><span>Targets</span><b id="cgSumGoals">{state.goals}</b><button type="button" data-step="2" onClick={() => createGame.goTo(2)}>Change</button></li>
            </ul>
            <label className="cg-name" id="cgNameField" htmlFor="playerName" hidden={solo}>
              <span>Your name</span>
              <input id="playerName" type="text" maxLength={24} placeholder="Player" autoComplete="nickname" value={state.playerName} onChange={event => createGame.updateSetup({ playerName: event.target.value })} />
            </label>
            <label className="cg-toggle" id="cgSeparateField" htmlFor="cgSeparate" hidden={solo || !state.openRooms}>
              <input id="cgSeparate" type="checkbox" checked={state.separate} onChange={event => createGame.updateSetup({ separate: event.target.checked })} />
              <span className="cg-toggle-track" aria-hidden="true"><i /></span>
              <span className="cg-toggle-text"><b>Open a new room</b><small>Skip rooms that are already waiting</small></span>
            </label>
            <button
              type="button"
              className={`cg-launch ${state.holdPhase === 'holding' ? 'is-holding' : ''}`}
              id="cgLaunch"
              aria-describedby="cgLaunchNote"
              disabled={state.launching || state.holdPhase === 'done'}
              onPointerDown={beginHold}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onLostPointerCapture={cancelHold}
              onPointerLeave={cancelHold}
              onContextMenu={event => event.preventDefault()}
              onBlur={cancelHold}
              onClick={event => { if (event.detail === 0 && !state.launching) startLaunch(); }}
            >
              <span className="cg-launch-fill" aria-hidden="true" style={{ width: `${state.holdProgress * 100}%` }} />
              <span className="cg-launch-label" id="cgLaunchLabel">{state.holdPhase === 'holding' ? 'Keep holding' : solo ? 'Hold to start' : 'Hold to find a race'}</span>
            </button>
            <p className="cg-note" id="cgLaunchNote">{solo ? 'Solo run. Starts right away.' : onlineLaunchNote}</p>
          </section>
        </div>
        <nav className="cg-nav" aria-label="Step navigation">
          <button type="button" className="cg-back" id="cgBack" disabled={state.step === 0 || state.launching} onClick={() => createGame.goTo(state.step - 1)}>Back</button>
          <button type="button" className="cg-next" id="cgNext" hidden={state.step === 3} disabled={state.launching} onClick={() => createGame.goTo(state.step + 1)}>Continue</button>
        </nav>
      </div>
    </div>
  );
}

export function RoomsPanel({ state }: { state: MazeUiState }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(() => {
    const saved = loadLobbyPreferences().roomsSort;
    return typeof saved === 'string' && WAITING_SORT_MODES.includes(saved) ? saved : 'fill';
  });
  const [sizes, setSizes] = useState<Set<number>>(() => new Set());
  const [code, setCode] = useState('');
  const sizeFilter = useMemo(() => sizes.size ? new Set(sizes) : null, [sizes]);
  const filtered = useMemo(() => sortWaiting(filterRooms(state.rooms, { query, sizes: sizeFilter }), sort), [state.rooms, query, sizeFilter, sort]);
  const waitingRacers = state.rooms.filter(room => room.phase === 'waiting').reduce((total, room) => total + room.count, 0);
  const connected = state.network === 'online' && state.storeReady;
  const canJoinCode = cleanCode(code).length >= 4 && state.network === 'online';
  const sizeCounts = useMemo(() => state.rooms.reduce((counts: Record<number, number>, room) => {
    counts[room.size] = (counts[room.size] || 0) + 1;
    return counts;
  }, {}), [state.rooms]);
  const toggleSize = (value: number) => setSizes(current => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
  const clearFilters = () => { setSizes(new Set()); setQuery(''); };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    const clean = cleanCode(code);
    if (clean.length < 4) return;
    mazeUiStore.action('joinCode', clean);
    setCode('');
  };

  return (
    <>
      <header className="lb-head">
        <div className="lb-head-text">
          <h2 className="lb-title">Open rooms</h2>
          <p className="lb-sub" aria-live="polite">
            {connected
              ? state.rooms.length ? `${state.rooms.length} ${state.rooms.length === 1 ? 'room' : 'rooms'} · ${waitingRacers} ${waitingRacers === 1 ? 'racer' : 'racers'} waiting` : 'Nobody is waiting for a game right now'
              : state.network === 'connecting' ? 'Connecting…' : 'Waiting for connection'}
          </p>
        </div>
        <form className="lb-code" onSubmit={submitCode}>
          <label className="lb-code-label" htmlFor="lbRoomCodeInput">Have a code?</label>
          <div className="lb-code-row">
            <input id="lbRoomCodeInput" className="lb-code-input" value={code} maxLength={6} placeholder="····" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label="Room code" onChange={event => setCode(cleanCode(event.target.value))} />
            <button type="submit" className="lb-code-go" aria-label="Join room by code" disabled={!canJoinCode}><Icon name="arrow" /></button>
          </div>
        </form>
      </header>
      <div className="lb-toolbar">
        <div className="lb-chips">
          {[0, 21, 33, 45].map(value => {
            const selected = value === 0 ? sizes.size === 0 : sizes.has(value);
            return <button type="button" key={value} className={`lb-chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => value === 0 ? setSizes(new Set()) : toggleSize(value)}>
              <i className="lb-chip-dot" />{value === 0 ? 'All sizes' : `${value} × ${value}`}<small>{value === 0 ? state.rooms.length : sizeCounts[value] || ''}</small>
            </button>;
          })}
        </div>
        <label className="lb-field lb-search">
          <span className="lb-field-ic"><Icon name="search" /></span>
          <input className="lb-input" type="search" placeholder="Search host or code" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <label className="lb-field lb-sort">
          <span className="lb-field-label">Sort</span>
          <select className="lb-select" value={sort} onChange={event => { const next = event.target.value; setSort(next); saveLobbyPreferences({ roomsSort: next }); }}>
            <option value="fill">Nearly full first</option><option value="newest">Newest first</option><option value="biggest">Biggest rooms</option>
          </select>
        </label>
      </div>
      {connected && filtered.length > 0 && (
        <div className="lb-grid" role="list" aria-label="Open rooms">
          {filtered.map(room => <RoomCard key={room.id} room={room} state={state} />)}
        </div>
      )}
      {(!connected || filtered.length === 0) && <LobbyEmpty kind={!connected ? (state.network === 'old' ? 'old' : state.network === 'connecting' ? 'connecting' : state.storeReady ? 'offline' : 'loading') : state.rooms.length ? 'filtered' : 'none'} onRetry={() => mazeUiStore.action('retryConnection')} onCreate={() => createGame.setView('create')} onBrowse={() => createGame.setView('create')} onClear={clearFilters} />}
    </>
  );
}

function RoomCard({ room, state }: { room: any; state: MazeUiState }) {
  const bloom = seatLayout(room.capacity || 1);
  const busy = state.busyRoomIds.includes(room.id);
  const level = levelOf(room.size);
  const left = seatsLeft(room);
  const starting = room.phase !== 'waiting';
  const avatars = (room.names || []).slice(0, 5);
  return (
    <article className="lb-card lb-room" role="listitem" data-level={level.index} data-heat={starting ? 'starting' : roomHeat(room)} data-phase={room.phase} aria-label={`${room.host}'s room, code ${room.code}, ${level.label}, ${room.count} of ${room.capacity} racers`}>
      <div className="lb-room-main">
        <div className="lb-bloom-wrap" aria-hidden="true"><div className="lb-seat-bloom">{(room.seats || []).map((seat: number) => { const point = bloom.points[Number(seat)] || { x: 0, y: 0 }; return <i key={seat} style={{ left: `${50 + point.x * 43}%`, top: `${50 + point.y * 43}%`, '--seat-color': seatColor(seat), '--seat-size': `${Math.max(3, bloom.radius * 30)}px` } as CSSProperties} />; })}</div></div>
        <div className="lb-room-info">
          <div className="lb-room-top"><span className="lb-code-tag">{room.code}</span><span className="lb-badge">{level.label}</span></div>
          <h3 className="lb-card-title">{room.host}'s room</h3>
          <ul className="lb-facts">
            <li><Icon name="grid" />{room.size} × {room.size}</li>
            <li><Icon name="target" />{room.goals} {room.goals === 1 ? 'target' : 'targets'}</li>
            <li><Icon name="clock" />{formatAge(state.now - room.createdAt)}</li>
          </ul>
        </div>
      </div>
      <div className="lb-room-meter">
        <div className="lb-meter" aria-hidden="true"><i className="lb-meter-fill" style={{ transform: `scaleX(${fillRatio(room)})` }} /></div>
        <div className="lb-meter-text"><span className="lb-seats"><b className="lb-count">{room.count}</b><span className="lb-count-of"> / {room.capacity}</span></span><span className="lb-left">{starting ? 'Starting…' : left === 1 ? 'Last seat open' : `${left} seats left`}</span></div>
      </div>
      <div className="lb-perf" aria-hidden="true" />
      <footer className="lb-room-foot">
        <div className="lb-avatars" aria-hidden="true">
          {avatars.map((name: string, index: number) => <span className="lb-av" key={`${name}-${index}`} title={name} style={{ '--c': seatColor((room.seats || [])[index] ?? index) } as CSSProperties}>{initialOf(name)}</span>)}
          {(room.names || []).length > 5 && <span className="lb-av lb-av-more">+{room.names.length - 5}</span>}
        </div>
        <button type="button" className={`lb-join ${busy ? 'is-busy' : ''}`} disabled={starting || left <= 0 || busy} aria-label={starting ? `${room.host}'s room is starting` : `Join ${room.host}'s room`} onClick={() => mazeUiStore.action('joinRoom', room)}>
          {busy ? 'Joining…' : starting ? 'Starting' : 'Join'} <span className="lb-join-ic"><Icon name="arrow" /></span>
        </button>
      </footer>
    </article>
  );
}

export function LivePanel({ state, active }: { state: MazeUiState; active: boolean }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(() => {
    const saved = loadLobbyPreferences().liveSort;
    return typeof saved === 'string' && LIVE_SORT_MODES.includes(saved) ? saved : 'close';
  });
  const [sizes, setSizes] = useState<Set<number>>(() => new Set());
  const [visible, setVisible] = useState<string[]>([]);
  const sizeFilter = useMemo(() => sizes.size ? new Set(sizes) : null, [sizes]);
  const filtered = useMemo(() => sortLive(filterRooms(state.live, { query, sizes: sizeFilter }), sort), [state.live, query, sizeFilter, sort]);
  const racers = state.live.reduce((sum, room) => sum + room.count, 0);
  const watchers = state.live.reduce((sum, room) => sum + (room.spectators || 0), 0);
  const connected = state.network === 'online' && state.storeReady;
  const sizeCounts = useMemo(() => state.live.reduce((counts: Record<number, number>, room) => {
    counts[room.size] = (counts[room.size] || 0) + 1;
    return counts;
  }, {}), [state.live]);
  const toggleSize = (value: number) => setSizes(current => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
  const clearFilters = () => { setSizes(new Set()); setQuery(''); };

  useEffect(() => {
    if (active) mazeUiStore.action('requestPeeks', visible);
    else {
      setVisible([]);
      mazeUiStore.action('requestPeeks', []);
    }
  }, [active, visible.join('|')]);

  const onVisibility = useCallback((id: string, isVisible: boolean) => {
    setVisible(current => {
      if (isVisible) return current.includes(id) ? current : [...current, id].slice(-12);
      return current.filter(value => value !== id);
    });
  }, []);

  return (
    <>
      <header className="lb-head"><div className="lb-head-text"><h2 className="lb-title">Live races</h2><p className="lb-sub" aria-live="polite">
        {connected ? state.live.length ? `${state.live.length} ${state.live.length === 1 ? 'race' : 'races'} · ${racers} ${racers === 1 ? 'racer' : 'racers'} running${watchers ? ` · ${watchers} watching` : ''}` : 'No race is running at the moment' : state.network === 'connecting' ? 'Connecting…' : 'Waiting for connection'}
      </p></div></header>
      <div className="lb-toolbar">
        <div className="lb-chips">{[0, 21, 33, 45].map(value => { const selected = value === 0 ? sizes.size === 0 : sizes.has(value); return <button type="button" key={value} className={`lb-chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => value === 0 ? setSizes(new Set()) : toggleSize(value)}><i className="lb-chip-dot" />{value === 0 ? 'All sizes' : `${value} × ${value}`}<small>{value === 0 ? state.live.length : sizeCounts[value] || ''}</small></button>; })}</div>
        <label className="lb-field lb-search"><span className="lb-field-ic"><Icon name="search" /></span><input className="lb-input" type="search" placeholder="Search racer or code" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="lb-field lb-sort"><span className="lb-field-label">Sort</span><select className="lb-select" value={sort} onChange={event => { const next = event.target.value; setSort(next); saveLobbyPreferences({ liveSort: next }); }}><option value="close">Closest finish</option><option value="crowd">Most racers</option><option value="watched">Most watched</option><option value="newest">Newest first</option></select></label>
      </div>
      {connected && filtered.length > 0 && <div className="lb-grid lb-grid-live" role="list" aria-label="Races in progress">{filtered.map(room => <LiveCard key={room.id} room={room} state={state} active={active} onVisibility={onVisibility} />)}</div>}
      {(!connected || filtered.length === 0) && <LobbyEmpty kind={!connected ? (state.network === 'old' ? 'old-live' : state.network === 'connecting' ? 'connecting' : state.storeReady ? 'offline' : 'loading-live') : state.live.length ? 'filtered' : 'quiet'} onRetry={() => mazeUiStore.action('retryConnection')} onCreate={() => createGame.setView('create')} onBrowse={() => createGame.setView('rooms')} onClear={clearFilters} />}
      {connected && state.recent.length > 0 && <section className="lb-recent" aria-label="Recently finished races"><h3 className="lb-recent-title"><Icon name="flag" /> Just finished</h3><ul className="lb-recent-list">{state.recent.map(entry => {
        const level = levelOf(entry.size);
        return <li key={entry.id} className="lb-recent-chip" data-level={level.index}><i className="lb-dot" style={{ '--c': entry.winnerColor || '#8be0a4' } as CSSProperties} aria-hidden="true" /><b>{entry.winner} won</b><small>{level.label} · {entry.racers} racers · {formatClock(entry.durationMs)}</small></li>;
      })}</ul></section>}
    </>
  );
}

function LiveCard({ room, state, active, onVisibility }: { room: any; state: MazeUiState; active: boolean; onVisibility: (id: string, visible: boolean) => void }) {
  const articleRef = useRef<HTMLElement | null>(null);
  const busy = state.busyRoomIds.includes(room.id);
  const maze = state.peekMazes[room.id];
  const frame = state.peekFrames[room.id];
  const level = levelOf(room.size);
  const leader = room.leader;

  useEffect(() => {
    const el = articleRef.current;
    if (!el || !active) return;
    if (!('IntersectionObserver' in window)) {
      onVisibility(room.id, true);
      return () => onVisibility(room.id, false);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === el) onVisibility(room.id, entry.isIntersecting);
    }, { rootMargin: '120px 0px' });
    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibility(room.id, false);
    };
  }, [room.id, active, onVisibility]);

  return (
    <article ref={articleRef} className="lb-card lb-live" role="listitem" data-level={level.index} aria-label={`Race ${room.code}, ${level.label}, ${room.count} racers`}>
      <div className={`lb-thumb-wrap ${maze ? '' : 'is-loading'}`}>
        <LiveCanvas maze={maze} frame={frame} />
        <span className="lb-live-badge"><i />LIVE</span>
      </div>
      <div className="lb-live-info">
        <div className="lb-room-top"><span className="lb-code-tag">{room.code}</span><span className="lb-badge">{level.label}</span></div>
        <h3 className="lb-card-title">{room.host}'s race</h3>
        <div className="lb-leader">
          {leader && leader.goals > 0 ? <><i className="lb-dot" style={{ '--c': leader.color || '#8be0a4' } as CSSProperties} /><span>{leader.name} leads · {leader.goals}/{room.goals}</span></> : <span>{room.count} {room.count === 1 ? 'racer' : 'racers'} just set off</span>}
        </div>
        <div className="lb-meter" aria-hidden="true"><i className="lb-meter-fill" style={{ transform: `scaleX(${liveProgress(room)})` }} /></div>
        <ul className="lb-facts"><li><Icon name="clock" />{formatClock(state.now - room.startedAt)}</li><li><Icon name="eye" />{room.spectators ? `${room.spectators} watching` : 'no spectators yet'}</li><li><Icon name="target" />{room.goals} {room.goals === 1 ? 'target' : 'targets'}</li></ul>
        <button type="button" className="lb-join lb-watch" disabled={busy} onClick={() => mazeUiStore.action('watchRoom', room)}><span className="lb-join-ic"><Icon name="eye" /></span>{busy ? 'Opening…' : 'Watch live'}</button>
      </div>
    </article>
  );
}

function LiveCanvas({ maze, frame }: { maze: any; frame: any }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbRef = useRef<LiveThumb | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const thumb = new LiveThumb(canvasRef.current);
    thumbRef.current = thumb;
    return () => { thumb.destroy(); thumbRef.current = null; };
  }, []);
  useEffect(() => { if (maze) thumbRef.current?.setMaze(maze); }, [maze]);
  useEffect(() => { if (frame) thumbRef.current?.setFrame(frame); }, [frame]);
  return <canvas className="lb-thumb" ref={canvasRef} width={132} height={132} aria-hidden="true" />;
}

export function RoomPanel({ state }: { state: MazeUiState }) {
  const room = state.room;
  if (state.roomMode === 'notice' && state.roomNotice) {
    return (
      <div className="lb-room-screen" data-mode="notice">
        <div className="lb-room-stage lb-notice-stage" aria-hidden="true"><span className="lb-empty-ic"><Icon name="server" /></span></div>
        <div className="lb-room-panel"><p className="lb-eyebrow">{state.roomNotice.eyebrow || 'Online race'}</p><h2 className="lb-room-title">{state.roomNotice.title}</h2><p className="lb-room-text" aria-live="polite">{state.roomNotice.text}</p><div className="lb-actions lb-notice-actions">{state.roomNotice.actions.map((action: any) => <button key={action.key} type="button" className={`lb-btn ${action.primary ? 'is-primary' : ''}`} onClick={() => mazeUiStore.action('roomNoticeAction', action.key)}>{action.icon && <span dangerouslySetInnerHTML={{ __html: action.icon }} />}{action.label}</button>)}</div></div>
      </div>
    );
  }

  const joining = state.roomMode === 'joining';
  const legacy = state.legacyRoom;
  const data = room || state.roomJoining || {};
  const size = Number(data.size) || 33;
  const capacity = Number(data.capacity || data.players || legacy?.required) || 2;
  const members = Array.isArray(room?.members) ? room.members : [];
  const count = legacy ? legacy.waiting : joining ? (data.seats || []).length : members.length;
  const left = Math.max(0, capacity - count);
  const host = !!room && room.hostId === state.roomYouId;
  const minStart = Number(room?.minStart) || 2;
  const canStart = host && room.phase === 'waiting' && members.length >= minStart;
  const title = joining ? (data.title || 'Finding you a seat…')
    : legacy ? count >= capacity ? 'Lobby full' : 'Waiting for racers'
      : room?.phase === 'preparing' ? 'Building your maze…'
        : left === 1 ? 'One seat left' : 'Waiting for racers';
  const text = joining ? (data.text || 'Looking for a room with this exact setup.')
    : legacy ? count >= capacity ? 'Players found. Preparing a shared maze…' : `Waiting for ${capacity - count} more ${capacity - count === 1 ? 'racer' : 'racers'} to join this exact setup.`
      : room?.phase === 'preparing' ? 'Everybody is in. The race starts in a moment.'
        : left === 1 ? 'One more racer and the race starts.' : `${left} more ${left === 1 ? 'racer' : 'racers'} needed. The race starts when all seats are taken.`;
  const seats = room ? members.map((member: any) => ({ seat: member.seat, color: member.color || seatColor(member.seat), you: member.id === state.roomYouId }))
    : (data.seats || Array.from({ length: count }, (_: any, i: number) => i)).map((seat: any) => ({ seat: typeof seat === 'number' ? seat : seat.seat, color: seatColor(typeof seat === 'number' ? seat : seat.seat) }));
  const arrangement = seatLayout(capacity);
  const level = levelOf(size);

  return (
    <div className="lb-room-screen" data-mode={joining ? 'joining' : 'room'} data-you={host ? 'host' : 'guest'} data-phase={room?.phase || 'waiting'} data-legacy={legacy ? 'true' : undefined}>
      <figure className="lb-room-stage" aria-hidden="true">
        <div className="lb-seat-stage">
          {arrangement.points.map((point, index) => {
            const seat = seats.find((item: any) => Number(item.seat) === index);
            return <i key={index} className={seat?.you ? 'is-you' : ''} style={{ left: `${50 + point.x * 43}%`, top: `${50 + point.y * 43}%`, '--seat-color': seat?.color || 'rgba(228,246,234,.14)', '--seat-radius': `${Math.max(8, arrangement.radius * 44)}px` } as CSSProperties} />;
          })}
        </div>
        <div className="lb-stage-center"><span className="lb-big-count">{count}</span><small className="lb-big-of">of {capacity} seats</small></div>
      </figure>
      <div className="lb-room-panel">
        <p className="lb-eyebrow">{joining ? 'Online race' : legacy ? 'Online race · legacy server' : room?.phase === 'preparing' ? 'Room full' : 'Waiting room'}</p>
        <h2 className="lb-room-title" tabIndex={-1}>{title}</h2>
        <p className="lb-room-text" aria-live="polite">{text}</p>
        {!joining && room?.code && (
          <div className="lb-code-box"><div><small>Room code</small><span className="lb-code-big">{room.code}</span></div><button type="button" className={`lb-copy ${state.copied ? 'is-done' : ''}`} onClick={() => mazeUiStore.action('copyInvite', room.code)}><Icon name="link" />{state.copied ? 'Link copied' : 'Copy invite link'}</button></div>
        )}
        <ul className="lb-chips-static">
          <li className="lb-badge" data-level={level.index}>{level.label}</li><li><Icon name="grid" />{size} × {size}</li><li><Icon name="target" />{Number(data.goals) || 3} targets</li><li><Icon name="users" />{capacity} seats</li>
        </ul>
        <div className="lb-meter" aria-hidden="true"><i className="lb-meter-fill" style={{ transform: `scaleX(${capacity ? count / capacity : 0})` }} /></div>
        {room && !legacy && (
          <ul className="lb-members" aria-label="Racers in this room">
            {members.map((member: any) => <li className={`lb-member ${member.id === state.roomYouId ? 'is-you' : ''}`} key={member.id}>
              <i className="lb-av" style={{ '--c': member.color || seatColor(member.seat) } as CSSProperties}>{initialOf(member.name)}</i><b>{member.name}</b><span className="lb-member-badges">{member.host && <span className="lb-tag is-host"><Icon name="crown" />Host</span>}{member.id === state.roomYouId && <span className="lb-tag is-you">You</span>}</span>
            </li>)}
          </ul>
        )}
        <p className="lb-room-note">{joining ? 'Your seat will appear here when the server confirms the room.' : legacy ? 'This server is older than the game. Update it to open rooms, share codes and watch races.' : host ? 'You are the host. Start early whenever two or more racers are here.' : `${(members.find((member: any) => member.host) || {}).name || 'The host'} can start early; otherwise the race starts when the room is full.`}</p>
        <div className="lb-actions">
          <button type="button" className="lb-btn" onClick={() => mazeUiStore.action('leaveRoom')}><Icon name="leave" />Leave room</button>
          {host && <button type="button" className="lb-btn is-primary" disabled={!canStart} onClick={() => mazeUiStore.action('startRoom')}><Icon name="play" />{canStart ? `Start now with ${members.length}` : `Start now (needs ${minStart} racers)`}</button>}
        </div>
      </div>
    </div>
  );
}

function LobbyEmpty({ kind, onRetry, onCreate, onBrowse, onClear }: { kind: string; onRetry: () => void; onCreate: () => void; onBrowse: () => void; onClear: () => void }) {
  if (kind === 'loading' || kind === 'loading-live') return <div className="lb-empty" data-kind="loading"><div className="lb-skeleton-row"><div className="lb-skeleton is-tall" /><div className="lb-skeleton is-tall" /></div></div>;
  if (kind === 'offline' || kind === 'connecting' || kind === 'old' || kind === 'old-live') {
    const old = kind === 'old' || kind === 'old-live';
    return <div className="lb-empty" data-kind={kind}><span className="lb-empty-ic"><Icon name="server" /></span><h3>{old ? 'Rooms are not available yet' : kind === 'connecting' ? 'Connecting…' : 'Not connected'}</h3><p>{old ? 'This server does not support the current room features yet.' : 'Open rooms and races appear as soon as the connection is back. Solo play keeps working meanwhile.'}</p><button type="button" className="lb-btn is-primary" onClick={onRetry}><Icon name="server" />Try again</button></div>;
  }
  if (kind === 'filtered') return <div className="lb-empty" data-kind="filtered"><span className="lb-empty-ic"><Icon name="search" /></span><h3>No match for those filters</h3><p>Try another board size or clear the search.</p><button type="button" className="lb-btn" onClick={onClear}>Clear filters</button></div>;
  if (kind === 'quiet') return <div className="lb-empty" data-kind="none"><div className="lb-radar" aria-hidden="true"><i /><i /><i /><b /></div><h3>Quiet on the tracks</h3><p>When a room fills up, its race shows here live. You can watch it from the sidelines.</p><button type="button" className="lb-btn is-primary" onClick={onBrowse}>Browse open rooms</button></div>;
  return <div className="lb-empty" data-kind="none"><span className="lb-empty-ic"><Icon name="users" /></span><h3>Nobody is waiting yet</h3><p>Create a game and your room will appear here for other racers.</p><button type="button" className="lb-btn is-primary" onClick={onCreate}>Create a game</button></div>;
}

function ToastNotice({ state }: { state: MazeUiState }) {
  useEffect(() => {
    if (!state.toast) return;
    const id = state.toast.id;
    const timer = window.setTimeout(() => mazeUiStore.clearToast(id), 5000);
    return () => window.clearTimeout(timer);
  }, [state.toast?.id]);
  if (!state.toast) return <div className="lb-toast" id="lbToast" role="status" aria-live="polite" />;
  return <div className={`lb-toast is-visible ${state.toast.tone === 'warn' ? 'is-warn' : ''}`} id="lbToast" role="status" aria-live="polite"><span>{state.toast.message}</span>{state.toast.action?.label && <button type="button" onClick={() => { state.toast?.action?.onClick?.(); mazeUiStore.clearToast(state.toast?.id); }}>{state.toast.action.label}</button>}</div>;
}

function initialOf(name: string) {
  const match = String(name || '').trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '?';
}
