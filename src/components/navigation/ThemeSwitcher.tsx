import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useSiteTheme } from '../../hooks/useSiteTheme';
import { applySiteTheme, SITE_THEMES, type SiteTheme } from '../../features/theme/theme';

const THEME_LABELS: Record<SiteTheme, string> = {
  grass: 'Grass',
  dark: 'Dark',
  light: 'Light',
};

const THEME_ICONS: Record<SiteTheme, string> = {
  grass: '/css/images/theme-grass.svg',
  dark: '/css/images/theme-dark.svg',
  light: '/css/images/theme-light.svg',
};

export function ThemeSwitcher() {
  const theme = useSiteTheme();
  const rootRef = useRef<HTMLDivElement>(null);

  const selectTheme = (nextTheme: SiteTheme, focus = false) => {
    applySiteTheme(nextTheme);
    if (focus) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-select-theme="${nextTheme}"]`)
        ?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = SITE_THEMES.indexOf(theme);
    let next: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % SITE_THEMES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + SITE_THEMES.length) % SITE_THEMES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SITE_THEMES.length - 1;

    if (next === null) return;
    event.preventDefault();
    selectTheme(SITE_THEMES[next], true);
  };

  return (
    <div
      ref={rootRef}
      className="theme-toggle"
      role="radiogroup"
      aria-label="Background theme"
      data-theme={theme}
      style={{ '--theme-index': SITE_THEMES.indexOf(theme) } as CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <span className="theme-toggle__thumb" aria-hidden="true" />
      {SITE_THEMES.map((item) => {
        const active = item === theme;
        return (
          <button
            key={item}
            className={`theme-toggle__option${active ? ' is-active' : ''}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${THEME_LABELS[item]} theme`}
            title={THEME_LABELS[item]}
            data-select-theme={item}
            tabIndex={active ? 0 : -1}
            onClick={() => selectTheme(item)}
          >
            <img className="theme-toggle__icon" src={THEME_ICONS[item]} alt="" aria-hidden="true" draggable="false" />
          </button>
        );
      })}
    </div>
  );
}
