import { useEffect, useState } from 'react';
import './home-hero-slider.css';

type Slide = {
  eyebrow: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  visual: 'maze' | 'create' | 'rooms' | 'race';
  visualSrc: string;
  index: string;
};

const SLIDES: Slide[] = [
  {
    eyebrow: 'WELCOME TO MAZE',
    title: 'Your next challenge starts here.',
    description: 'Create a maze room or jump into one that is already waiting. Find your route and make every move count.',
    primary: { label: 'Start playing', href: '/maze.html?view=create' },
    secondary: { label: 'Explore rooms', href: '/maze.html?view=rooms' },
    visual: 'maze',
    visualSrc: '/css/images/banner/banner-1.svg',
    index: '01',
  },
  {
    eyebrow: 'MAKE IT YOUR MAZE',
    title: 'Set up a challenge of your own.',
    description: 'Choose the maze difficulty, player count and goals, then create a room for your next run.',
    primary: { label: 'Create a room', href: '/maze.html?view=create' },
    secondary: { label: 'Explore rooms', href: '/maze.html?view=rooms' },
    visual: 'create',
    visualSrc: '/css/images/banner/banner-2.svg',
    index: '02',
  },
  {
    eyebrow: 'FIND YOUR ROOM',
    title: 'The next race could be one click away.',
    description: 'Browse waiting rooms, find an open seat and join the maze action. You can also explore races already in progress.',
    primary: { label: 'Browse rooms', href: '/maze.html?view=rooms' },
    secondary: { label: 'Watch live races', href: '/maze.html?view=live' },
    visual: 'rooms',
    visualSrc: '/css/images/banner/banner-3.svg',
    index: '03',
  },
  {
    eyebrow: 'READY, SET, MAZE',
    title: 'Find the route. Reach the goals.',
    description: 'Navigate a generated maze, keep your focus and race toward the goals. Your next run is ready when you are.',
    primary: { label: 'Play now', href: '/maze.html?view=create' },
    secondary: { label: 'See live races', href: '/maze.html?view=live' },
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
        <span className="home-hero-eyebrow"><i />{slide.eyebrow}</span>
        <h1>{slide.title}</h1>
        <p>{slide.description}</p>
        <div className="home-hero-actions">
          <a className="home-hero-cta home-hero-cta--primary" href={slide.primary.href}>
            {slide.primary.label}<span aria-hidden="true">↗</span>
          </a>
          <a className="home-hero-cta home-hero-cta--secondary" href={slide.secondary.href}>
            {slide.secondary.label}<span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <div
        className={`home-hero-art home-hero-art--${slide.visual}`}
        aria-hidden="true"
      >
        <img
          className="home-hero-visual"
          src={slide.visualSrc}
          alt=""
          width="464"
          height="464"
          loading={active === 0 ? 'eager' : 'lazy'}
          decoding="async"
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
              aria-label={`Go to slide ${index + 1}: ${item.eyebrow}`}
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
