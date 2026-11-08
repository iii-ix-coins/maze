/**
 * Every image the "Create your game" flow draws is declared here, and nowhere else.
 * Nothing in index.html or the CSS names a file: markup only says *which* icon it wants (`data-icon="size"`),
 * and the React wizard asks this module where that icon lives.
 *
 *   file  the .svg inside maze-styles/images
 *   tint  true  → the SVG is used as a stencil and takes the current text colour (so one file works in the
 *                 locked, active and done states);
 *         false → the SVG is painted exactly as drawn (the check mark keeps its own green)
 *   fit   optical size correction: the artwork is not equally wide or tall in every file
 *
 * The React Create Game wizard reads this table to render the step rail. To swap or add an icon,
 * add the .svg to public/maze-assets/assets/images and edit this table. Pure data, no DOM,
 * so tests can verify every declared asset exists.
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
