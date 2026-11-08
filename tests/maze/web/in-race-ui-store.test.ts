import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mazeHudStore,
    publishHud,
    showMazeResult,
    hideMazeResult,
    showMazeBanner,
    hideMazeBanner,
    setMazeConfirmContent,
    showMazeConfirm,
    hideMazeConfirm,
    setMazeTheme,
    setNewMazeButtonLabel,
} from '../../../src/features/maze/ui/maze-view-store';

test('HUD store only notifies React when a displayed value changes', () => {
    let notifications = 0;
    const unsubscribe = mazeHudStore.subscribe(() => { notifications++; });

    publishHud({ steps: 42 });
    publishHud({ steps: 42 });
    publishHud({ steps: 43 });

    unsubscribe();
    assert.equal(notifications, 2);
    assert.equal(mazeHudStore.getSnapshot().steps, 43);
});

test('in-race overlays publish plain data for React to render', () => {
    showMazeResult('🏆 You win', [{ value: 12, label: 'Steps' }]);
    showMazeBanner('Connection lost');
    setMazeConfirmContent('Leave race?', 'Your racer will leave the match.');
    showMazeConfirm();

    const snapshot = mazeHudStore.getSnapshot();
    assert.equal(snapshot.resultVisible, true);
    assert.deepEqual(snapshot.resultStats, [{ value: 12, label: 'Steps' }]);
    assert.equal(snapshot.bannerVisible, true);
    assert.equal(snapshot.bannerText, 'Connection lost');
    assert.equal(snapshot.confirmVisible, true);
    assert.equal(snapshot.confirmTitle, 'Leave race?');

    hideMazeResult();
    hideMazeBanner();
    hideMazeConfirm();
    assert.equal(mazeHudStore.getSnapshot().resultVisible, false);
    assert.equal(mazeHudStore.getSnapshot().bannerVisible, false);
    assert.equal(mazeHudStore.getSnapshot().confirmVisible, false);
});


test('theme and action labels are published as React state', () => {
    setMazeTheme('dark');
    setNewMazeButtonLabel('Back to lobby');

    const snapshot = mazeHudStore.getSnapshot();
    assert.equal(snapshot.mazeTheme, 'dark');
    assert.equal(snapshot.resultButtonLabel, 'Back to lobby');
    assert.equal(snapshot.panelButtonLabel, 'Back to lobby');
});
