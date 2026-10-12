// Fixed-timestep driver. The sim advances in whole ticks (days) at BASE_TPS ×
// speed, independent of frame rate; rendering happens at most once per animation frame.

/** Days a second at 1×: a 360-day year takes 3 seconds. */
export const BASE_TPS = 120;
export const SPEEDS = [
  { label: '1×', mult: 1 },
  { label: '3×', mult: 3 },
  { label: '10×', mult: 10 },
  { label: '30×', mult: 30 },
  { label: 'Max', mult: Infinity },
];
/** Days one press of Step advances: a month. */
export const STEP_DAYS = 30;
const MAX_FRAME_MS = 250; // ignore long gaps (tab in background)
const TICK_BUDGET_MS = 9; // never spend more than this per frame on the sim

export class Loop {
  constructor({ tick, frame }) {
    this.tickFn = tick;
    this.frameFn = frame;
    this.speedIndex = 0;
    this.paused = false;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.pendingSteps = 0;
    this.measuredTps = 0;
    this.onFrame = this.onFrame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.onFrame);
  }

  stop() { this.running = false; }

  setSpeed(i) {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.acc = 0;
  }

  setPaused(p) {
    this.paused = p;
    this.acc = 0;
  }

  /** Advance exactly n ticks (days) on the next frame (works while paused). */
  step(n = 1) { this.pendingSteps += n; }

  onFrame(now) {
    if (!this.running) return;
    const dt = Math.min(MAX_FRAME_MS, now - this.last);
    this.last = now;
    const t0 = performance.now();
    let ran = 0;

    if (this.pendingSteps > 0) {
      ran += this.tickFn(this.pendingSteps);
      this.pendingSteps = 0;
    }

    if (!this.paused) {
      const speed = SPEEDS[this.speedIndex].mult;
      if (speed === Infinity) {
        // Max: as many ticks as fit in the budget, in small batches.
        while (performance.now() - t0 < TICK_BUDGET_MS) {
          const n = this.tickFn(1);
          if (n === 0) break;
          ran += n;
        }
      } else {
        this.acc += (dt / 1000) * BASE_TPS * speed;
        let want = Math.floor(this.acc);
        this.acc -= want;
        while (want > 0 && performance.now() - t0 < TICK_BUDGET_MS) {
          const n = this.tickFn(1);
          if (n === 0) break;
          ran += n;
          want--;
        }
        if (want > 0) this.acc = 0; // device too slow for this speed: drop, don't spiral
      }
    }

    if (dt > 0) this.measuredTps = this.measuredTps * 0.9 + (ran * 1000 / dt) * 0.1;
    this.frameFn(ran, now);
    requestAnimationFrame(this.onFrame);
  }
}
