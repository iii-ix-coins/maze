import { mountBanner } from './Banner.js';

const bannerTarget =
    document.getElementById(
        'site-banner'
    );

if (bannerTarget) {
    mountBanner(
        bannerTarget
    );
}