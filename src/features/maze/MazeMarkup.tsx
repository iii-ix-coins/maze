import { MazeMenu } from './ui/react/MazeMenu';

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
          <div className={"mini-tile"} id={"miniTile"}>
            <canvas id={"mini"} title={"Mini map – Click or drag to move the camera"} />
          </div>
          <div className={"pad-wrap"} id={"padWrap"} aria-label={"Movement joystick"}>
            <div className={"pad-grip"} id={"padGrip"} title={"Drag to reposition"} />
            <div className={"pad"} id={"pad"} title={"Move the player"}>
              <div className={"knob"} id={"knob"} />
            </div>
          </div>
          <div id={"banner"} className={"banner"} role={"status"} />
          <section id={"raceBoard"} className={"race-board"} aria-label={"Race standings"}>
            <div className={"race-board-heading"}>
              <span>
{"LIVE RACE"}
              </span>
              <small id={"raceRoomCode"} />
            </div>
            <ol id={"raceList"} />
          </section>
          <div id={"winCard"} className={"win-card"} role={"dialog"} aria-modal={"true"} aria-labelledby={"message"}>
            <div id={"message"} className={"message"} />
            <div id={"winStats"} className={"win-stats"} />
            <button id={"newMazeWin"} type={"button"}>
{"New Maze"}
            </button>
          </div>
          <section id={"confirm"} className={"overlay"} role={"dialog"} aria-modal={"true"} aria-labelledby={"confirmTitle"}>
            <h2 id={"confirmTitle"}>
{"End current game?"}
            </h2>
            <p id={"confirmText"}>
{"The game will stop and the shortest paths from the start to every point will be shown."}
            </p>
            <div className={"btns"}>
              <button id={"endYes"} type={"button"}>
{"End Game"}
              </button>
              <button id={"endNo"} className={"ghost"} type={"button"}>
{"Continue"}
              </button>
            </div>
          </section>
        </div>
        <aside className={"panel"} id={"panel"}>
          <div className={"tile hud"}>
            <div>
              <span className={"lbl"}>
{"Steps"}
              </span>
              <b id={"hudSteps"}>
{"0"}
              </b>
            </div>
            <div>
              <span className={"lbl"}>
{"Time"}
              </span>
              <b id={"hudTime"}>
{"0:00"}
              </b>
            </div>
            <div>
              <span className={"lbl"}>
{"Goals"}
              </span>
              <b id={"hudGoals"}>
{"0/3"}
              </b>
            </div>
          </div>
          <div className={"tools"}>
            <div className={"theme-switcher"} role={"group"} aria-label={"Maze color theme"} title={"Choose maze colors"}>
              <button className={"theme-option"} type={"button"} data-theme={"grass"} aria-label={"Grass theme"} aria-pressed={"true"}>
                <span className={"theme-swatch swatch-grass"} aria-hidden={"true"} />
                <span>
{"Classic"}
                </span>
              </button>
              <button className={"theme-option"} type={"button"} data-theme={"light"} aria-label={"White floor and black walls"} aria-pressed={"false"}>
                <span className={"theme-swatch swatch-light"} aria-hidden={"true"} />
                <span>
{"Light"}
                </span>
              </button>
              <button className={"theme-option"} type={"button"} data-theme={"dark"} aria-label={"Black floor and white walls"} aria-pressed={"false"}>
                <span className={"theme-swatch swatch-dark"} aria-hidden={"true"} />
                <span>
{"Dark"}
                </span>
              </button>
            </div>
            <div className={"grp"}>
              <button className={"btn sm"} id={"zoomOut"} title={"Zoom out (−)"} aria-label={"Zoom out"} type={"button"}>
{"−"}
              </button>
              <span className={"zoom-label"} id={"zoomLabel"}>
{"100%"}
              </span>
              <button className={"btn sm"} id={"zoomIn"} title={"Zoom in (+)"} aria-label={"Zoom in"} type={"button"}>
{"+"}
              </button>
            </div>
            <div className={"grp"}>
              <button className={"btn"} id={"zoomReset"} title={"Reset view (0)"} type={"button"}>
{"Reset"}
              </button>
              <button className={"btn"} id={"followBtn"} aria-pressed={"true"} title={"Camera follows the player"} type={"button"}>
{"Follow"}
              </button>
            </div>
            <div className={"grp"}>
              <button className={"btn"} id={"fogBtn"} aria-pressed={"false"} title={"Torch"} type={"button"}>
{"🔦 Torch"}
              </button>
              <button className={"btn"} id={"hintBtn"} title={"Hint"} type={"button"}>
{"💡 Hint "}
                <span id={"hintCount"}>
{"3"}
                </span>
              </button>
            </div>
            <div id={"padDock"} className={"pad-dock"} aria-label={"Desktop movement controls"} />
            <button className={"newbtn"} id={"newMazePanel"} type={"button"}>
{"New Maze"}
            </button>
          </div>
        </aside>
      </div>
    </div>
    <MazeMenu />
    </>
  );
}
