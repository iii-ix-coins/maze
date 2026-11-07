// Moved verbatim from legacy/mazeV3/maze-game/maze.js (statements 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 113, 114, 115, 116). Only imports/exports and `S.` state access were added.
import { S, collected, cam, confetti, reveal, racerPos } from './state';
import { multiplayerClient, createGame, raceBoard } from './services';
import { ensurePlayerVisible, clampCam } from './camera';
import { DC, DR, rnd, MAX_GOALS, generateMazeData } from '@maze/shared';
import { reduceMotion, messageElement, winStats, winCard, fogBtn, confirmEl, banner } from './dom';
import { fmtTime, updateHud } from './hud';
import { EXIT_COLOR, HINT_LEN, SAVE_KEY, HINTS_PER_MAZE, PLAYER_COLOR } from './constants';
import { bfs, fitLayout, applyMazeSize } from './layout';
import { syncRoleUi, setConfirm } from './session';
import { buildWalls, buildMini } from './render';
import { padReset } from '../input/joystick';
export function movePlayer(d) {
    if (S.isGameOver || S.pausedAt !== null || S.spectating) return;
    if (S.multiplayerSession) {
        if (!S.multiplayerWinnerId) multiplayerClient.move(d);
        return;
    }
    if (S.open[S.player] & (1 << d)) {
        S.player = S.NB[S.player * 4 + d];
        S.steps++;
        S.moves += d;
        if (S.startTime === null) S.startTime = performance.now();
        S.trailPath.lineTo((S.player % S.SIZE) + 0.5, ((S.player / S.SIZE) | 0) + 0.5);
        S.pop = 1;
        ensurePlayerVisible();
        checkGoal();
        saveGame();
    } else {
        S.kickX = DC[d] * 0.14;
        S.kickY = DR[d] * 0.14;
    }
}
export function checkGoal() {
    const i = S.exits.indexOf(S.player);
    // A target can only be collected when it is the next target in sequence.
    if (i < 0 || collected[i] || i !== S.goals) return;
    collected[i] = 1;
    S.goals++;
    S.goalPingIndex = S.goals < S.goalTotal ? S.goals : -1;
    S.goalPingAt = performance.now();
    if (S.goals < S.goalTotal) {
        if (!reduceMotion) burst(S.player, 30);
        return;
    }
    S.isGameOver = true;
    clearSave();
    S.endTime = performance.now();
    messageElement.textContent = "🏆 You Win";
    const eff = Math.min(100, Math.round(100 * S.solutionLen / Math.max(1, S.steps)));
    const item = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    winStats.innerHTML = item(S.steps, 'گام') + item(S.solutionLen, 'The shortest way') + item(eff + '%', 'Efficiency')
        + item(fmtTime(S.endTime - S.startTime), 'time') + (S.hintsUsed ? item(S.hintsUsed, 'Guide') : '');
    winCard.classList.add('show');
    if (!reduceMotion) {
        burst(S.player, 90);
        setTimeout(() => burst(S.player, 90), 320);
    }
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    updateHud();
}
export function burst(cell, n) {
    const x = (cell % S.SIZE) + 0.5, y = ((cell / S.SIZE) | 0) + 0.5;
    const colors = [S.playerColor, EXIT_COLOR, '#ffd24a', '#ffffff', '#7cfc9a'];
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
        confetti.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
            w: 0.14 + Math.random() * 0.14, h: 0.08 + Math.random() * 0.07,
            color: colors[rnd(colors.length)], life: 1.2 + Math.random() * 1.1
        });
    }
}
export function useHint() {
    if (S.isGameOver || S.pausedAt !== null || S.hintsLeft <= 0) return;
    let bi = -1;
    for (let i = 0; i < S.exits.length; i++) {
        if (i === S.goals && !collected[i]) { bi = i; break; }
    }
    if (bi < 0) return;
    const dd = S.exitDists[bi], target = S.exits[bi];
    const cells = [S.player];
    let cur = S.player;
    for (let i = 0; i < HINT_LEN && cur !== target; i++) {
        let nxt = -1;
        for (let d = 0; d < 4 && nxt < 0; d++) {
            if (S.open[cur] & (1 << d)) {
                const v = S.NB[cur * 4 + d];
                if (dd[v] < dd[cur]) nxt = v;
            }
        }
        if (nxt < 0) break;
        cur = nxt;
        cells.push(cur);
    }
    S.hint = { cells, t0: performance.now() };
    S.hintsLeft--;
    S.hintsUsed++;
    updateHud();
    saveGame();
}
export function toggleFog() {
    S.fogOn = !S.fogOn;
    fogBtn.setAttribute('aria-pressed', String(S.fogOn));
}
export function orderedRouteLength() {
    if (!S.exits.length) return 0;
    let total = S.exitDists[0][S.startCell];
    for (let i = 1; i < S.exits.length; i++) total += S.exitDists[i][S.exits[i - 1]];
    return Math.max(0, total);
}
export function buildReveal() {
    bfs(S.open, S.startCell, S.dStart, S.prevStart);
    reveal.length = 0;
    S.exits.forEach((cell, i) => {
        const cells = [];
        for (let v = cell; v !== -1; v = S.prevStart[v]) cells.push(v);
        const path = new Path2D();
        for (let k = cells.length - 1; k >= 0; k--) {
            const x = (cells[k] % S.SIZE) + 0.5, y = ((cells[k] / S.SIZE) | 0) + 0.5;
            if (k === cells.length - 1) path.moveTo(x, y); else path.lineTo(x, y);
        }
        reveal.push({ path, color: `hsl(${Math.round(i * 360 / S.exits.length)}, 90%, 62%)` });
    });
}
export function saveGame() {
    if (S.isGameOver || S.multiplayerSession) return;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            maze: S.mazeCode, start: S.startCell, exits: S.exits, moves: S.moves, hintsLeft: S.hintsLeft, hintsUsed: S.hintsUsed,
            elapsed: S.startTime === null ? null : (S.pausedAt !== null ? S.pausedAt : performance.now()) - S.startTime
        }));
    } catch (_) { }
}
export function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { }
}
export function loadSave() {
    try {
        const v = JSON.parse(localStorage.getItem(SAVE_KEY));
        const side = v && typeof v.maze === 'string' ? Math.round(Math.sqrt(v.maze.length)) : 0;
        if (v && side >= 8 && side <= 64 && side * side === v.maze.length && Array.isArray(v.exits) && v.exits.length >= 1
            && v.exits.length <= MAX_GOALS && v.exits.every(c => Number.isInteger(c) && c >= 0 && c < v.maze.length)
            && Number.isInteger(v.start) && v.start >= 0 && v.start < v.maze.length
            && typeof v.moves === 'string') return v;
    } catch (_) { }
    return null;
}
export function resetUi() {
    S.isGameOver = false;
    S.pausedAt = null;
    S.revealed = false;
    reveal.length = 0;
    messageElement.textContent = "";
    winCard.classList.remove('show');
    createGame.hide();
    confirmEl.classList.remove('show');
    banner.classList.remove('show');
    document.body.classList.remove('in-menu');
    syncRoleUi();
    fitLayout();
}
export function beginScene() {
    S.mazeCode = Array.from(S.open, v => v.toString(16)).join('');
    for (let i = 0; i < S.exits.length; i++) bfs(S.open, S.exits[i], S.exitDists[i], null);
    S.solutionLen = orderedRouteLength();
    collected.fill(0);
    S.goals = 0;
    S.player = S.startCell;
    S.steps = 0; S.moves = '';
    S.startTime = S.endTime = null;
    S.hintsLeft = HINTS_PER_MAZE; S.hintsUsed = 0; S.hint = null;
    S.goalPingIndex = -1; S.goalPingAt = 0;
    confetti.length = 0;
    S.drawR = (S.player / S.SIZE) | 0; S.drawC = S.player % S.SIZE;
    S.kickX = S.kickY = S.pop = 0;
    buildWalls();
    buildMini();
    S.trailPath = new Path2D();
    S.trailPath.moveTo(S.drawC + 0.5, S.drawR + 0.5);
    cam.follow = true; cam.anchor = null;
    cam.tz = 1; cam.tcx = cam.tcy = S.SIZE / 2;
    if (reduceMotion) { S.introT = 1; cam.z = 1; cam.cx = cam.cy = S.SIZE / 2; }
    else { S.introT = 0; cam.z = 2.6; cam.cx = S.drawC + 0.5; cam.cy = S.drawR + 0.5; }
    clampCam(true, false);
    padReset();
    updateHud();
}
export function initGame(count, size) {
    S.goalTotal = count || S.goalTotal;
    applyMazeSize(size || S.SIZE);
    S.playerColor = PLAYER_COLOR;
    S.multiplayerPlayers = [];
    racerPos.clear();
    raceBoard.hide();
    resetUi();
    const generated = generateMazeData(S.goalTotal, S.SIZE);
    S.open = generated.open;
    S.startCell = generated.startCell;
    S.exits = generated.exits;
    beginScene();
    saveGame();
}
export function restoreGame(v) {
    applyMazeSize(Math.round(Math.sqrt(v.maze.length)));
    resetUi();
    S.open = Uint8Array.from(v.maze, (c: any) => parseInt(c, 16));
    S.startCell = v.start;
    S.exits = v.exits.slice();
    S.goalTotal = S.exits.length;
    beginScene();
    for (const ch of v.moves) {
        const d = +ch;
        if (!(d >= 0 && d < 4) || !(S.open[S.player] & (1 << d))) break;
        S.player = S.NB[S.player * 4 + d];
        S.steps++;
        S.moves += ch;
        S.trailPath.lineTo((S.player % S.SIZE) + 0.5, ((S.player / S.SIZE) | 0) + 0.5);
        const i = S.exits.indexOf(S.player);
        if (i === S.goals && !collected[i]) { collected[i] = 1; S.goals++; }
    }
    S.drawR = (S.player / S.SIZE) | 0; S.drawC = S.player % S.SIZE;
    S.introT = 1; cam.z = 1; cam.cx = cam.cy = S.SIZE / 2;
    S.hintsLeft = typeof v.hintsLeft === 'number' ? v.hintsLeft : HINTS_PER_MAZE;
    S.hintsUsed = typeof v.hintsUsed === 'number' ? v.hintsUsed : 0;
    if (typeof v.elapsed === 'number') S.startTime = performance.now() - v.elapsed;
    S.pausedAt = performance.now();
    setConfirm(true);
    confirmEl.classList.add('show');
    updateHud();
}
