import type { CSSProperties } from 'react';

export type ThemedSvgTone = 'primary' | 'secondary' | 'accent' | 'on-accent' | 'tile';

type ThemedSvgIconProps = {
  src: string;
  className?: string;
  tone?: ThemedSvgTone;
  label?: string;
};

/**
 * Render a same-origin SVG as a CSS alpha mask.
 * The SVG supplies geometry only; the active site theme supplies its colour.
 * Keep this component for monochrome interface symbols and monochrome brand marks.
 */
export function ThemedSvgIcon({
  src,
  className = '',
  tone = 'primary',
  label,
}: ThemedSvgIconProps) {
  const style = {
    '--themed-svg-source': `url("${src}")`,
  } as CSSProperties;

  return (
    <span
      className={`themed-svg-icon${className ? ` ${className}` : ''}`}
      data-tone={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    />
  );
}
