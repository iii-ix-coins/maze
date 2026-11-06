'use strict';

/*
 * HowItWorks — three-step explainer (mounts into #site-how-it-works).
 * Copy is taken from the site's own slider / brand text:
 *   "Hold tokens in your wallet to automatically earn rewards every epoch."
 *   "No staking or locking required. Complete decentralization and safety."
 */
(function mountHowItWorks() {
    const target = document.getElementById('site-how-it-works');

    if (!target) {
        return;
    }

    target.className = 'site-how-it-works-host';

    target.innerHTML = `
        <section class="how" aria-labelledby="how-title">

            <header class="how-head">
                <span class="eyebrow">How it works</span>
                <h2 id="how-title" class="how-title">Hold. That's the whole strategy.</h2>
            </header>

            <ol class="how-steps">

                <li class="how-step spot">
                    <span class="how-step-no" aria-hidden="true">01</span>
                    <span class="how-step-glyph" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="6" width="18" height="13" rx="3.5"/>
                            <path d="M3 10h18"/>
                            <circle cx="16.5" cy="14.5" r="1.3" fill="currentColor"/>
                        </svg>
                    </span>
                    <h3>Hold</h3>
                    <p>Own the coin and keep it in your wallet. There is nothing to deposit.</p>
                </li>

                <li class="how-step spot">
                    <span class="how-step-no" aria-hidden="true">02</span>
                    <span class="how-step-glyph" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6z"/>
                            <path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>
                        </svg>
                    </span>
                    <h3>Stay put</h3>
                    <p>No staking, no locking. Complete decentralization and safety.</p>
                </li>

                <li class="how-step spot">
                    <span class="how-step-no" aria-hidden="true">03</span>
                    <span class="how-step-glyph" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3.2l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>
                        </svg>
                    </span>
                    <h3>Earn</h3>
                    <p>Rewards arrive automatically, every epoch.</p>
                </li>

            </ol>

        </section>
    `;
})();
