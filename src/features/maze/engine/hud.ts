// The engine publishes an immutable HUD snapshot at its existing updateHud()
// call sites. React owns the visible DOM and subscribes to this store.
import { S, cam } from './state';
import { publishHud } from '../ui/maze-view-store';

export const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export function updateHud() {
    const elapsedAt = S.endTime !== null
        ? S.endTime
        : (S.pausedAt !== null ? S.pausedAt : (S.startTime === null ? 0 : performance.now()));
    const elapsed = S.startTime === null ? 0 : elapsedAt - S.startTime;

    publishHud({
        steps: Number(S.steps) || 0,
        time: fmtTime(elapsed),
        goals: `${S.goals}/${S.goalTotal}`,
        miniMapVisible: cam.tz > 1.02,
        zoom: `${Math.round(cam.tz * 100)}%`,
        hintsLeft: Number(S.hintsLeft) || 0,
        hintDisabled: S.hintsLeft <= 0 || S.isGameOver,
        follow: Boolean(cam.follow),
        fogOn: Boolean(S.fogOn),
    });
}
