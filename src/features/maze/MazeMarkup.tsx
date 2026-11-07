import type { CSSProperties } from 'react';

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
    <section id={"createGame"} className={"cg show"} role={"dialog"} aria-modal={"true"} aria-labelledby={"cgTitle"}>
      <header className={"cg-top"}>
        <nav className={"cg-tabs"} id={"cgTabs"} role={"tablist"} aria-label={"Menu sections"}>
          <span className={"cg-tabs-glider"} aria-hidden={"true"} />
          <button type={"button"} className={"cg-tab is-active"} role={"tab"} id={"tabCreate"} data-view={"create"} aria-selected={"true"} aria-controls={"cgViewCreate"}>
            <span>
{"Create"}
            </span>
          </button>
          <button type={"button"} className={"cg-tab"} role={"tab"} id={"tabRooms"} data-view={"rooms"} aria-selected={"false"} aria-controls={"lbRooms"} tabIndex={-1}>
            <span>
{"Rooms"}
            </span>
            <b className={"cg-tab-count"} data-count={"rooms"} hidden={true}>
{"0"}
            </b>
          </button>
          <button type={"button"} className={"cg-tab"} role={"tab"} id={"tabLive"} data-view={"live"} aria-selected={"false"} aria-controls={"lbLive"} tabIndex={-1}>
            <span>
{"Live"}
            </span>
            <b className={"cg-tab-count"} data-count={"live"} hidden={true}>
{"0"}
            </b>
          </button>
        </nav>
      </header>
      <div className={"cg-views"} id={"cgViews"}>
        <div className={"cg-layout cg-view"} id={"cgViewCreate"} role={"tabpanel"} aria-labelledby={"tabCreate"}>
          <figure className={"cg-stage"}>
            <canvas id={"cgStage"} aria-hidden={"true"} />
            <figcaption>
{"A preview. Your real maze is generated when the game starts."}
            </figcaption>
          </figure>
          <div className={"cg-panel"}>
            <h1 className={"cg-title"} id={"cgTitle"}>
{"Create Room"}
            </h1>
            <ol className={"cg-rail"} id={"cgRail"} aria-label={"Setup steps"}>
              <li>
                <button type={"button"} className={"cg-rail-btn"} data-step={"0"} data-icon={"size"}>
                  <span className={"cg-node"} aria-hidden={"true"} />
                  <span className={"cg-rail-text"}>
                    <b>
{"Maze size"}
                    </b>
                    <small data-rail-value={"0"}>
{"Medium"}
                    </small>
                  </span>
                </button>
              </li>
              <li>
                <button type={"button"} className={"cg-rail-btn"} data-step={"1"} data-icon={"racers"}>
                  <span className={"cg-node"} aria-hidden={"true"} />
                  <span className={"cg-rail-text"}>
                    <b>
{"Racers"}
                    </b>
                    <small data-rail-value={"1"}>
{"Solo"}
                    </small>
                  </span>
                </button>
              </li>
              <li>
                <button type={"button"} className={"cg-rail-btn"} data-step={"2"} data-icon={"targets"}>
                  <span className={"cg-node"} aria-hidden={"true"} />
                  <span className={"cg-rail-text"}>
                    <b>
{"Targets"}
                    </b>
                    <small data-rail-value={"2"}>
{"3"}
                    </small>
                  </span>
                </button>
              </li>
              <li>
                <button type={"button"} className={"cg-rail-btn"} data-step={"3"} data-icon={"launch"}>
                  <span className={"cg-node"} aria-hidden={"true"} />
                  <span className={"cg-rail-text"}>
                    <b>
{"Launch"}
                    </b>
                    <small data-rail-value={"3"} />
                  </span>
                </button>
              </li>
            </ol>
            <div className={"cg-steps"} id={"cgSteps"}>
              <section className={"cg-step"} data-step={"0"} aria-labelledby={"cgH0"}>
                <h2 className={"cg-step-title"} id={"cgH0"}>
{"How big should the maze be?"}
                </h2>
                <p className={"cg-step-help"}>
{"Drag the lens along the track. A bigger maze means longer routes. "}
                </p>
                <div className={"cg-readout"}>
                  <span className={"cg-readout-main"} id={"cgSizeName"}>
{"Medium"}
                  </span>
                  <span className={"cg-readout-sub"} id={"cgSizeDetail"}>
{"33 × 33 · 1,089 cells"}
                  </span>
                </div>
                <div className={"cg-lens"} id={"cgLens"} role={"slider"} tabIndex={0} aria-label={"Maze size"} aria-valuemin={"0"} aria-valuemax={"2"} aria-valuenow={"1"} aria-valuetext={"Medium, 33 by 33"}>
                  <div className={"cg-lens-track"}>
                    <i className={"cg-lens-rail"} />
                    <i className={"cg-lens-fill"} />
                    <i className={"cg-lens-dot"} style={{"--k": 0.0} as CSSProperties} />
                    <i className={"cg-lens-dot"} style={{"--k": 1.0} as CSSProperties} />
                    <i className={"cg-lens-dot"} style={{"--k": 2.0} as CSSProperties} />
                    <span className={"cg-lens-thumb"}>
                      <i className={"cg-lens-core"} />
                    </span>
                  </div>
                  <div className={"cg-lens-labels"} aria-hidden={"true"}>
                    <span style={{"--k": 0.0} as CSSProperties}>
                      <b>
{"Easy"}
                      </b>
                      <small>
{"21 × 21"}
                      </small>
                    </span>
                    <span style={{"--k": 1.0} as CSSProperties}>
                      <b>
{"Medium"}
                      </b>
                      <small>
{"33 × 33"}
                      </small>
                    </span>
                    <span style={{"--k": 2.0} as CSSProperties}>
                      <b>
{"Hard"}
                      </b>
                      <small>
{"45 × 45"}
                      </small>
                    </span>
                  </div>
                </div>
                <p className={"cg-note"} id={"cgSizeNote"}>
{"A balanced twist of paths."}
                </p>
              </section>
              <section className={"cg-step"} data-step={"1"} aria-labelledby={"cgH1"}>
                <h2 className={"cg-step-title"} id={"cgH1"}>
{"Who is racing?"}
                </h2>
                <p className={"cg-step-help"}>
{"Turn the dial, or give it a flick. One racer is a solo run; online races take up to 99."}
                </p>
                <div className={"cg-dial-wrap"}>
                  <div className={"cg-dial"} id={"cgDial"} role={"slider"} tabIndex={0} aria-label={"Number of racers"} aria-valuemin={"1"} aria-valuemax={"99"} aria-valuenow={"1"} aria-valuetext={"1 racer, solo"}>
                    <svg className={"cg-dial-svg"} viewBox={"-130 -130 260 260"} aria-hidden={"true"}>
                      <g className={"cg-dial-ticks"} />
                    </svg>
                    <div className={"cg-dial-knob"}>
                      <i className={"cg-dial-notch"} />
                    </div>
                    <div className={"cg-dial-center"} aria-hidden={"true"}>
                      <span id={"cgPlayersOdo"} />
                      <small id={"cgPlayersUnit"}>
{"racer"}
                      </small>
                    </div>
                  </div>
                  <button type={"button"} className={"cg-nudge cg-nudge-minus"} id={"cgPlayersMinus"} aria-label={"One fewer racer"}>
{"−"}
                  </button>
                  <button type={"button"} className={"cg-nudge cg-nudge-plus"} id={"cgPlayersPlus"} aria-label={"One more racer"}>
{"+"}
                  </button>
                </div>
                <p className={"cg-note"} id={"cgPlayersNote"}>
{"Just you. Starts right away."}
                </p>
                <p className={"cg-note cg-lobby"} id={"cgPlayersLobby"} />
              </section>
              <section className={"cg-step"} data-step={"2"} aria-labelledby={"cgH2"}>
                <h2 className={"cg-step-title"} id={"cgH2"}>
{"How many targets?"}
                </h2>
                <p className={"cg-step-help"}>
{"Slide the ruler under the needle. Targets unlock in order, starting with number 1."}
                </p>
                <div className={"cg-readout cg-readout-inline"}>
                  <span id={"cgGoalsOdo"} />
                  <span className={"cg-readout-sub"} id={"cgGoalsUnit"}>
{"targets"}
                  </span>
                </div>
                <div className={"cg-ruler"} id={"cgRuler"} role={"slider"} tabIndex={0} aria-label={"Number of targets"} aria-valuemin={"1"} aria-valuemax={"99"} aria-valuenow={"3"} aria-valuetext={"3 targets"}>
                  <div className={"cg-ruler-strip"} />
                  <div className={"cg-ruler-needle"} aria-hidden={"true"}>
                    <i />
                  </div>
                </div>
                <p className={"cg-note"} id={"cgGoalsNote"}>
{"Targets spread across the maze."}
                </p>
                <p className={"cg-note cg-lobby"} id={"cgGoalsLobby"} />
              </section>
              <section className={"cg-step"} data-step={"3"} aria-labelledby={"cgH3"}>
                <h2 className={"cg-step-title"} id={"cgH3"}>
{"Ready when you are"}
                </h2>
                <ul className={"cg-summary"} id={"cgSummary"}>
                  <li>
                    <span>
{"Maze"}
                    </span>
                    <b id={"cgSumSize"}>
{"Medium, 33 × 33"}
                    </b>
                    <button type={"button"} data-step={"0"}>
{"Change"}
                    </button>
                  </li>
                  <li>
                    <span>
{"Racers"}
                    </span>
                    <b id={"cgSumPlayers"}>
{"Solo"}
                    </b>
                    <button type={"button"} data-step={"1"}>
{"Change"}
                    </button>
                  </li>
                  <li>
                    <span>
{"Targets"}
                    </span>
                    <b id={"cgSumGoals"}>
{"3"}
                    </b>
                    <button type={"button"} data-step={"2"}>
{"Change"}
                    </button>
                  </li>
                </ul>
                <label className={"cg-name"} id={"cgNameField"} htmlFor={"playerName"} hidden={true}>
                  <span>
{"Your name"}
                  </span>
                  <input id={"playerName"} type={"text"} maxLength={24} placeholder={"Player"} autoComplete={"nickname"} />
                </label>
                <label className={"cg-toggle"} id={"cgSeparateField"} htmlFor={"cgSeparate"} hidden={true}>
                  <input id={"cgSeparate"} type={"checkbox"} />
                  <span className={"cg-toggle-track"} aria-hidden={"true"}>
                    <i />
                  </span>
                  <span className={"cg-toggle-text"}>
                    <b>
{"Open a new room"}
                    </b>
                    <small>
{"Skip rooms that are already waiting"}
                    </small>
                  </span>
                </label>
                <button type={"button"} className={"cg-launch"} id={"cgLaunch"} aria-describedby={"cgLaunchNote"}>
                  <span className={"cg-launch-fill"} aria-hidden={"true"} />
                  <span className={"cg-launch-label"} id={"cgLaunchLabel"}>
{"Hold to start"}
                  </span>
                </button>
                <p className={"cg-note"} id={"cgLaunchNote"}>
{"Solo run. Starts right away."}
                </p>
              </section>
            </div>
            <nav className={"cg-nav"} aria-label={"Step navigation"}>
              <button type={"button"} className={"cg-back"} id={"cgBack"}>
{"Back"}
              </button>
              <button type={"button"} className={"cg-next"} id={"cgNext"}>
{"Continue"}
              </button>
            </nav>
          </div>
        </div>
        <section className={"lb cg-view"} id={"lbRooms"} data-view={"rooms"} role={"tabpanel"} aria-labelledby={"tabRooms"} hidden={true} />
        <section className={"lb cg-view"} id={"lbLive"} data-view={"live"} role={"tabpanel"} aria-labelledby={"tabLive"} hidden={true} />
        <section className={"lb cg-view"} id={"lbRoom"} data-view={"room"} aria-label={"Your room"} hidden={true} />
      </div>
      <div className={"lb-toast"} id={"lbToast"} role={"status"} aria-live={"polite"} />
    </section>
    </>
  );
}
