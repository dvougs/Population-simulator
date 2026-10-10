// Play/pause, single step and speed selector.

import { h } from './dom.js';
import { SPEEDS } from '../loop.js';

export function initControls({ playBtn, stepBtn, speedEl, loop, onChange }) {
  const buttons = SPEEDS.map((s, i) => h('button', {
    type: 'button', role: 'radio', 'data-speed': i,
    onclick: () => { loop.setSpeed(i); if (loop.paused) setPaused(false); sync(); },
  }, s.label));
  speedEl.replaceChildren(...buttons);

  function sync() {
    buttons.forEach((b, i) => b.setAttribute('aria-checked', String(i === loop.speedIndex)));
    playBtn.innerHTML = loop.paused ? '&#9654;' : '&#10074;&#10074;';
    playBtn.setAttribute('aria-label', loop.paused ? 'Play' : 'Pause');
    onChange?.();
  }

  function setPaused(p) {
    loop.setPaused(p);
    sync();
  }

  playBtn.addEventListener('click', () => setPaused(!loop.paused));
  stepBtn.addEventListener('click', () => { if (!loop.paused) setPaused(true); loop.step(); });

  // Keyboard shortcuts for desktop testing.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (document.getElementById('game').hidden) return;
    if (e.key === ' ') { e.preventDefault(); setPaused(!loop.paused); }
    else if (e.key === '.') { if (!loop.paused) setPaused(true); loop.step(); }
    else if (/^[1-5]$/.test(e.key)) { loop.setSpeed(Number(e.key) - 1); sync(); }
  });

  sync();
  return { sync, setPaused };
}
