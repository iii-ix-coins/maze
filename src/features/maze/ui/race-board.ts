/**
 * Small, framework-free UI components. Each component owns only its own DOM rendering.
 * (The pre-game flow and the lobby live in ./create-game/ and ./lobby/.)
 */

/** Finished racers first, then the most targets, then the fewest steps. */
export function rankPlayers(players = []) {
    return [...players].sort((a, b) =>
        Number(b.finished) - Number(a.finished) ||
        (Number(b.goals) - Number(a.goals)) ||
        (Number(a.steps) - Number(b.steps))
    );
}

export class RaceBoardComponent {
    declare root: HTMLElement;
    declare list: HTMLElement;
    declare onPick: (id: string) => void;
    declare picking: any;

    /** Rows drawn at once; with up to 99 racers the rest collapse into a "+N more" footer. */
    static MAX_ROWS = 8;
    /**
     * @param {HTMLElement} root
     * @param {HTMLElement} list
     * @param {{onPick?:(id:string)=>void}} [options] when set, rows can be clicked (a spectator picks who to follow)
     */
    constructor(root, list, { onPick = null }: any = {}) {
        this.root = root;
        this.list = list;
        this.onPick = onPick;
        if (onPick) {
            list.addEventListener('click', event => {
                const row = event.target.closest && event.target.closest('.race-row[data-id]');
                if (row && this.picking) onPick(row.dataset.id);
            });
        }
    }
    show() { this.root.classList.add('show'); }
    hide() { this.root.classList.remove('show'); }
    /**
     * @param {object[]} players
     * @param {string} ownId  the local racer (empty for a spectator)
     * @param {number} goalTotal
     * @param {string} [focusId]  the racer a spectator follows
     */
    render(players = [], ownId = '', goalTotal = 3, focusId = '') {
        const ranked = rankPlayers(players);
        const max = RaceBoardComponent.MAX_ROWS;
        // The racers you care about (yourself, the one you follow) stay visible even when ranked below the cut-off.
        const pins = [ownId, focusId].filter((id, i, all) => id && all.indexOf(id) === i)
            .map(id => ranked.findIndex(item => item.id === id)).filter(rank => rank >= max).sort((a, b) => a - b);
        const visible = ranked.slice(0, max - pins.length);
        for (const rank of pins) visible.push(ranked[rank]);
        this.picking = Boolean(this.onPick) && !ownId;
        this.root.classList.toggle('is-pickable', this.picking);
        const rows = visible.map(player => this.row(player, ranked.indexOf(player), ownId, goalTotal, focusId));
        const hidden = ranked.length - visible.length;
        if (hidden > 0) {
            const more = document.createElement('li');
            more.className = 'race-more';
            more.textContent = `+${hidden} more racer${hidden === 1 ? '' : 's'}`;
            rows.push(more);
        }
        this.list.replaceChildren(...rows);
        this.root.dataset.crowd = String(ranked.length);
        this.show();
    }
    row(player, index, ownId, goalTotal, focusId = '') {
        const row = document.createElement('li');
        row.className = 'race-row';
        row.dataset.id = player.id;
        if (player.id === ownId) row.classList.add('is-you');
        if (focusId && player.id === focusId) row.classList.add('is-focus');
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
        return row;
    }
}
