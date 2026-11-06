class NumberTicker {
    constructor() {
        this.activeAnimations = new Map();
        this.currentValues = new Map();
    }
    easeOutExpo(x) {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    }
    animate(elementOrId, targetValue, options = {}) {
        const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (!el || typeof targetValue !== 'number' || isNaN(targetValue)) return;
        const {
            duration = 1000,
            decimals = 8,
            prefix = '',
            suffix = '',
            enableFlash = true,
            formatter = null
        } = options;
        const elementKey = el.id || el;
        let startValue = this.currentValues.get(elementKey);
        if (startValue === undefined) {
            const parsed = parseFloat(el.innerText.replace(/[^0-9.-]+/g, ""));
            startValue = isNaN(parsed) ? 0 : parsed;
        }
        if (startValue === targetValue) {
            return;
        }
        if (this.activeAnimations.has(elementKey)) {
            cancelAnimationFrame(this.activeAnimations.get(elementKey));
        }
        if (enableFlash) {
            el.classList.remove('flash-green', 'flash-red');
            const isGain = targetValue > startValue;
            const flashClass = isGain ? 'flash-green' : 'flash-red';
            el.classList.add(flashClass);
            setTimeout(() => el.classList.remove(flashClass), 600);
        }
        const startTime = performance.now();
        const updateFrame = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            const easedProgress = this.easeOutExpo(progress);
            const currentValue = startValue + (targetValue - startValue) * easedProgress;
            if (typeof formatter === 'function') {
                el.innerText = formatter(currentValue);
            } else {
                el.innerText = `${prefix}${currentValue.toFixed(decimals)}${suffix}`;
            }
            if (progress < 1) {
                const animId = requestAnimationFrame(updateFrame);
                this.activeAnimations.set(elementKey, animId);
            } else {
                if (typeof formatter === 'function') {
                    el.innerText = formatter(targetValue);
                } else {
                    el.innerText = `${prefix}${targetValue.toFixed(decimals)}${suffix}`;
                }
                this.currentValues.set(elementKey, targetValue);
                this.activeAnimations.delete(elementKey);
            }
        };
        const initialAnimId = requestAnimationFrame(updateFrame);
        this.activeAnimations.set(elementKey, initialAnimId);
    }
}
window.ticker = new NumberTicker();