/**
 * Small, framework-free UI components. Each component owns only its own DOM rendering.
 */
export class ModeMenuComponent {
    constructor(root) {
        this.root = root;
        this.status = document.getElementById('networkStatus');
    }
    show() {
        this.root.classList.add('show');
        document.body.classList.add('in-menu');
    }
    hide() { this.root.classList.remove('show'); }
    setNetworkStatus(state, message) {
        if (!this.status) return;
        this.status.dataset.state = state;
        this.status.textContent = message;
        this.status.setAttribute('aria-label', `Multiplayer status: ${message}`);
    }
    updateWaitingCounts(counts = {}) {
        const byPlayers = counts.waitingByPlayers || {};
        document.querySelectorAll('[data-waiting-players]').forEach(node => {
            const n = node.dataset.waitingPlayers;
            const count = Number(byPlayers[n] || 0);
            node.querySelector('b').textContent = String(count);
        });
    }
}

export class GoalMenuComponent {
    constructor(root) {
        this.root = root;
        this.subtitle = document.getElementById('menuSubtitle');
        this.playerCount = 1;
    }
    show(playerCount = 1) {
        this.playerCount = playerCount;
        this.root.classList.add('show');
        this.root.classList.toggle('multiplayer-goals', playerCount > 1);
        if (this.subtitle) {
            this.subtitle.textContent = playerCount > 1
                ? `${playerCount} players · shared maze · collect targets in order`
                : 'Collect every point in numbered order';
        }
        this.updateWaitingCounts({});
        document.body.classList.add('in-menu');
    }
    hide() { this.root.classList.remove('show'); }
    updateWaitingCounts(counts = {}) {
        const byMode = counts.waitingByMode || {};
        this.root.querySelectorAll('[data-waiting-goals]').forEach(node => {
            node.hidden = this.playerCount <= 1;
            const goal = node.dataset.waitingGoals;
            const count = Number(byMode[`${this.playerCount}:${goal}`] || 0);
            const value = node.querySelector('b');
            if (value) value.textContent = String(count);
        });
    }
}

export class WaitingRoomComponent {
    constructor(root) {
        this.root = root;
        this.title = document.getElementById('waitingTitle');
        this.text = document.getElementById('waitingText');
        this.count = document.getElementById('waitingCount');
        this.progress = document.getElementById('waitingProgress');
        this.leaveButton = document.getElementById('cancelQueue');
        this.settingsButton = document.getElementById('waitingOpenSettings');
    }
    show(players, goals) {
        this.root.classList.add('show');
        document.body.classList.add('in-menu');
        this.root.dataset.players = String(players);
        this.root.dataset.goals = String(goals);
        this.root.dataset.error = 'false';
        this.title.textContent = 'Finding your race';
        this.text.textContent = `Searching for ${players} players on a ${goals}-target maze. The race starts when the lobby is full.`;
        this.count.textContent = `Waiting players: 0 / ${players}`;
        this.progress.style.width = '0%';
        this.leaveButton.hidden = false;
        this.settingsButton.hidden = true;
    }
    update(waiting, required) {
        if (!this.root.classList.contains('show') || this.root.dataset.error === 'true') return;
        const n = Math.max(0, Number(waiting) || 0);
        const total = Math.max(1, Number(required) || 1);
        this.count.textContent = `Waiting players: ${n} / ${total}`;
        this.progress.style.width = `${Math.min(100, n / total * 100)}%`;
        if (n >= total) {
            this.title.textContent = 'Lobby full';
            this.text.textContent = 'Players found. Preparing a shared maze…';
        } else {
            this.title.textContent = 'Finding your race';
            this.text.textContent = `Waiting for ${total - n} more player${total - n === 1 ? '' : 's'} to join this exact mode.`;
        }
    }
    setMessage(title, text, isError = false) {
        this.root.classList.add('show');
        this.root.dataset.error = String(isError);
        this.title.textContent = title;
        this.text.textContent = text;
        this.progress.style.width = '0%';
        this.leaveButton.hidden = !isError;
        this.settingsButton.hidden = !isError;
    }
    hide() { this.root.classList.remove('show'); }
}

export class RaceBoardComponent {
    constructor(root, list) {
        this.root = root;
        this.list = list;
    }
    show() { this.root.classList.add('show'); }
    hide() { this.root.classList.remove('show'); }
    render(players = [], ownId = '', goalTotal = 3) {
        this.list.replaceChildren();
        const ranked = [...players].sort((a, b) =>
            Number(b.finished) - Number(a.finished) ||
            (Number(b.goals) - Number(a.goals)) ||
            (Number(a.steps) - Number(b.steps))
        );
        ranked.forEach((player, index) => {
            const row = document.createElement('li');
            row.className = 'race-row';
            if (player.id === ownId) row.classList.add('is-you');
            if (player.finished) row.classList.add('is-finished');
            const place = document.createElement('span');
            place.className = 'race-place';
            place.textContent = String(index + 1).padStart(2, '0');
            const dot = document.createElement('span');
            dot.className = 'race-dot';
            dot.style.backgroundColor = player.color || '#44d17c';
            const identity = document.createElement('span');
            identity.className = 'race-identity';
            const name = document.createElement('b');
            name.textContent = player.name || 'Player';
            const status = document.createElement('small');
            status.textContent = player.connected === false ? 'Disconnected' :
                (player.finished ? 'Finished' : `${Number(player.goals) || 0}/${goalTotal} targets`);
            identity.append(name, status);
            const score = document.createElement('strong');
            score.textContent = String(Number(player.steps) || 0);
            score.title = 'Steps';
            row.append(place, dot, identity, score);
            this.list.append(row);
        });
        this.show();
    }
}
