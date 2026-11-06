'use strict';

/*
 * rainbow-border.js  —  رنگین‌کمان برای «کادرها» و «تمام متن‌ها»
 * ---------------------------------------------------------------------------
 * به هر کادر و هر متن یک هویت رنگی یکتا می‌دهد. CSS در css/rainbow-border.css
 * متغیرها را به گرادیان تبدیل می‌کند.
 *
 *  • hue پایه از دنباله‌ی زاویه‌ی طلایی (137.508°) می‌آید و بین کادرها و متن‌ها
 *    مشترک است؛ پس هر المنت تازه دورترین رنگ ممکن را از بقیه می‌گیرد.
 *  • فاصله‌ی رنگ‌ها، زاویه‌ی شروع، سرعت و جهت هم تصادفی‌اند.
 *  • مقدار هر «جایگاه» (مسیر المنت در DOM) ذخیره می‌شود؛ اگر کامپوننتی دوباره
 *    ساخته شد همان رنگ را می‌گیرد.
 *  • متن‌های تازه (ticker، کامپوننت‌های لود‌شده بعد) با MutationObserver گرفته می‌شوند.
 *
 * کنترل‌ها (روی هر المنت یا والدش):
 *    data-rbt-skip            این متن و زیرمجموعه‌اش رنگین‌کمان نشود
 *    data-rb                  این المنت کادر رنگین‌کمان بگیرد
 *    <html data-rb-motion="off">   همه‌ی چرخش‌ها خاموش (رنگ‌ها ثابت می‌مانند)
 */
(() => {
    const GOLDEN_ANGLE = 137.508;

    const CONFIG = {
        border: {
            selector: [
                '[data-rb]',
                '.header .bar-box',
                '.header .change-box',
                '.header .mint-box',
                '.header .mint-copy-btn',
                '.header .btn-link',
                '.header .nav-wallet-button',
                '.header .nav-link-primary',
                '.theme-toggle',
                '.game-view-toggle',
            ].join(','),
            speed: { min: 3.3, max: 6.3 },     // ثانیه برای یک دور کامل
            span: { min: 24, max: 27 },      // درجه‌ی hue بین رنگ‌های متوالی
            speedGap: 0.2                    // حداقل اختلاف سرعت دو کادر هم‌جهت
        },
        text: {
            speed: { min: 3.9, max: 6.9 },     // متن آهسته‌تر از کادر
            span: { min: 24, max: 27 },
            speedGap: 0.2,
            skipTags: new Set([
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT',
                'SELECT', 'OPTION', 'SVG', 'CANVAS', 'TITLE', 'HEAD', 'IFRAME'
            ]),
            skipSelector: '[data-rbt-skip]',
            // متنی که line-height کوچک‌تر از این ضریبِ font-size دارد داخل <span> می‌رود
            // تا پس‌زمینه‌ی گرادیان سر و ته حروف را نبُرد
            minLineHeightRatio: 1.15
        }
    };

    const seed = Math.random() * 360;
    const slots = new Map();                     // کلید جایگاه → پارامترها
    const usedSpeeds = { border: [], text: [] };
    let counter = 0;

    const rand = (min, max) => min + Math.random() * (max - min);

    /* ——— پارامترهای تصادفی ولی یکتا ——————————————————————————————— */

    function createParams(kind) {
        const cfg = CONFIG[kind];
        const dir = Math.random() < 0.5 ? 'normal' : 'reverse';
        const used = usedSpeeds[kind];

        let speed = rand(cfg.speed.min, cfg.speed.max);
        for (let i = 0; i < 12; i++) {
            if (!used.some(u => u.dir === dir && Math.abs(u.speed - speed) < cfg.speedGap)) {
                break;
            }
            speed = rand(cfg.speed.min, cfg.speed.max);
        }
        used.push({ speed, dir });

        return {
            hue: (seed + counter++ * GOLDEN_ANGLE) % 360,
            span: rand(cfg.span.min, cfg.span.max),
            offset: rand(0, 360),
            speed,
            dir
        };
    }

    function paramsFor(kind, key) {
        const id = `${kind}:${key}`;
        let params = slots.get(id);
        if (!params) {
            params = createParams(kind);
            slots.set(id, params);
        }
        return params;
    }

    // مسیر کوتاه المنت در DOM (تا ۵ سطح) — پایدار در برابر mount دوباره
    function pathKey(el, depth = 5) {
        const parts = [];
        let node = el;
        for (let i = 0; i < depth && node && node !== document.body; i++) {
            const cls = Array.from(node.classList).filter(c => !c.startsWith('is-')).sort().join('.');
            const idx = node.parentElement ? Array.prototype.indexOf.call(node.parentElement.children, node) : 0;
            parts.push(`${node.tagName.toLowerCase()}${cls ? '.' + cls : ''}[${idx}]`);
            node = node.parentElement;
        }
        return parts.join('<');
    }

    /* ——— کادرها ————————————————————————————————————————————————————— */

    function markBorder(el) {
        if (el.dataset.rbReady) {
            return;
        }
        const params = paramsFor('border', pathKey(el));

        el.setAttribute('data-rb', '');
        el.style.setProperty('--rb-h', params.hue.toFixed(1));
        el.style.setProperty('--rb-span', params.span.toFixed(1));
        el.style.setProperty('--rb-offset', `${params.offset.toFixed(1)}deg`);
        el.style.setProperty('--rb-speed', `${params.speed.toFixed(2)}s`);
        el.style.setProperty('--rb-dir', params.dir);
        el.dataset.rbReady = '1';
    }

    function scanBorders(root) {
        if (root.nodeType !== 1) {
            return;
        }
        if (root.matches(CONFIG.border.selector)) {
            markBorder(root);
        }
        root.querySelectorAll(CONFIG.border.selector).forEach(markBorder);
    }

    /* ——— حرکت (Web Animations API) ———————————————————————————————————— */

    const canAnimateProperty = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Map();                // المنت → { anim, visible }

    const motionOff = () => document.documentElement.dataset.rbMotion === 'off';

    function syncMotion(entry) {
        entry.anim.playbackRate = reduceMotion.matches ? 0.4 : 1;   // کاهش حرکت: ۲٫۵ برابر کندتر
        if (motionOff() || !entry.visible) {
            entry.anim.pause();
        } else {
            entry.anim.play();
        }
    }

    const visibility = 'IntersectionObserver' in window
        ? new IntersectionObserver(records => {
            for (const record of records) {
                const entry = animations.get(record.target);
                if (entry) {
                    entry.visible = record.isIntersecting;
                    syncMotion(entry);
                }
            }
        })
        : null;

    function animateText(el, params) {
        if (!canAnimateProperty || typeof el.animate !== 'function' || animations.has(el)) {
            return;
        }
        const anim = el.animate(
            { '--rbt-angle': ['0deg', '360deg'] },
            { duration: params.speed * 1000, iterations: Infinity, easing: 'linear', direction: params.dir }
        );
        const entry = { anim, visible: true };
        animations.set(el, entry);
        syncMotion(entry);
        visibility?.observe(el);
    }

    function syncAllMotion() {
        animations.forEach((entry, el) => {
            if (!el.isConnected) {
                entry.anim.cancel();
                animations.delete(el);
                visibility?.unobserve(el);
                return;
            }
            syncMotion(entry);
        });
    }

    reduceMotion.addEventListener?.('change', syncAllMotion);
    new MutationObserver(syncAllMotion).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-rb-motion']
    });

    /* ——— رنگ متن روی زمینه‌ی خودِ المنت ————————————————————————————— */

    function parseColor(value) {
        let m = value.match(/^rgba?\(([^)]+)\)/);
        if (m) {
            const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        m = value.match(/^color\(srgb ([^)]+)\)/);
        if (m) {
            const p = m[1].split(/[ /]+/).filter(Boolean).map(parseFloat);
            return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
        }
        return null;
    }

    // نزدیک‌ترین زمینه‌ی «تقریباً کدر» (تا ۷ سطح بالاتر، بدون body) را پیدا می‌کند.
    // روشن → متن تیره ('dark')، تیره → متن روشن ('light')، پیدا نشد → رنگ پیش‌فرضِ تم.
    function detectInk(el) {
        let node = el;
        for (let i = 0; i < 7 && node && node !== document.body && node !== document.documentElement; i++) {
            const bg = parseColor(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0.5) {
                const lum = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
                return lum > 0.55 ? 'dark' : 'light';
            }
            node = node.parentElement;
        }
        return '';
    }

    function applyInk(el) {
        const ink = detectInk(el);
        if (ink) {
            el.setAttribute('data-rbt-ink', ink);
        } else {
            el.removeAttribute('data-rbt-ink');
        }
    }

    // زمینه‌ها با تغییر تم transition دارند؛ بعد از پایان آن دوباره می‌سنجیم
    window.addEventListener('site:themechange', () => {
        setTimeout(() => document.querySelectorAll('[data-rbt]').forEach(applyInk), 480);
    });

    /* ——— متن‌ها ———————————————————————————————————————————————————— */

    function markText(el, key) {
        if (el.dataset.rbtReady) {
            return;
        }
        const params = paramsFor('text', key);

        el.setAttribute('data-rbt', '');
        el.style.setProperty('--rbt-h', params.hue.toFixed(1));
        el.style.setProperty('--rbt-span', params.span.toFixed(1));
        el.style.setProperty('--rbt-offset', `${params.offset.toFixed(1)}deg`);
        el.dataset.rbtReady = '1';

        applyInk(el);
        animateText(el, params);
    }

    // آیا باید متنِ این والد در <span> پیچیده شود؟
    //  ۱) والد پس‌زمینه‌ی تصویری/گرادیانی دارد (background-clip آن را می‌برد)
    //  ۲) line-height کوچک است و بلوک، سر و ته حروف را می‌بُرد
    function needsWrapper(parent, cs) {
        if (cs.backgroundImage !== 'none' && parent.dataset.empty !== 'true') {
            return true;
        }
        const fontSize = parseFloat(cs.fontSize);
        const lineHeight = parseFloat(cs.lineHeight);          // 'normal' → NaN
        return Number.isFinite(lineHeight) && lineHeight < fontSize * CONFIG.text.minLineHeightRatio;
    }

    function wrapTextNode(parent, textNode, index) {
        const span = document.createElement('rb-t');
        parent.replaceChild(span, textNode);
        span.appendChild(textNode);
        markText(span, `${pathKey(parent)}>t${index}`);
    }

    function scanText(root) {
        const cfg = CONFIG.text;
        const byParent = new Map();

        const collect = node => {
            if (node.nodeType === 3 && node.nodeValue.trim() && node.parentElement) {
                const list = byParent.get(node.parentElement) || [];
                list.push(node);
                byParent.set(node.parentElement, list);
            }
        };

        if (root.nodeType === 3) {
            collect(root);
        } else if (root.nodeType === 1) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                collect(walker.currentNode);
            }
        }

        byParent.forEach((nodes, parent) => {
            if (
                parent.dataset.rbtReady ||
                cfg.skipTags.has(parent.tagName.toUpperCase()) ||
                parent.closest(cfg.skipSelector) ||
                parent.closest('svg')
            ) {
                return;
            }

            const cs = getComputedStyle(parent);
            if (cs.display === 'contents' || cs.display === 'none') {
                return;
            }

            if (needsWrapper(parent, cs)) {
                nodes.forEach((node, i) => wrapTextNode(parent, node, i));
            } else {
                markText(parent, pathKey(parent));
            }
        });
    }

    /* ——— اجرا و رصد DOM ————————————————————————————————————————————— */

    function scan(root) {
        scanBorders(root);
        scanText(root);
    }

    const pending = new Set();
    let frame = 0;

    function flush() {
        frame = 0;
        const batch = Array.from(pending);
        pending.clear();
        for (const node of batch) {
            if (node.isConnected) {
                scan(node);
            }
        }
        syncAllMotion();
    }

    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'characterData') {
                pending.add(record.target);
            } else {
                record.addedNodes.forEach(node => pending.add(node));
            }
        }
        if (!frame && pending.size) {
            frame = requestAnimationFrame(flush);
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    scan(document.body);
})();