import { useEffect, useState } from 'react';
import { MAZE_VIEW_URLS } from '../../features/maze/maze-routes';
import { ThemedSvgIcon } from '../media/ThemedSvgIcon';
import './home-hero-slider.css';

type Slide = {
  title: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  visual: 'maze' | 'create' | 'rooms' | 'race';
  visualSrc: string;
  index: string;
};

const SLIDES: Slide[] = [
  {
    title: 'Your next challenge starts here.',
    primary: { label: 'Start playing', href: MAZE_VIEW_URLS.create },
    secondary: { label: 'Explore rooms', href: MAZE_VIEW_URLS.rooms },
    visual: 'maze',
    visualSrc: '/css/images/banner/banner-1.svg',
    index: '01',
  },
  {
    title: 'Set up a challenge of your own.',
    primary: { label: 'Create a room', href: MAZE_VIEW_URLS.create },
    secondary: { label: 'Explore rooms', href: MAZE_VIEW_URLS.rooms },
    visual: 'create',
    visualSrc: '/css/images/banner/banner-2.svg',
    index: '02',
  },
  {
    title: 'The next race could be one click away.',
    primary: { label: 'Browse rooms', href: MAZE_VIEW_URLS.rooms },
    secondary: { label: 'Watch live races', href: MAZE_VIEW_URLS.live },
    visual: 'rooms',
    visualSrc: '/css/images/banner/banner-3.svg',
    index: '03',
  },
  {
    title: 'Find the route. Reach the goals.',
    primary: { label: 'Play now', href: MAZE_VIEW_URLS.create },
    secondary: { label: 'See live races', href: MAZE_VIEW_URLS.live },
    visual: 'race',
    visualSrc: '/css/images/banner/banner-4.svg',
    index: '04',
  },
];

export function HomeHeroSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const go = (direction: number) => {
    setActive((current) => (current + direction + SLIDES.length) % SLIDES.length);
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener('change', syncPreference);
    return () => media.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  useEffect(() => {
    const pauseWhenHidden = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const slide = SLIDES[active];

  return (
    <section
      className="home-hero-slider"
      aria-label="Discover Maze"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="home-hero-glow" aria-hidden="true" />
      <div className="home-hero-copy" key={slide.index}>
        <h1>{slide.title}</h1>
        <div className="home-hero-actions">
          <a className="home-hero-cta home-hero-cta--primary" href={slide.primary.href}>
          </a>
          <a className="home-hero-cta home-hero-cta--secondary" href={slide.secondary.href}>
          </a>
        </div>
      </div>

      <div
        className={`home-hero-art home-hero-art--${slide.visual}`}
        aria-hidden="true"
      >
        <ThemedSvgIcon
          className="home-hero-visual"
          src={slide.visualSrc}
        />

      </div>

      <div className="home-hero-footer">
        <div className="home-hero-pagination" aria-label={`Slide ${active + 1} of ${SLIDES.length}`}>
          <span className="home-hero-current">{slide.index}</span>
          <span className="home-hero-pagination-line"><i style={{ transform: `scaleX(${(active + 1) / SLIDES.length})` }} /></span>
          <span className="home-hero-total">0{SLIDES.length}</span>
        </div>
        <div className="home-hero-dots" role="group" aria-label="Choose a slide">
          {SLIDES.map((item, index) => (
            <button
              key={item.index}
              type="button"
              className={`home-hero-dot${index === active ? ' is-active' : ''}`}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <div className="home-hero-controls">
          <button type="button" aria-label="Previous slide" onClick={() => go(-1)}>←</button>
          <button type="button" aria-label="Next slide" onClick={() => go(1)}>→</button>
        </div>
      </div>
    </section>
  );
}
