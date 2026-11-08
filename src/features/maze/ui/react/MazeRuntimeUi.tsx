import { useSyncExternalStore } from 'react';
import { mazeHudStore } from '../maze-view-store';
import { raceBoardStore } from '../race-board';

function useMazeHud() {
  return useSyncExternalStore(mazeHudStore.subscribe, mazeHudStore.getSnapshot, mazeHudStore.getSnapshot);
}

function useRaceBoard() {
  return useSyncExternalStore(raceBoardStore.subscribe, raceBoardStore.getSnapshot, raceBoardStore.getSnapshot);
}



export function ConfirmDialog() {
  const hud = useMazeHud();
  return (
    <section
      id="confirm"
      className={`overlay${hud.confirmVisible ? ' show' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmTitle"
      aria-hidden={!hud.confirmVisible}
    >
      <h2 id="confirmTitle">{hud.confirmTitle}</h2>
      <p id="confirmText">{hud.confirmText}</p>
      <div className="btns">
        <button id="endYes" type="button">End Game</button>
        <button id="endNo" className="ghost" type="button">Continue</button>
      </div>
    </section>
  );
}

export function MazeBanner() {
  const hud = useMazeHud();
  return (
    <div id="banner" className={`banner${hud.bannerVisible ? ' show' : ''}`} role="status" aria-hidden={!hud.bannerVisible}>
      {hud.bannerText}
    </div>
  );
}

export function NewMazePanelButton() {
  const hud = useMazeHud();
  return (
    <button className="newbtn" id="newMazePanel" type="button">
      {hud.panelButtonLabel}
    </button>
  );
}

export function MiniMapTile() {
  const hud = useMazeHud();
  return (
    <div className={`mini-tile${hud.miniMapVisible ? ' show' : ''}`} id="miniTile">
      <canvas id="mini" title="Mini map – Click or drag to move the camera" />
    </div>
  );
}

export function RaceBoardView() {
  const board = useRaceBoard();
  const className = [
    'race-board',
    board.visible ? 'show' : '',
    board.picking ? 'is-pickable' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      id="raceBoard"
      className={className}
      aria-label="Race standings"
      aria-hidden={!board.visible}
      data-crowd={board.crowd}
    >
      <div className="race-board-heading">
        <span>{board.heading}</span>
        <small id="raceRoomCode">{board.roomCode}</small>
      </div>
      <ol id="raceList">
        {board.rows.map(row => {
          const rowClass = [
            'race-row',
            row.isYou ? 'is-you' : '',
            row.isFocus ? 'is-focus' : '',
            row.isFinished ? 'is-finished' : '',
          ].filter(Boolean).join(' ');
          return (
            <li
              className={rowClass}
              data-id={row.id}
              key={row.id}
              role={board.picking ? 'button' : undefined}
              tabIndex={board.picking ? 0 : undefined}
              onClick={board.picking ? () => raceBoardStore.select(row.id) : undefined}
              onKeyDown={board.picking ? (event: { key: string; preventDefault: () => void }) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  raceBoardStore.select(row.id);
                }
              } : undefined}
              aria-label={board.picking ? `Follow ${row.name}, place ${row.place}` : undefined}
            >
              <span className="race-place">{row.place}</span>
              <span className="race-dot" style={{ backgroundColor: row.color }} />
              <span className="race-identity">
                <b>{row.name}</b>
                <small>{row.status}</small>
              </span>
              <strong title="Steps">{row.steps}</strong>
            </li>
          );
        })}
        {board.hiddenCount > 0 && (
          <li className="race-more">
            +{board.hiddenCount} more racer{board.hiddenCount === 1 ? '' : 's'}
          </li>
        )}
      </ol>
    </section>
  );
}

export function WinCardView() {
  const hud = useMazeHud();
  return (
    <div
      id="winCard"
      className={`win-card${hud.resultVisible ? ' show' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="message"
      aria-hidden={!hud.resultVisible}
    >
      <div id="message" className="message">{hud.resultMessage}</div>
      <div id="winStats" className="win-stats">
        {hud.resultStats.map((stat, index) => (
          <div key={`${stat.label}-${index}`}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <button id="newMazeWin" type="button">{hud.resultButtonLabel}</button>
    </div>
  );
}


export function ThemeControls() {
  const hud = useMazeHud();
  const themes = [
    { id: 'grass', label: 'Classic', aria: 'Grass theme', swatch: 'swatch-grass' },
    { id: 'light', label: 'Light', aria: 'White floor and black walls', swatch: 'swatch-light' },
    { id: 'dark', label: 'Dark', aria: 'Black floor and white walls', swatch: 'swatch-dark' },
  ];

  return (
    <div className="theme-switcher" role="group" aria-label="Maze color theme" title="Choose maze colors">
      {themes.map(theme => {
        const selected = hud.mazeTheme === theme.id;
        return (
          <button
            className={`theme-option${selected ? ' is-active' : ''}`}
            type="button"
            data-theme={theme.id}
            aria-label={theme.aria}
            aria-pressed={selected}
            key={theme.id}
          >
            <span className={`theme-swatch ${theme.swatch}`} aria-hidden="true" />
            <span>{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HudStats() {
  const hud = useMazeHud();
  return (
    <div className="tile hud">
      <div><span className="lbl">Steps</span><b id="hudSteps">{hud.steps}</b></div>
      <div><span className="lbl">Time</span><b id="hudTime">{hud.time}</b></div>
      <div><span className="lbl">Goals</span><b id="hudGoals">{hud.goals}</b></div>
    </div>
  );
}

export function ZoomControls() {
  const hud = useMazeHud();
  return (
    <div className="grp">
      <button className="btn sm" id="zoomOut" title="Zoom out (−)" aria-label="Zoom out" type="button">−</button>
      <span className="zoom-label" id="zoomLabel">{hud.zoom}</span>
      <button className="btn sm" id="zoomIn" title="Zoom in (+)" aria-label="Zoom in" type="button">+</button>
    </div>
  );
}

export function FollowControl() {
  const hud = useMazeHud();
  return (
    <button className="btn" id="followBtn" aria-pressed={hud.follow} title="Camera follows the player" type="button">
      Follow
    </button>
  );
}

export function FogControl() {
  const hud = useMazeHud();
  return (
    <button className="btn" id="fogBtn" aria-pressed={hud.fogOn} title="Torch" type="button">
      🔦 Torch
    </button>
  );
}

export function HintControl() {
  const hud = useMazeHud();
  return (
    <button className="btn" id="hintBtn" title="Hint" type="button" disabled={hud.hintDisabled}>
      💡 Hint <span id="hintCount">{hud.hintsLeft}</span>
    </button>
  );
}
