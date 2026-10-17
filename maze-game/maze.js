// ════════════════════════════════════════════════════════════════════
//  Maze v3 — ماز ۴۲×۴۲ + دوربین (زوم / ریست / پن) + افکت‌های بازی
//
//  مدل داده: هر خانه یک بایت دارد که بیت‌های آن «دیوارِ باز» را نشان می‌دهد
//  (۱=بالا، ۲=راست، ۴=پایین، ۸=چپ). دیوارها دیگر خانه نیستند؛ فقط خطی نازک
//  بین دو خانه‌اند، برای همین SIZE می‌تواند هر عددی (از جمله زوج) باشد.
//
//  فایل سه بخش دارد:  ۱) تولید ماز   ۲) دوربین و رندر   ۳) ورودی و رابط
//  مختصات دنیا بر حسب «خانه» است: ماز از (0,0) تا (SIZE,SIZE) را پر می‌کند.
// ════════════════════════════════════════════════════════════════════

const SIZE = 42;                 // ماز SIZE × SIZE خانه

// ── تنظیمات مولد ────────────────────────────────────────────────────
const CANDIDATES    = 36;        // هر بار این‌قدر ماز ساخته و بهترینش انتخاب می‌شود
const BRANCH_MIN    = 5;         // شاخهٔ انحرافیِ «معتبر» حداقل این‌قدر عمق دارد
const DEPTH_CAP     = 70;        // سقف سهم هر شاخه در امتیاز (تا یک شاخهٔ غول‌پیکر امتیاز را قبضه نکند)
const MIN_SEPARATION = SIZE;     // حداقل فاصلهٔ منهتنی شروع تا هدف (تا واقعاً دو سرِ نقشه باشند)
const LOOP_COUNT    = 20;        // حداکثر تعداد حلقه‌های انحرافی (در عمل حدود ۱۴ تا ساخته می‌شود)
const LOOP_MIN_CYCLE = 30;       // کوتاه‌ترین طول مجاز برای یک حلقه (حلقهٔ کوچک = اتاقک زشت)

// ── ظاهر ────────────────────────────────────────────────────────────
const WALL_PX = 2.5;             // ضخامت دیوار در زوم ۱۰۰٪ (پیکسل)
const WALL_COLOR = 'rgb(0, 0, 0)';
const PLAYER_COLOR = '#ff0000';
const EXIT_COLOR   = '#0400ff';
const BOARD_COLOR  = 'green';    // رنگ تخته (قاب دور آن در CSS: --board-surround)
const PLAYER_R = 0.32;           // شعاع پلیر (بر حسب خانه)
const EXIT_R   = 0.40;           // نیم‌قطر لوزی هدف (بر حسب خانه)

// ── دوربین و رابط ───────────────────────────────────────────────────
const ZOOM_MIN = 0.5, ZOOM_MAX = 5, ZOOM_STEP = 1.25;
const VIEW_MARGIN = 8;           // حاشیهٔ تخته تا لبهٔ نما در زوم ۱۰۰٪ (px)
const PANEL_W = 176;             // باید با --panel-w در CSS یکی باشد
const PAD_SPEED = 620;           // سرعت دوربین با جوی‌استیک (px بر ثانیه، در انحراف کامل)
const HINTS_PER_MAZE = 3, HINT_LEN = 14, HINT_MS = 3500;
const TORCH_RADIUS = 4.5;        // شعاع دید در حالت مشعل (خانه)

// ── جدول جهت‌ها و همسایه‌ها ─────────────────────────────────────────
const N = SIZE * SIZE;
const DR = [-1, 0, 1, 0];        // d: 0=بالا 1=راست 2=پایین 3=چپ   (بیت = 1 << d)
const DC = [0, 1, 0, -1];

const NB = new Int16Array(N * 4).fill(-1);
for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
        for (let d = 0; d < 4; d++) {
            const nr = r + DR[d], nc = c + DC[d];
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) NB[(r * SIZE + c) * 4 + d] = nr * SIZE + nc;
        }
    }
}

const rnd = n => (Math.random() * n) | 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ── حالت بازی ───────────────────────────────────────────────────────
let open = new Uint8Array(N);    // ساختار ماز
let startCell = 0;
let exitCell = 0;
let player = 0;
let isGameOver = false;

const mazeCanvas = $('maze');
const messageElement = $('message');

// ════════════════════════════════════════════════════════════════════
//  ۱) تولید ماز
// ════════════════════════════════════════════════════════════════════

// ۱-الف) درخت پوشا با Growing Tree
//   pNewest  : احتمال ادامه دادن از «تازه‌ترین» خانه (۱ = DFS خالص: کریدورهای بلند)
//   window   : در غیر این صورت از میان W خانهٔ اخیر انتخاب می‌شود (انشعاب‌های موضعی و زیاد)
//   straightW: وزن ادامهٔ مستقیم (کمتر از ۱ = پیچ‌وخم بیشتر)
function carveTree(pNewest, window_, straightW) {
    const o = new Uint8Array(N);
    const seen = new Uint8Array(N);
    const dirIn = new Int8Array(N).fill(-1);
    const list = [];
    const cand = [0, 0, 0, 0], wt = [0, 0, 0, 0];

    const first = rnd(N);
    seen[first] = 1;
    list.push(first);

    while (list.length) {
        const li = Math.random() < pNewest
            ? list.length - 1
            : list.length - 1 - rnd(Math.min(list.length, window_));
        const cur = list[li];

        let cnt = 0, tot = 0;
        for (let d = 0; d < 4; d++) {
            const n = NB[cur * 4 + d];
            if (n >= 0 && !seen[n]) {
                const w = d === dirIn[cur] ? straightW : 1;
                cand[cnt] = d; wt[cnt] = w; tot += w; cnt++;
            }
        }

        if (cnt === 0) {                       // بن‌بست: این خانه دیگر فعال نیست
            if (li === list.length - 1) list.pop(); else list.splice(li, 1);
            continue;
        }

        let x = Math.random() * tot, k = 0;
        while (k < cnt - 1 && x >= wt[k]) { x -= wt[k]; k++; }
        const d = cand[k];
        const nxt = NB[cur * 4 + d];

        o[cur] |= 1 << d;
        o[nxt] |= 1 << ((d + 2) & 3);
        seen[nxt] = 1;
        dirIn[nxt] = d;
        list.push(nxt);
    }
    return o;
}

// ۱-ب) ابزار BFS (با آرایه‌های موقتِ مشترک تا فشار GC نداشته باشیم)
const queue = new Int32Array(N);

function bfs(o, src, dist, prev) {
    dist.fill(-1);
    dist[src] = 0;
    if (prev) prev[src] = -1;
    let head = 0, tail = 0, last = src;
    queue[tail++] = src;
    while (head < tail) {
        const u = queue[head++];
        last = u;
        const m = o[u];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const v = NB[u * 4 + d];
                if (dist[v] < 0) {
                    dist[v] = dist[u] + 1;
                    if (prev) prev[v] = u;
                    queue[tail++] = v;
                }
            }
        }
    }
    return last;                               // آخرین خانهٔ دیده‌شده = دورترین
}

// ۱-پ) ارزیابی یک ماز: شروع/هدف را روی دو سر قطر درخت می‌گذارد و پیچیدگی را امتیاز می‌دهد
const dA = new Int32Array(N), dG = new Int32Array(N), dP = new Int32Array(N);
const prevA = new Int32Array(N), rootOf = new Int32Array(N), maxDepth = new Int32Array(N);
const onPath = new Uint8Array(N);

function evaluate(o) {
    // قطر درخت = طولانی‌ترین مسیر ممکن در کل ماز (دو بار BFS)
    const a = bfs(o, rnd(N), dA, null);
    const b = bfs(o, a, dA, prevA);
    const L = dA[b];

    // مسیر راه‌حل و جهت تصادفی (کدام سر شروع باشد، کدام هدف)
    onPath.fill(0);
    const path = [];
    for (let v = b; v !== -1; v = prevA[v]) { onPath[v] = 1; path.push(v); }
    const swap = Math.random() < 0.5;
    const s = swap ? b : a, g = swap ? a : b;

    // تعداد پیچ‌های مسیر راه‌حل
    let turns = 0, lastD = -1;
    for (let i = 0; i + 1 < path.length; i++) {
        let d = 0;
        while (NB[path[i] * 4 + d] !== path[i + 1]) d++;
        if (lastD >= 0 && d !== lastD) turns++;
        lastD = d;
    }

    // شاخه‌های انحرافی: BFS چندمنبعی از همهٔ خانه‌های مسیر اصلی
    dP.fill(-1); rootOf.fill(-1); maxDepth.fill(0);
    let head = 0, tail = 0;
    for (const p of path) { dP[p] = 0; queue[tail++] = p; }
    while (head < tail) {
        const u = queue[head++], m = o[u];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const v = NB[u * 4 + d];
                if (dP[v] < 0) {
                    dP[v] = dP[u] + 1;
                    rootOf[v] = onPath[u] ? v : rootOf[u];
                    queue[tail++] = v;
                }
            }
        }
    }
    for (let v = 0; v < N; v++) {
        if (!onPath[v] && dP[v] > maxDepth[rootOf[v]]) maxDepth[rootOf[v]] = dP[v];
    }
    let branches = 0, deepSum = 0, deadEnds = 0;
    for (let v = 0; v < N; v++) {
        if (rootOf[v] === v && maxDepth[v] >= BRANCH_MIN) {
            branches++;
            deepSum += Math.min(maxDepth[v], DEPTH_CAP);
        }
        const m = o[v];
        if (m && (m & (m - 1)) === 0) deadEnds++;     // فقط یک بیت روشن = بن‌بست
    }

    // «طعمه»: چند کریدور متفاوت و دور (از نظر مسیر) از هدف، از کنارِ هدف رد می‌شوند
    bfs(o, g, dG, null);
    const gr = (g / SIZE) | 0, gc = g % SIZE;
    const lureRoots = new Set();
    for (let r = Math.max(0, gr - 4); r <= Math.min(SIZE - 1, gr + 4); r++) {
        for (let c = Math.max(0, gc - 4); c <= Math.min(SIZE - 1, gc + 4); c++) {
            const v = r * SIZE + c;
            if (!onPath[v] && dG[v] >= 40) lureRoots.add(rootOf[v]);
        }
    }
    const lures = Math.min(lureRoots.size, 8);

    const sep = Math.abs(((s / SIZE) | 0) - gr) + Math.abs((s % SIZE) - gc);

    // امتیاز پیچیدگی: مسیر طولانی + تصمیم‌های فریبنده + شاخه‌های عمیق + طعمه‌های کنار هدف
    let score = L + 1.2 * deepSum + 6 * branches + 0.5 * turns + 10 * lures;
    if (sep < MIN_SEPARATION) score *= 0.6;           // شروع و هدف نباید کنار هم باشند

    return { score, L, s, g, branches, deepSum, deadEnds, turns, lures, sep };
}

// ۱-ت) حلقه‌های انحرافی (detour): دیوارهایی را می‌شکنیم که
//   ① کوتاه‌ترین مسیر شروع→هدف را کوتاه‌تر نکنند (پس راه‌حل همچنان یکتاست)،
//   ② حلقه‌ای به طول حداقل LOOP_MIN_CYCLE بسازند (نه اتاقک کوچک).
// نتیجه: مسیرهایی که بن‌بست نیستند ولی بازیکن را دور خودش می‌چرخانند.
const dS = new Int32Array(N), dGoal = new Int32Array(N);
const stamp = new Int32Array(N), localDist = new Int32Array(N);
let stampId = 0;

function reachableWithin(o, u, v, maxD) {
    stampId++;
    let head = 0, tail = 0;
    queue[tail++] = u; stamp[u] = stampId; localDist[u] = 0;
    while (head < tail) {
        const x = queue[head++];
        if (x === v) return true;
        if (localDist[x] >= maxD) continue;
        const m = o[x];
        for (let d = 0; d < 4; d++) {
            if (m & (1 << d)) {
                const y = NB[x * 4 + d];
                if (stamp[y] !== stampId) { stamp[y] = stampId; localDist[y] = localDist[x] + 1; queue[tail++] = y; }
            }
        }
    }
    return false;
}

function addDetourLoops(o, s, g, L, count) {
    bfs(o, s, dS, null);
    bfs(o, g, dGoal, null);

    const walls = [];
    for (let u = 0; u < N; u++) {
        for (let d = 1; d <= 2; d++) {                    // فقط راست و پایین تا هر دیوار یک بار بیاید
            if (NB[u * 4 + d] >= 0 && !(o[u] & (1 << d))) walls.push(u * 4 + d);
        }
    }
    for (let i = walls.length - 1; i > 0; i--) {          // برزدن
        const j = rnd(i + 1);
        const t = walls[i]; walls[i] = walls[j]; walls[j] = t;
    }

    let added = 0;
    for (let i = 0; i < walls.length && added < count; i++) {
        const u = walls[i] >> 2, d = walls[i] & 3, v = NB[u * 4 + d];
        if (Math.min(dS[u] + 1 + dGoal[v], dS[v] + 1 + dGoal[u]) <= L) continue;   // میان‌بر می‌ساخت
        if (reachableWithin(o, u, v, LOOP_MIN_CYCLE - 2)) continue;               // حلقهٔ کوچک
        o[u] |= 1 << d;
        o[v] |= 1 << ((d + 2) & 3);
        added++;
        bfs(o, s, dS, null);
        bfs(o, g, dGoal, null);
    }
    return added;
}

// ۱-ث) بهترین از میان چند کاندید؛ هر کاندید سبک (پارامتر) خودش را دارد
function generateBest() {
    let best = null;
    for (let i = 0; i < CANDIDATES; i++) {
        const pNewest = 0.55 + Math.random() * 0.4;
        const win = 4 + rnd(40);
        const straightW = 0.35 + Math.random() * 0.8;
        const o = carveTree(pNewest, win, straightW);
        const ev = evaluate(o);
        if (!best || ev.score > best.score) best = { ...ev, o };
    }
    best.loops = addDetourLoops(best.o, best.s, best.g, best.L, LOOP_COUNT);
    return best;
}

function generateMazeData() {
    const m = generateBest();
    open = m.o;
    startCell = m.s;
    exitCell = m.g;
    return m;
}


// ════════════════════════════════════════════════════════════════════
//  ۲) دوربین و رندر (Canvas + حلقهٔ requestAnimationFrame)
//
//  دیوارها یک بار به‌صورت Path2D (برداری، در مختصات دنیا) ساخته می‌شوند و هر فریم
//  زیر ماتریس دوربین کشیده می‌شوند؛ پس در هر زومی کاملاً شفاف می‌مانند.
// ════════════════════════════════════════════════════════════════════
const mctx = mazeCanvas.getContext('2d');
const miniCanvas = $('mini'), miniCtx = miniCanvas.getContext('2d');
const miniLayer = document.createElement('canvas');
const winCard = $('winCard'), winStats = $('winStats');
const hudSteps = $('hudSteps'), hudTime = $('hudTime'), zoomLabel = $('zoomLabel');
const hintCount = $('hintCount'), hintBtn = $('hintBtn'), fogBtn = $('fogBtn'), followBtn = $('followBtn');

let V = 640;          // ضلع نمای بازی (px CSS)
let base = 15;        // px هر خانه در زوم ۱۰۰٪ (صحیح، تا خطوط در حالت عادی شفاف باشند)
let dpr = 1;
let miniM = 150, miniPad = 5, miniScale = 3;

// دوربین: z = زوم، (cx,cy) = نقطه‌ای از دنیا که وسط نما است. پیشوند t = مقدار هدف (نرم به آن می‌رسیم).
//  follow = دوربین روی بازیکن قفل است. anchor = نقطهٔ ثابتِ زیر ماوس هنگام زوم آزاد.
const cam = { z: 1, cx: SIZE / 2, cy: SIZE / 2, tz: 1, tcx: SIZE / 2, tcy: SIZE / 2, follow: true, anchor: null };

// صحنه
let wallPath = null, trailPath = null;
let solutionLen = 0, steps = 0, startTime = null, endTime = null;
let hintsLeft = 0, hintsUsed = 0, hint = null;
let drawR = 0, drawC = 0, kickX = 0, kickY = 0, pop = 0;   // موقعیت نمایشی (نرم) و جلوه‌های حرکت
let fogOn = false, introT = 1;
const confetti = [];

// ── چیدمان: اندازهٔ نما و اندازهٔ خانه ──────────────────────────────
function fitLayout() {
    dpr = window.devicePixelRatio || 1;
    const wide = window.innerWidth > 900;
    const side = wide
        ? Math.min(window.innerWidth - PANEL_W - 18 - 110, window.innerHeight - 116)
        : Math.min(window.innerWidth - 56, window.innerHeight - 100);
    V = clamp(Math.floor(side / 2) * 2, 300, 920);
    base = Math.max(6, Math.floor((V - 2 * VIEW_MARGIN) / SIZE));
    mazeCanvas.style.width = mazeCanvas.style.height = V + 'px';
    mazeCanvas.width = mazeCanvas.height = Math.round(V * dpr);
    miniM = wide ? clamp(V - 430, 96, PANEL_W - 22) : 132;
    if (wallPath) buildMini();
    placePad();
}

// ── ساخت مسیر دیوارها (مختصات دنیا) ─────────────────────────────────
function buildWalls() {
    const p = new Path2D();
    // خطوط افقی: دیوار بین خانهٔ (r-1,c) و (r,c) — تکه‌های پشت‌سرهم یکی کشیده می‌شوند
    for (let r = 0; r <= SIZE; r++) {
        let run = -1;
        for (let c = 0; c <= SIZE; c++) {
            const wall = c < SIZE && (r === 0 || r === SIZE || !(open[(r - 1) * SIZE + c] & 4));
            if (wall && run < 0) run = c;
            if (!wall && run >= 0) { p.moveTo(run, r); p.lineTo(c, r); run = -1; }
        }
    }
    // خطوط عمودی: دیوار بین خانهٔ (r,c-1) و (r,c)
    for (let c = 0; c <= SIZE; c++) {
        let run = -1;
        for (let r = 0; r <= SIZE; r++) {
            const wall = r < SIZE && (c === 0 || c === SIZE || !(open[r * SIZE + c - 1] & 2));
            if (wall && run < 0) run = r;
            if (!wall && run >= 0) { p.moveTo(c, run); p.lineTo(c, r); run = -1; }
        }
    }
    wallPath = p;
}

// ── مینی‌مپ: لایهٔ ثابت (تخته + دیوارها) یک بار کشیده می‌شود ─────────
function buildMini() {
    const M = miniM;
    miniScale = (M - 2 * miniPad) / SIZE;
    for (const cv of [miniCanvas, miniLayer]) { cv.width = cv.height = Math.round(M * dpr); }
    miniCanvas.style.width = miniCanvas.style.height = M + 'px';
    const g = miniLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniLayer.width, miniLayer.height);
    g.setTransform(dpr * miniScale, 0, 0, dpr * miniScale, dpr * miniPad, dpr * miniPad);
    g.fillStyle = BOARD_COLOR;
    g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = WALL_COLOR;
    g.lineWidth = 1 / miniScale;
    g.lineCap = 'square';
    g.stroke(wallPath);
}

// ── دوربین ──────────────────────────────────────────────────────────
// tight=true  : حالت دنبال‌کردن — دوربین از لبهٔ تخته بیرون نمی‌زند
// tight=false : حالت آزاد — می‌شود تخته را تا حدی کنار کشید (در هر زومی) ولی هرگز گم نمی‌شود
function clampCam(tight, target) {
    const z = target ? cam.tz : cam.z;
    const vw = V / (base * z);                           // عرض دیدِ دنیا بر حسب خانه
    let cx = target ? cam.tcx : cam.cx, cy = target ? cam.tcy : cam.cy;
    if (tight) {
        const pad = 0.8, lo = vw / 2 - pad, hi = SIZE - vw / 2 + pad;
        cx = lo > hi ? SIZE / 2 : clamp(cx, lo, hi);
        cy = lo > hi ? SIZE / 2 : clamp(cy, lo, hi);
    } else {
        const e = 0.3 * vw;
        cx = clamp(cx, -e, SIZE + e);
        cy = clamp(cy, -e, SIZE + e);
    }
    if (target) { cam.tcx = cx; cam.tcy = cy; } else { cam.cx = cx; cam.cy = cy; }
}

// زوم: در حالت دنبال‌کردن حول بازیکن، در حالت آزاد حول نقطهٔ زیر ماوس
function zoomAt(newZ, sx, sy) {
    newZ = clamp(newZ, ZOOM_MIN, ZOOM_MAX);
    if (newZ === cam.tz) return;
    if (!cam.follow) {
        const s = base * cam.z;
        cam.anchor = { sx, sy, wx: cam.cx + (sx - V / 2) / s, wy: cam.cy + (sy - V / 2) / s };
    }
    cam.tz = newZ;
}
const zoomBy = f => zoomAt(cam.tz * f, V / 2, V / 2);

function resetView() {
    cam.follow = true;
    cam.anchor = null;
    cam.tz = 1;
    cam.tcx = cam.tcy = SIZE / 2;
}

// جابه‌جایی دوربین بر حسب خانه (فوری، بدون تأخیر) — حالت آزاد را فعال می‌کند
function panWorld(dx, dy) {
    cam.follow = false;
    cam.anchor = null;
    cam.tcx += dx; cam.tcy += dy;
    clampCam(false, true);
    cam.cx = cam.tcx; cam.cy = cam.tcy;
}
const panByPixels = (dx, dy) => panWorld(-dx / (base * cam.z), -dy / (base * cam.z));

// در حالت آزاد، اگر بازیکن به لبهٔ نما برسد دوربین فقط به‌اندازهٔ لازم جلو می‌آید تا گم نشود
function ensurePlayerVisible() {
    if (cam.follow) return;
    const vw = V / (base * cam.tz), m = Math.min(3, vw * 0.2);
    const px = (player % SIZE) + 0.5, py = ((player / SIZE) | 0) + 0.5;
    const l = cam.tcx - vw / 2 + m, r = cam.tcx + vw / 2 - m, t = cam.tcy - vw / 2 + m, b = cam.tcy + vw / 2 - m;
    if (px < l) cam.tcx -= l - px; else if (px > r) cam.tcx += px - r;
    if (py < t) cam.tcy -= t - py; else if (py > b) cam.tcy += py - b;
    clampCam(false, true);
}

function updateCamera(dt) {
    if (cam.follow) {
        cam.anchor = null;
        cam.tcx = drawC + 0.5;
        cam.tcy = drawR + 0.5;
        clampCam(true, true);
    }
    cam.z += (cam.tz - cam.z) * (1 - Math.exp(-dt * 11));
    if (Math.abs(cam.tz - cam.z) < 0.0008) cam.z = cam.tz;

    if (cam.anchor) {                                   // زوم آزاد: نقطهٔ زیر ماوس سرِ جایش می‌ماند
        const a = cam.anchor;
        cam.cx = a.wx - (a.sx - V / 2) / (base * cam.z);
        cam.cy = a.wy - (a.sy - V / 2) / (base * cam.z);
        cam.tcx = a.wx - (a.sx - V / 2) / (base * cam.tz);
        cam.tcy = a.wy - (a.sy - V / 2) / (base * cam.tz);
        clampCam(false, true);
        if (cam.z === cam.tz) cam.anchor = null;
    } else {
        const k = 1 - Math.exp(-dt * (cam.follow ? 8 : 12));
        cam.cx += (cam.tcx - cam.cx) * k;
        cam.cy += (cam.tcy - cam.cy) * k;
        if (Math.abs(cam.tcx - cam.cx) < 0.0005) cam.cx = cam.tcx;
        if (Math.abs(cam.tcy - cam.cy) < 0.0005) cam.cy = cam.tcy;
    }
    clampCam(cam.follow, false);
}

// ── به‌روزرسانی هر فریم ─────────────────────────────────────────────
const padVec = { x: 0, y: 0 };                          // انحراف جوی‌استیک (−۱ تا ۱)

function update(dt) {
    // موقعیت نمایشی پلیر نرم به خانهٔ منطقی می‌رسد (منطق بازی همچنان گسسته و دقیق است)
    const tr = (player / SIZE) | 0, tc = player % SIZE, k = 1 - Math.exp(-dt * 24);
    drawR += (tr - drawR) * k;
    drawC += (tc - drawC) * k;
    if (Math.abs(tr - drawR) < 0.002) drawR = tr;
    if (Math.abs(tc - drawC) < 0.002) drawC = tc;

    const kd = Math.exp(-dt * 16);                      // برگشتِ ضربهٔ برخورد با دیوار
    kickX *= kd; kickY *= kd;
    if (Math.abs(kickX) < 0.001) kickX = 0;
    if (Math.abs(kickY) < 0.001) kickY = 0;
    pop *= Math.exp(-dt * 9);
    if (introT < 1) introT = Math.min(1, introT + dt / 0.9);

    const pm = Math.hypot(padVec.x, padVec.y);          // جوی‌استیک: دوربین به سمت دسته می‌رود
    if (pm > 0.1) {
        const sp = PAD_SPEED * ((pm - 0.1) / 0.9) * dt / (base * cam.z);
        panWorld((padVec.x / pm) * sp, (padVec.y / pm) * sp);
    }

    updateCamera(dt);

    for (let i = confetti.length - 1; i >= 0; i--) {    // کانفتی
        const p = confetti[i];
        p.vy += 16 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        p.life -= dt;
        if (p.life <= 0) confetti.splice(i, 1);
    }
    updateHud();
}

// ── ترسیم صحنه ──────────────────────────────────────────────────────
function draw(t) {
    if (!wallPath) return;
    const ctx = mctx, time = t / 1000;
    const s = base * cam.z;                              // px هر خانه در زوم فعلی
    const tx = Math.round((V / 2 - cam.cx * s) * dpr) / dpr;   // جابه‌جایی هم‌تراز با پیکسل دستگاه
    const ty = Math.round((V / 2 - cam.cy * s) * dpr) / dpr;
    const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, tx * dpr, ty * dpr);
    const ease = 1 - Math.pow(1 - introT, 3);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);
    world();

    // تخته + سایهٔ ملایم لبه‌ها (ویگنت)
    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.78);
    vg.addColorStop(0, 'rgba(255,255,255,0.10)');
    vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ردپای بازیکن (مسیرهایی که رفته)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.46;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke(trailPath);

    // دیوارها: ضخامت با زوم کمی تغییر می‌کند (نه به‌اندازهٔ خود زوم) تا همیشه نازک بمانند
    ctx.globalAlpha = ease;
    ctx.lineWidth = clamp(WALL_PX * Math.sqrt(cam.z), WALL_PX * 0.7, WALL_PX * 2.4) / s;
    ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    ctx.strokeStyle = WALL_COLOR;
    ctx.stroke(wallPath);
    ctx.globalAlpha = 1;

    const pxw = drawC + 0.5 + kickX, pyw = drawR + 0.5 + kickY;   // موقعیت پلیر در دنیا

    // راهنما: مسیر کوتاه به سمت هدف
    if (hint) {
        const age = performance.now() - hint.t0;
        if (age > HINT_MS) hint = null;
        else {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (HINT_MS - age) / 700);
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 0.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.setLineDash([0.5, 0.4]);
            ctx.lineDashOffset = -time * 2.2;
            ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 8 * dpr;
            ctx.beginPath();
            ctx.moveTo(pxw, pyw);
            for (let i = 1; i < hint.cells.length; i++) {
                const c = hint.cells[i];
                ctx.lineTo((c % SIZE) + 0.5, ((c / SIZE) | 0) + 0.5);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    // نقطهٔ شروع: حلقهٔ کم‌رنگ هم‌رنگ پلیر
    const sx0 = (startCell % SIZE) + 0.5, sy0 = ((startCell / SIZE) | 0) + 0.5;
    ctx.beginPath();
    ctx.arc(sx0, sy0, 0.4 * ease, 0, Math.PI * 2);
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6 / s;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // هدف: لوزی چرخان + موج‌های نبضی
    const ex = (exitCell % SIZE) + 0.5, ey = ((exitCell / SIZE) | 0) + 0.5;
    if (!reduceMotion) {
        for (let k = 0; k < 2; k++) {
            const ph = (time * 0.8 + k * 0.5) % 1;
            ctx.beginPath();
            ctx.arc(ex, ey, EXIT_R * 0.7 + ph * 0.95, 0, Math.PI * 2);
            ctx.strokeStyle = EXIT_COLOR;
            ctx.globalAlpha = (1 - ph) * 0.55 * ease;
            ctx.lineWidth = 2 / s;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(ex, ey);
    if (!reduceMotion) ctx.rotate(time * 0.9);
    ctx.scale(ease, ease);
    ctx.shadowColor = EXIT_COLOR; ctx.shadowBlur = 10 * dpr;
    ctx.fillStyle = EXIT_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, -EXIT_R); ctx.lineTo(EXIT_R, 0); ctx.lineTo(0, EXIT_R); ctx.lineTo(-EXIT_R, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6 / s;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // بازیکن: دایرهٔ درخشان با حاشیهٔ سفید و ضربان ملایم
    const pr = PLAYER_R * (1 + (reduceMotion ? 0 : 0.06 * Math.sin(time * 6)) + 0.28 * pop);
    ctx.save();
    ctx.shadowColor = PLAYER_COLOR; ctx.shadowBlur = 12 * dpr;
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.arc(pxw, pyw, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8 / s;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';            // برق کوچک
    ctx.beginPath();
    ctx.arc(pxw - pr * 0.3, pyw - pr * 0.32, pr * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // حالت مشعل: همه‌جا تاریک جز دایره‌ای دور بازیکن
    if (fogOn && !isGameOver) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fx = tx + pxw * s, fy = ty + pyw * s, r1 = TORCH_RADIUS * s;
        const fg = ctx.createRadialGradient(fx, fy, r1 * 0.35, fx, fy, r1);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(1, 'rgba(0,0,0,0.94)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, V, V);
        world();
    }

    // کانفتی پیروزی
    for (const p of confetti) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 0.6);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// مینی‌مپ: کل ماز + مستطیل ناحیهٔ دیده‌شده؛ کلیک/کشیدن روی آن دوربین را جابه‌جا می‌کند
function drawMini() {
    if (!wallPath) return;
    const g = miniCtx, torch = fogOn && !isGameOver;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!torch) g.drawImage(miniLayer, 0, 0, miniM, miniM);
    g.translate(miniPad, miniPad);
    g.scale(miniScale, miniScale);
    if (torch) {                                         // در حالت مشعل فقط جاهایی که رفته‌ای نشان داده می‌شود
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, SIZE, SIZE);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.stroke(trailPath);
    }
    const dot = (cell, color, r) => {
        g.beginPath();
        g.arc((cell % SIZE) + 0.5, ((cell / SIZE) | 0) + 0.5, r / miniScale, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
        g.lineWidth = 1 / miniScale; g.strokeStyle = '#fff'; g.stroke();
    };
    if (!torch) dot(exitCell, EXIT_COLOR, 3.2);
    dot(player, PLAYER_COLOR, 3.2);
    const vw = V / (base * cam.z);
    g.beginPath();
    g.rect(cam.cx - vw / 2, cam.cy - vw / 2, vw, vw);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.lineWidth = 1.6 / miniScale; g.strokeStyle = '#fff'; g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
}

// ── نوار اطلاعات (فقط وقتی مقدار عوض شده DOM را لمس می‌کنیم) ─────────
const fmtTime = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hudCache = {};
function setHud(el, key, val) {
    if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
}
function updateHud() {
    setHud(hudSteps, 's', steps);
    setHud(hudTime, 't', fmtTime(startTime === null ? 0 : (endTime === null ? performance.now() : endTime) - startTime));
    setHud(zoomLabel, 'z', Math.round(cam.tz * 100) + '%');
    setHud(hintCount, 'h', hintsLeft);
    if (hudCache.f !== cam.follow) { hudCache.f = cam.follow; followBtn.setAttribute('aria-pressed', String(cam.follow)); }
    hintBtn.disabled = hintsLeft <= 0 || isGameOver;
}

// ════════════════════════════════════════════════════════════════════
//  ۳) منطق بازی، ورودی و رابط
// ════════════════════════════════════════════════════════════════════
function movePlayer(d) {
    if (isGameOver) return;
    if (open[player] & (1 << d)) {                        // دیوار بین دو خانه باز است؟
        player = NB[player * 4 + d];
        steps++;
        if (startTime === null) startTime = performance.now();
        trailPath.lineTo((player % SIZE) + 0.5, ((player / SIZE) | 0) + 0.5);
        pop = 1;
        ensurePlayerVisible();
        checkWin();
    } else {                                              // برخورد با دیوار: تکان کوچک
        kickX = DC[d] * 0.14;
        kickY = DR[d] * 0.14;
    }
}

function checkWin() {
    if (player === exitCell) {
        isGameOver = true;
        endTime = performance.now();
        messageElement.textContent = "🏆 فوق‌العاده بود! ماز با موفقیت حل شد.";
        const eff = Math.min(100, Math.round(100 * solutionLen / Math.max(1, steps)));
        const item = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
        winStats.innerHTML = item(steps, 'گام') + item(solutionLen, 'کوتاه‌ترین مسیر') + item(eff + '%', 'کارایی')
            + item(fmtTime(endTime - startTime), 'زمان') + (hintsUsed ? item(hintsUsed, 'راهنما') : '');
        winCard.classList.add('show');
        if (!reduceMotion) {
            burst();
            setTimeout(burst, 320);
        }
        cam.follow = true;                                // نمای کلی ماز و ردپا را نشان بده
        cam.anchor = null;
        cam.tz = 1;
        updateHud();
    }
}

function burst() {
    const x = (exitCell % SIZE) + 0.5, y = ((exitCell / SIZE) | 0) + 0.5;
    const colors = [PLAYER_COLOR, EXIT_COLOR, '#ffd24a', '#ffffff', '#7cfc9a'];
    for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
        confetti.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
            w: 0.14 + Math.random() * 0.14, h: 0.08 + Math.random() * 0.07,
            color: colors[rnd(colors.length)], life: 1.2 + Math.random() * 1.1
        });
    }
}

// راهنما: چند خانهٔ بعدیِ کوتاه‌ترین مسیر تا هدف (فقط HINTS_PER_MAZE بار در هر ماز)
const toExit = new Int32Array(N);
function useHint() {
    if (isGameOver || hintsLeft <= 0) return;
    bfs(open, exitCell, toExit, null);
    const cells = [player];
    let cur = player;
    for (let i = 0; i < HINT_LEN && cur !== exitCell; i++) {
        let nxt = -1;
        for (let d = 0; d < 4 && nxt < 0; d++) {
            if (open[cur] & (1 << d)) {
                const v = NB[cur * 4 + d];
                if (toExit[v] < toExit[cur]) nxt = v;
            }
        }
        if (nxt < 0) break;
        cur = nxt;
        cells.push(cur);
    }
    hint = { cells, t0: performance.now() };
    hintsLeft--;
    hintsUsed++;
    updateHud();
}

function toggleFog() {
    fogOn = !fogOn;
    fogBtn.setAttribute('aria-pressed', String(fogOn));
}

function initGame() {
    isGameOver = false;
    messageElement.textContent = "";
    winCard.classList.remove('show');
    fitLayout();

    const m = generateMazeData();
    solutionLen = m.L;
    player = startCell;
    steps = 0; startTime = endTime = null;
    hintsLeft = HINTS_PER_MAZE; hintsUsed = 0; hint = null;
    confetti.length = 0;
    drawR = (player / SIZE) | 0; drawC = player % SIZE;
    kickX = kickY = pop = 0;

    buildWalls();
    buildMini();
    trailPath = new Path2D();
    trailPath.moveTo(drawC + 0.5, drawR + 0.5);

    // معرفی: دوربین روی بازیکن شروع می‌کند و عقب می‌کشد تا کل ماز دیده شود
    cam.follow = true; cam.anchor = null;
    cam.tz = 1; cam.tcx = cam.tcy = SIZE / 2;
    if (reduceMotion) { introT = 1; cam.z = 1; cam.cx = cam.cy = SIZE / 2; }
    else { introT = 0; cam.z = 2.6; cam.cx = drawC + 0.5; cam.cy = drawR + 0.5; }
    clampCam(true, false);
    padReset();
    updateHud();
}

// ── ورودی: کیبورد (فلش‌ها همان‌طور که بود حرکت می‌دهند) ──────────────
const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
document.addEventListener('keydown', (e) => {
    if (Object.prototype.hasOwnProperty.call(ARROWS, e.key)) {
        e.preventDefault();
        movePlayer(ARROWS[e.key]);
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {                                     // e.code: مستقل از زبان کیبورد
        case 'Equal': case 'NumpadAdd':      zoomBy(ZOOM_STEP); break;
        case 'Minus': case 'NumpadSubtract': zoomBy(1 / ZOOM_STEP); break;
        case 'Digit0': case 'Numpad0':       resetView(); break;
        case 'KeyC': cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; break;
        case 'KeyF': toggleFog(); break;
        case 'KeyH': useHint(); break;
    }
});

// ── ورودی: دکمه‌های پنل ──────────────────────────────────────────────
$('zoomIn').addEventListener('click', () => zoomBy(ZOOM_STEP));
$('zoomOut').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
$('zoomReset').addEventListener('click', resetView);
followBtn.addEventListener('click', () => { cam.follow = !cam.follow; if (cam.follow) cam.anchor = null; });
fogBtn.addEventListener('click', toggleFog);
hintBtn.addEventListener('click', useHint);
// بعد از کلیک روی دکمه‌ها فوکوس برداشته می‌شود تا Space/Enter ناخواسته دوباره آن‌ها را نزند
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

// ── ورودی: کشیدن روی نقشه = حرکت پلیر | پینچ و چرخ ماوس = زوم ───────
const stageEl = $('stage');
const ptrs = new Map();
let pinchDist = 0;

// فاصلهٔ لازم برای یک گام (متناسب با اندازهٔ خانه روی صفحه)
const swipeStep = () => clamp(base * cam.z * 0.8, 14, 34);

// جلوگیری کامل از اسکرول/زوم/کشیدن خودِ صفحه با لمس روی نقشه و پد
for (const el of [stageEl, ]) {
    for (const ev of ['touchstart', 'touchmove']) {
        el.addEventListener(ev, (e) => { e.preventDefault(); }, { passive: false });
    }
}

mazeCanvas.addEventListener('pointerdown', (e) => {
    mazeCanvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
});

mazeCanvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;

    if (ptrs.size === 1) {
        const step = swipeStep();
        for (let guard = 0; guard < 6; guard++) {          // کشیدن سریع = چند گام
            const dx = p.x - p.ax, dy = p.y - p.ay;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < step) break;
            if (Math.abs(dx) > Math.abs(dy)) {
                movePlayer(dx > 0 ? 1 : 3);
                p.ax += dx > 0 ? step : -step;
                p.ay = p.y;                                // جلوگیری از انحراف مورب
            } else {
                movePlayer(dy > 0 ? 2 : 0);
                p.ay += dy > 0 ? step : -step;
                p.ax = p.x;
            }
        }
    } else if (ptrs.size === 2) {                          // پینچ: فقط زوم
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = mazeCanvas.getBoundingClientRect();
        if (pinchDist > 0) {
            zoomAt(cam.tz * d / pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            cam.z = cam.tz;
            if (cam.anchor) { cam.anchor = null; cam.cx = cam.tcx; cam.cy = cam.tcy; }
        }
        pinchDist = d;
    }
});

for (const ev of ['pointerup', 'pointercancel']) {
    mazeCanvas.addEventListener(ev, (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinchDist = 0;
        // اگر یکی از دو انگشت برداشته شد، انگشت باقی‌مانده از نقطهٔ فعلی دوباره شروع کند
        for (const q of ptrs.values()) { q.ax = q.x; q.ay = q.y; }
    });
}

mazeCanvas.addEventListener('wheel', (e) => {             // چرخ ماوس / پینچ تاچ‌پد = زوم
    e.preventDefault();
    const r = mazeCanvas.getBoundingClientRect();
    zoomAt(cam.tz * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

// ── ورودی: پد شناور دوربین ────────────────────────────────────────────
const padEl = $('pad'), knobEl = $('knob'), padWrap = $('padWrap'), padGrip = $('padGrip');
const stage = $('stage');
let padId = null;

function padPoint(e) {
    const r = padEl.getBoundingClientRect(), max = r.width / 2 - knobEl.offsetWidth / 2;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    padVec.x = dx / max; padVec.y = dy / max;
}
function padReset() {
    padVec.x = padVec.y = 0;
    knobEl.style.transform = '';
    padEl.classList.remove('dragging');
    padWrap.classList.remove('active');
    padId = null;
}
padEl.addEventListener('pointerdown', (e) => {
    padId = e.pointerId;
    padEl.setPointerCapture(e.pointerId);
    padEl.classList.add('dragging');
    padWrap.classList.add('active');                       // شفافیت ۱۰۰٪ هنگام استفاده
    padPoint(e);
});
padEl.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padPoint(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    padEl.addEventListener(ev, (e) => { if (e.pointerId === padId) padReset(); });
}

// ── جابه‌جایی پد روی قاب بازی (با دستگیره) + چسبیدن به کناره‌ها ─────────
const PAD_M = 6;                                           // فاصله از لبه (px)
let padPos = { x: 1, y: 1 };                               // کسری از فضای آزاد؛ پیش‌فرض: پایین-راست
try {
    const s = JSON.parse(localStorage.getItem('mazePadPos'));
    if (s && isFinite(s.x) && isFinite(s.y)) padPos = { x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1) };
} catch (_) {}

function padFree() {
    return {
        w: Math.max(1, stage.clientWidth  - padWrap.offsetWidth  - 2 * PAD_M),
        h: Math.max(1, stage.clientHeight - padWrap.offsetHeight - 2 * PAD_M)
    };
}
function placePad() {
    const f = padFree();
    padWrap.style.left = PAD_M + padPos.x * f.w + 'px';
    padWrap.style.top  = PAD_M + padPos.y * f.h + 'px';
}

let gripId = null, gripOffX = 0, gripOffY = 0;
padGrip.addEventListener('pointerdown', (e) => {
    gripId = e.pointerId;
    padGrip.setPointerCapture(e.pointerId);
    const r = padWrap.getBoundingClientRect();
    gripOffX = e.clientX - r.left; gripOffY = e.clientY - r.top;
    padWrap.classList.add('active');
    e.preventDefault();
});
padGrip.addEventListener('pointermove', (e) => {
    if (e.pointerId !== gripId) return;
    const s = stage.getBoundingClientRect(), f = padFree();
    padPos.x = clamp((e.clientX - s.left - gripOffX - PAD_M) / f.w, 0, 1);
    padPos.y = clamp((e.clientY - s.top  - gripOffY - PAD_M) / f.h, 0, 1);
    placePad();
});
for (const ev of ['pointerup', 'pointercancel']) {
    padGrip.addEventListener(ev, (e) => {
        if (e.pointerId !== gripId) return;
        gripId = null;
        padWrap.classList.remove('active');
        // چسبیدن به نزدیک‌ترین کناره
        const f = padFree();
        const d = [padPos.x * f.w, (1 - padPos.x) * f.w, padPos.y * f.h, (1 - padPos.y) * f.h];
        const m = d.indexOf(Math.min(...d));
        if (m === 0) padPos.x = 0; else if (m === 1) padPos.x = 1;
        else if (m === 2) padPos.y = 0; else padPos.y = 1;
        placePad();
        try { localStorage.setItem('mazePadPos', JSON.stringify(padPos)); } catch (_) {}
    });
}

// ── ورودی: مینی‌مپ ───────────────────────────────────────────────────
let miniId = null;
function miniTo(e) {
    const r = miniCanvas.getBoundingClientRect();
    cam.follow = false; cam.anchor = null;
    cam.tcx = (e.clientX - r.left - miniPad) / miniScale;
    cam.tcy = (e.clientY - r.top - miniPad) / miniScale;
    clampCam(false, true);
}
miniCanvas.addEventListener('pointerdown', (e) => { miniId = e.pointerId; miniCanvas.setPointerCapture(e.pointerId); miniTo(e); });
miniCanvas.addEventListener('pointermove', (e) => { if (e.pointerId === miniId) miniTo(e); });
for (const ev of ['pointerup', 'pointercancel']) {
    miniCanvas.addEventListener(ev, (e) => { if (e.pointerId === miniId) miniId = null; });
}

// ── اجرا ─────────────────────────────────────────────────────────────
let resizeTimer = 0;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitLayout, 100);
});

let lastT = 0;
function frame(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    update(dt);
    draw(t);
    drawMini();
    requestAnimationFrame(frame);
}

window.onload = () => {
    initGame();
    requestAnimationFrame(frame);
};
