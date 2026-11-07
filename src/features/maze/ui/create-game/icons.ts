/**
 * Every image the "Create your game" flow draws is declared here, and nowhere else.
 * Nothing in index.html or the CSS names a file: markup only says *which* icon it wants (`data-icon="size"`),
 * and `step-rail.js` asks this module where that icon lives.
 *
 *   file  the .svg inside maze-styles/images
 *   tint  true  → the SVG is used as a stencil and takes the current text colour (so one file works in the
 *                 locked, active and done states);
 *         false → the SVG is painted exactly as drawn (the check mark keeps its own green)
 *   fit   optical size correction: the artwork is not equally wide or tall in every file
 *
 * To swap or add an icon: drop the .svg in maze-styles/images and edit this table. Pure data, no DOM,
 * so it can be unit-tested (tests/step-icons.test.js checks that every file here really exists).
 */
export const IMAGE_DIR = '/maze-assets/assets/images/';

export const STEP_ICONS = Object.freeze({
    size: Object.freeze({ file: 'size.svg', tint: true, fit: 1 }),
    racers: Object.freeze({ file: 'racers.svg', tint: true, fit: 1.08 }),
    targets: Object.freeze({ file: 'targets.svg', tint: true, fit: 1.04 }),
    launch: Object.freeze({ file: 'launch.svg', tint: true, fit: 1.3 }),
    check: Object.freeze({ file: 'check.svg', tint: false, fit: 1 })
});

/** Absolute URL of an icon. Resolved against this module, so it works wherever the site is hosted. */
export function iconUrl(name, base = import.meta.url) {
    const icon = STEP_ICONS[name];
    if (!icon) throw new Error(`Unknown icon "${name}". Known icons: ${Object.keys(STEP_ICONS).join(', ')}`);
    return new URL(IMAGE_DIR + icon.file, base).href;
}
