import { useEffect, useMemo, useState } from 'react';

type UserAvatarProps = {
  seed: string;
  imageUrl?: string | null;
  size?: 'small' | 'large';
  label?: string;
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getIdenticonCells(seed: string): Array<{ x: number; y: number }> {
  let value = hashSeed(seed || 'maze-user');
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      value = (Math.imul(value ^ (value >>> 15), 2246822519) + 3266489917) >>> 0;
      if ((value & 3) !== 0) {
        cells.push({ x, y }, ...(x < 2 ? [{ x: 4 - x, y }] : []));
      }
    }
  }
  return cells;
}

export function UserAvatar({ seed, imageUrl, size = 'small', label = 'User avatar' }: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const cells = useMemo(() => getIdenticonCells(seed), [seed]);

  useEffect(() => setImageFailed(false), [imageUrl]);

  return (
    <span className={`user-avatar user-avatar--${size}`} role="img" aria-label={label}>
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <svg viewBox="0 0 5 5" aria-hidden="true" focusable="false">
          {cells.map(({ x, y }) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" rx="0.08" />)}
        </svg>
      )}
    </span>
  );
}
