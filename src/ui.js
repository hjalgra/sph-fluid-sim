/**
 * UI module — custom dark-glass control panel and canvas interaction.
 *
 * Exports:
 *   createUI(opts) — builds the panel and wires canvas pointer events.
 *
 * Hard cap on spawnable particles:
 *   MAX_PARTICLES = 5000
 */

import { createEngineForScene, warmUp } from './scenes.js';
import { buildLUT, lutToGradient } from './colormap.js';

export const MAX_PARTICLES = 5000;

/**
 * Build the custom HTML panel and wire all controls.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement}  opts.canvas
 * @param {object}             opts.renderer
 * @param {function}           opts.getEngine
 * @param {function}           opts.setEngine
 * @param {function}           opts.getRunning
 * @param {function}           opts.setRunning
 * @param {function}           opts.stepOnce
 * @param {function}           opts.getTimeScale
 * @param {function}           opts.setTimeScale
 * @param {function}           [opts.setCanvasTheme]  — (theme) => void; lets renderer adopt bg color
 * @param {number}             [opts.baseSubsteps]    — substeps per frame at 1× time-scale
 * @returns {{ state, updateStats }}
 *
 * updateStats(fps, nFluid) — pass fluid count only (excludes boundary particles)
 */
export function createUI(opts) {
  const {
    canvas, renderer,
    getEngine, setEngine,
    getRunning, setRunning,
    stepOnce,
    getTimeScale, setTimeScale,
    setCanvasTheme,
    baseSubsteps = 2,
  } = opts;

  // ---- Shared state the RAF loop reads ----
  const state = {
    mode:    'particle',  // 'particle' | 'continuum'
    colorBy: 'speed',     // 'speed' | 'pressure'
  };

  // ---- Physics / scene state ----
  const phys  = { gravMag: 9.81, gravDir: 270, viscosity: 0.1 };
  const scene = { name: 'dam-break', preset: 'low' };

  // ── Helpers ─────────────────────────────────────────────────────────────

  function applyGravity() {
    const rad = phys.gravDir * Math.PI / 180;
    getEngine().setGravity(phys.gravMag * Math.cos(rad), phys.gravMag * Math.sin(rad));
  }

  function applyViscosity() {
    getEngine().setViscosity(phys.viscosity);
  }

  function reloadScene() {
    const eng = createEngineForScene(scene.name, { preset: scene.preset });
    warmUp(eng);
    setEngine(eng);
    renderer.setEngine(eng);
    applyGravity();
    getEngine().setViscosity(phys.viscosity);
  }

  // Paint a slider's track-fill up to its current value (themed accent).
  function paintSlider(el) {
    const min = parseFloat(el.min), max = parseFloat(el.max);
    const t = (parseFloat(el.value) - min) / (max - min || 1) * 100;
    el.style.background =
      `linear-gradient(to right, var(--accent) 0%, var(--accent) ${t}%, var(--track) ${t}%, var(--track) 100%)`;
  }

  // ── Build DOM ────────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.id = 'sph-panel';

  panel.innerHTML = `
    <div class="sph-header">
      <div class="sph-header-dot"></div>
      <a class="sph-title" href="https://hjalgra.github.io/sph-fluid-sim/" target="_blank" rel="noopener">hjalgra.github.io/sph-fluid-sim</a>
      <button class="sph-btn-minimize" id="btn-minimize" aria-label="Minimize panel">−</button>
    </div>

    <div class="sph-stats">
      <div class="sph-stat">
        <span class="sph-stat-label">FPS</span>
        <span class="sph-stat-value" id="stat-fps">—</span>
      </div>
      <div class="sph-stat">
        <span class="sph-stat-label">Particles</span>
        <span class="sph-stat-value" id="stat-n">—</span>
      </div>
    </div>

    <div class="sph-section">
      <div class="sph-section-title">Render</div>
      <div class="sph-row">
        <span class="sph-label">Mode</span>
        <div class="sph-toggle-group" id="tg-mode">
          <button class="sph-btn-toggle active" data-val="particle">Particle</button>
          <button class="sph-btn-toggle" data-val="continuum">Continuum</button>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Color by</span>
        <div class="sph-toggle-group" id="tg-colorby">
          <button class="sph-btn-toggle active" data-val="speed">Speed</button>
          <button class="sph-btn-toggle" data-val="pressure">Pressure</button>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Appearance</span>
        <div class="sph-toggle-group" id="tg-theme">
          <button class="sph-btn-toggle" data-val="dark">Dark</button>
          <button class="sph-btn-toggle active" data-val="light">Light</button>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Walls</span>
        <div class="sph-toggle-group" id="tg-walls">
          <button class="sph-btn-toggle active" data-val="hide">Hide</button>
          <button class="sph-btn-toggle" data-val="show">Show</button>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Colormap</span>
        <div class="sph-cmap-group" id="cmap-group">
          <button class="sph-cmap-btn"        data-cmap="viridis"  aria-label="Viridis"></button>
          <button class="sph-cmap-btn"        data-cmap="inferno"  aria-label="Inferno"></button>
          <button class="sph-cmap-btn active" data-cmap="turbo"    aria-label="Turbo"></button>
          <button class="sph-cmap-btn"        data-cmap="coolwarm" aria-label="Coolwarm"></button>
        </div>
      </div>
    </div>

    <div class="sph-section">
      <div class="sph-section-title">Physics</div>
      <div class="sph-row">
        <span class="sph-label">Gravity (m/s²)</span>
        <div class="sph-slider-wrap">
          <input id="sl-gravmag" class="sph-slider" type="range" min="0" max="100" step="0.1" value="9.81">
          <span class="sph-val" id="val-gravmag">9.81</span>
        </div>
      </div>
      <div class="sph-compass-row">
        <svg class="sph-compass" id="compass" viewBox="0 0 64 64">
          <circle class="sph-compass-ring" cx="32" cy="32" r="29"></circle>
          <line class="sph-compass-tick" x1="32" y1="4"  x2="32" y2="9"></line>
          <line class="sph-compass-tick" x1="32" y1="55" x2="32" y2="60"></line>
          <line class="sph-compass-tick" x1="4"  y1="32" x2="9"  y2="32"></line>
          <line class="sph-compass-tick" x1="55" y1="32" x2="60" y2="32"></line>
          <line class="sph-compass-needle" id="compass-needle" x1="32" y1="32" x2="32" y2="58"></line>
          <circle class="sph-compass-hub" cx="32" cy="32" r="3.5"></circle>
        </svg>
        <div class="sph-compass-info">
          <span class="sph-label">Direction</span>
          <span class="sph-compass-angle" id="val-gravdir">270°</span>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Viscosity α</span>
        <div class="sph-slider-wrap">
          <input id="sl-visc" class="sph-slider" type="range" min="0" max="1" step="0.01" value="0.1">
          <span class="sph-val" id="val-visc">0.10</span>
        </div>
      </div>
    </div>

    <div class="sph-section">
      <div class="sph-section-title">Scene</div>
      <div class="sph-row">
        <span class="sph-label">Scene</span>
        <div class="sph-dropdown" id="dd-scene">
          <button class="sph-dropdown-btn" type="button">Dam Break</button>
          <div class="sph-dropdown-list">
            <div class="sph-dropdown-opt selected" data-val="dam-break">Dam Break</div>
            <div class="sph-dropdown-opt" data-val="droplet-drop">Droplet Drop</div>
            <div class="sph-dropdown-opt" data-val="two-column">Two Column</div>
          </div>
        </div>
      </div>
      <div class="sph-row">
        <span class="sph-label">Particles</span>
        <div class="sph-toggle-group" id="tg-preset">
          <button class="sph-btn-toggle active" data-val="low">Low</button>
          <button class="sph-btn-toggle" data-val="med">Med</button>
          <button class="sph-btn-toggle" data-val="high">High</button>
        </div>
      </div>
    </div>

    <div class="sph-section">
      <div class="sph-section-title">Simulation</div>
      <div class="sph-playback-row">
        <button class="sph-btn active" id="btn-play">Play</button>
        <button class="sph-btn" id="btn-pause">Pause</button>
        <button class="sph-btn" id="btn-step">Step</button>
      </div>
      <div class="sph-row">
        <span class="sph-label">Time scale</span>
        <div class="sph-slider-wrap">
          <input id="sl-timescale" class="sph-slider" type="range" min="0.1" max="8" step="0.05" value="4">
          <span class="sph-val" id="val-timescale">4.0×</span>
        </div>
      </div>
      <button class="sph-btn-reset" id="btn-reset">↺ Reset Scene</button>
    </div>
  `;

  document.body.appendChild(panel);

  // ── Toggle-group helper ──────────────────────────────────────────────────
  function wireToggle(groupId, onChange) {
    const group = panel.querySelector('#' + groupId);
    group.addEventListener('click', e => {
      const btn = e.target.closest('.sph-btn-toggle');
      if (!btn) return;
      group.querySelectorAll('.sph-btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.val);
    });
  }

  // ── Render toggles ──
  wireToggle('tg-mode',    val => { state.mode = val; });
  wireToggle('tg-colorby', val => { state.colorBy = val; });

  // ── Theme toggle ──
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (setCanvasTheme) setCanvasTheme(theme);
  }
  wireToggle('tg-theme', applyTheme);
  applyTheme('light'); // default

  // ── Walls toggle (show/hide boundary particles) ──
  wireToggle('tg-walls', val => {
    renderer.setShowWalls(val === 'show');
  });

  // ── Colormap buttons (gradient-filled, no text) ──
  const cmapBtns = panel.querySelectorAll('.sph-cmap-btn');
  cmapBtns.forEach(btn => {
    // Fill each button with its palette gradient
    btn.style.background = lutToGradient(buildLUT(btn.dataset.cmap, 256));
    btn.addEventListener('click', () => {
      renderer.setColormap(btn.dataset.cmap);
      cmapBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // ── Gravity magnitude slider ──
  const slGravMag = panel.querySelector('#sl-gravmag');
  const valGravMag = panel.querySelector('#val-gravmag');
  slGravMag.addEventListener('input', () => {
    phys.gravMag = parseFloat(slGravMag.value);
    valGravMag.textContent = phys.gravMag.toFixed(2);
    paintSlider(slGravMag);
    applyGravity();
  });

  // ── Compass dial (gravity direction; snap to 10°) ──
  const compass = panel.querySelector('#compass');
  const needle  = panel.querySelector('#compass-needle');
  const valGravDir = panel.querySelector('#val-gravdir');

  function setDirection(deg) {
    phys.gravDir = ((deg % 360) + 360) % 360;
    // Needle points along the gravity vector. Physics: 270° = down (−y).
    // Screen y is down, so the needle tip in SVG = center + R·(cos, −sin)... but
    // we want 270° to visually point DOWN: tip at (cx, cy+R). Map directly:
    //   screen-angle = -gravDir (SVG y grows downward).
    const rad = phys.gravDir * Math.PI / 180;
    const R = 26;
    const tipX = 32 + R * Math.cos(rad);
    const tipY = 32 - R * Math.sin(rad); // SVG y flip → 270° gives +y (down)
    needle.setAttribute('x2', tipX.toFixed(2));
    needle.setAttribute('y2', tipY.toFixed(2));
    valGravDir.textContent = phys.gravDir + '°';
  }

  function pointerToDir(e) {
    const r = compass.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // atan2 with flipped y so down = 270°
    let deg = Math.atan2(-dy, dx) * 180 / Math.PI;
    deg = Math.round(deg / 10) * 10; // snap to 10°
    setDirection(deg);
    applyGravity();
  }

  let _draggingCompass = false;
  compass.addEventListener('pointerdown', e => {
    _draggingCompass = true;
    pointerToDir(e);
    try { compass.setPointerCapture(e.pointerId); } catch (_) {}
  });
  compass.addEventListener('pointermove', e => { if (_draggingCompass) pointerToDir(e); });
  compass.addEventListener('pointerup',   () => { _draggingCompass = false; });
  compass.addEventListener('pointercancel', () => { _draggingCompass = false; });

  // ── Viscosity slider ──
  const slVisc = panel.querySelector('#sl-visc');
  const valVisc = panel.querySelector('#val-visc');
  slVisc.addEventListener('input', () => {
    phys.viscosity = parseFloat(slVisc.value);
    valVisc.textContent = phys.viscosity.toFixed(2);
    paintSlider(slVisc);
    applyViscosity();
  });

  // ── Scene custom dropdown ──
  const dd = panel.querySelector('#dd-scene');
  const ddBtn = dd.querySelector('.sph-dropdown-btn');
  ddBtn.addEventListener('click', e => {
    e.stopPropagation();
    dd.classList.toggle('open');
  });
  dd.querySelectorAll('.sph-dropdown-opt').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      dd.querySelectorAll('.sph-dropdown-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      ddBtn.textContent = opt.textContent;
      dd.classList.remove('open');
      scene.name = opt.dataset.val;
      reloadScene();
    });
  });
  // Close on outside click
  document.addEventListener('click', () => dd.classList.remove('open'));

  // ── Preset toggle ──
  wireToggle('tg-preset', val => { scene.preset = val; reloadScene(); });

  // ── Playback buttons ──
  const btnPlay  = panel.querySelector('#btn-play');
  const btnPause = panel.querySelector('#btn-pause');
  const btnStep  = panel.querySelector('#btn-step');

  function syncPlayPause() {
    const r = getRunning();
    btnPlay.classList.toggle('active', r);
    btnPause.classList.toggle('active', !r);
  }
  btnPlay.addEventListener('click', () => { setRunning(true);  syncPlayPause(); });
  btnPause.addEventListener('click', () => { setRunning(false); syncPlayPause(); });
  btnStep.addEventListener('click', () => { if (!getRunning()) stepOnce(); });

  // ── Time scale slider ──
  const slTS  = panel.querySelector('#sl-timescale');
  const valTS = panel.querySelector('#val-timescale');
  slTS.addEventListener('input', () => {
    const v = parseFloat(slTS.value);
    setTimeScale(v);
    paintSlider(slTS);
    const substeps = Math.max(1, Math.round(baseSubsteps * v));
    valTS.textContent = v.toFixed(1) + '×';
    valTS.title = substeps + ' substeps/frame';
  });

  // ── Reset ──
  panel.querySelector('#btn-reset').addEventListener('click', reloadScene);

  // ── Minimize toggle ──
  const btnMinimize = panel.querySelector('#btn-minimize');
  btnMinimize.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    btnMinimize.textContent = collapsed ? '+' : '−';
  });

  // ── Canvas spawn (click / drag) ──────────────────────────────────────────
  let _spawning = false;

  function spawnAt(e) {
    const eng = getEngine();
    if (eng._nFluid >= MAX_PARTICLES) return;

    const rect = canvas.getBoundingClientRect();
    const { x: wx, y: wy } = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Inset from walls: 3 boundary layers + 1 dp gap
    const dp = eng.spacing ?? eng.h * 0.8;
    const wallR = 3 * dp + dp;
    const xMin = wallR, xMax = eng.domainW - wallR;
    const yMin = wallR, yMax = eng.domainH - wallR;

    if (wx < xMin || wx > xMax || wy < yMin || wy > yMax) return;

    const offsets = [-dp, 0, dp];
    outer: for (const dx of offsets) {
      for (const dy of offsets) {
        if (eng._nFluid >= MAX_PARTICLES) break outer;
        const px = wx + dx, py = wy + dy;
        if (px >= xMin && px <= xMax && py >= yMin && py <= yMax) {
          eng.addParticle(px, py, 0, 0); // addParticle auto-increments _nFluid
        }
      }
    }
  }

  canvas.addEventListener('pointerdown', e => {
    _spawning = true;
    spawnAt(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => { if (_spawning) spawnAt(e); });
  canvas.addEventListener('pointerup',    () => { _spawning = false; });
  canvas.addEventListener('pointercancel', () => { _spawning = false; });

  // ── Stats update (called each RAF tick) ─────────────────────────────────
  const elFps = panel.querySelector('#stat-fps');
  const elN   = panel.querySelector('#stat-n');
  function updateStats(fps, N) {
    elFps.textContent = fps.toFixed(1);
    elN.textContent   = N;
  }

  // ── Initial sync ──
  paintSlider(slGravMag);
  paintSlider(slVisc);
  paintSlider(slTS);
  setDirection(270);
  applyGravity();
  applyViscosity();

  return { state, updateStats };
}
