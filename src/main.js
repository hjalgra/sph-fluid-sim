/**
 * SPH Fluid Simulator — entry point.
 * Sets up the canvas, engine, renderer, and UI; runs the animation loop.
 */

import { createEngineForScene, warmUp } from './scenes.js';
import { createRenderer }        from './render.js';
import { createUI }              from './ui.js';

// ---- Canvas setup ----
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

let dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---- Simulation ----
let engine = createEngineForScene('dam-break', { preset: 'med' });
warmUp(engine);

// ---- Renderer ----
const renderer = createRenderer(canvas, ctx, engine);

// Expose for debugging / external tooling
window.__renderer = renderer;
window.__engine   = engine;

// ---- Run state ----
let running   = true;
let timeScale = 1.0;

// Base substep budget per RAF frame (scaled by timeScale).
// 2 substeps keeps total physics budget under 16ms at high preset.
const BASE_SUBSTEPS = 2;
const BASE_DT       = 0.005;

function getEngine()    { return engine; }
function setEngine(eng) {
  engine = eng;
  window.__engine = eng;
}
function getRunning()       { return running; }
function setRunning(val)    { running = val; }
function getTimeScale()     { return timeScale; }
function setTimeScale(val)  { timeScale = val; }

// ---- Theme → canvas background ----
function setCanvasTheme(theme) {
  if (theme === 'light') {
    renderer.setBackground('#dce6f0', 'rgba(0,0,0,0.25)');
  } else {
    renderer.setBackground('#0a0a14', 'rgba(255,255,255,0.4)');
  }
}

// ---- UI ----
const { state, updateStats } = createUI({
  canvas,
  renderer,
  getEngine,
  setEngine,
  getRunning,
  setRunning,
  stepOnce,
  getTimeScale,
  setTimeScale,
  setCanvasTheme,
  baseSubsteps: BASE_SUBSTEPS,
});

// ---- FPS tracking ----
let _lastTime    = performance.now();
let _fpsSmoothed = 60;

function _updateFps(now) {
  const dt = now - _lastTime;
  _lastTime = now;
  // Exponential moving average (τ ≈ 10 frames)
  _fpsSmoothed = 0.9 * _fpsSmoothed + 0.1 * (1000 / (dt || 1));
}

// ---- Single-frame advance (for Step button) ----
function stepOnce() {
  const substeps = Math.max(1, Math.round(BASE_SUBSTEPS * timeScale));
  for (let s = 0; s < substeps; s++) {
    engine.step(BASE_DT);
  }
  renderer.draw(state.mode, state.colorBy);
}

// ---- Animation loop ----
function tick(now) {
  _updateFps(now);

  if (running) {
    const substeps = Math.max(1, Math.round(BASE_SUBSTEPS * timeScale));
    for (let s = 0; s < substeps; s++) {
      engine.step(BASE_DT);
    }
  }

  renderer.draw(state.mode, state.colorBy);
  updateStats(_fpsSmoothed, engine._nFluid);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
