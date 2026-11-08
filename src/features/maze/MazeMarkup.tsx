import { MazeMenu } from './ui/react/MazeMenu';
import {
  MiniMapTile, RaceBoardView, WinCardView, HudStats, ZoomControls, ThemeControls,
  FollowControl, FogControl, HintControl, MazeBanner, NewMazePanelButton, ConfirmDialog,
} from './ui/react/MazeRuntimeUi';

/**
 * React-rendered Maze interface template. The static DOM contract (IDs,
 * classes, canvas nodes and controls) is preserved for the independent game
 * engine while React owns creation and teardown of the page structure.
 */
export function MazeMarkup() {
  return (
    <>
    <div className={"game-container"}>
      <div className={"game-layout"}>
        <div className={"maze-wrapper"} id={"stage"}>
          <canvas id={"maze"} className={"maze"} aria-label={"Maze game board"} />
          <MiniMapTile />
          <div className={"pad-wrap"} id={"padWrap"} aria-label={"Movement joystick"}>
            <div className={"pad-grip"} id={"padGrip"} title={"Drag to reposition"} />
            <div className={"pad"} id={"pad"} title={"Move the player"}>
              <div className={"knob"} id={"knob"} />
            </div>
          </div>
          <MazeBanner />
          <RaceBoardView />
          <WinCardView />
          <ConfirmDialog />
        </div>
        <aside className={"panel"} id={"panel"}>
          <HudStats />
          <div className={"tools"}>
            <ThemeControls />
            <ZoomControls />
            <div className={"grp"}>
              <button className={"btn"} id={"zoomReset"} title={"Reset view (0)"} type={"button"}>
{"Reset"}
              </button>
              <FollowControl />
            </div>
            <div className={"grp"}>
              <FogControl />
              <HintControl />
            </div>
            <div id={"padDock"} className={"pad-dock"} aria-label={"Desktop movement controls"} />
            <NewMazePanelButton />
          </div>
        </aside>
      </div>
    </div>
    <MazeMenu />
    </>
  );
}
