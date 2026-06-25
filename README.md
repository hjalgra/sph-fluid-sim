# SPH Fluid Simulator

A 2D **Smoothed Particle Hydrodynamics (SPH)** fluid simulator that runs entirely in the
browser — no backend, no build step, no installation. Built with vanilla JavaScript and
Canvas2D, it models real weakly-compressible fluid dynamics (pressure, viscosity, free
surfaces, particle interaction) in real time at up to ~5,000 fluid particles.

**▶ Live demo:** https://hjalgra.github.io/sph-fluid-sim/

> This project was built end-to-end through a supervised **agentic AI development**
> workflow. The simulator is the artifact; *how it was built* is the thesis. The full
> methodology is documented in [PROCESS.md](PROCESS.md), and the product spec in
> [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

---

## Features

- **Real weakly-compressible SPH** — Wendland C2 kernel, Tait equation of state (γ=7),
  symmetrized Monaghan pressure force and artificial viscosity, symplectic Euler
  integration with CFL-adaptive time stepping, and an O(N) linked-list cell grid for
  neighbor search.
- **Dynamic boundary particles (DBC)** — DualSPHysics-style fixed boundary particles
  (Crespo et al. 2007) line all four walls. They take density by kernel summation and
  repel fluid through the same pressure force, curing the near-wall density deficiency
  that otherwise makes fluid "stick" in columns against the walls. A thin reflective
  clamp sits behind them as a leak safety-net.
- **Two render modes** — *particle* (each particle drawn and colored by speed or
  pressure) and *continuum* (smoothed density field drawn as a heatmap, for a continuous
  fluid look).
- **Four colormaps** — viridis, inferno, turbo, and coolwarm, selectable live; speed and
  pressure use a fixed color scale (no per-frame flicker).
- **Three scenes** — dam-break (default), droplet drop, two-column collision.
- **Custom dark-glass UI** — a hand-built vanilla HTML/CSS control panel (no third-party
  GUI library) with a draggable compass dial for gravity direction and a Dark/Light
  appearance toggle that re-themes the panel and the canvas.
- **Interactive** — click or click-drag to spawn fluid into the live simulation (capped
  at the compute guardrail and kept clear of the walls).
- **~5,000 fluid particles at 30+ fps** in a mainstream browser (boundary particles are
  extra and do not count against the cap).

## Controls

| Control | Effect |
|---|---|
| Gravity (magnitude + compass dial) | Steer the body force in any direction, 0–100 m/s² |
| Viscosity | Adjust the artificial-viscosity coefficient |
| Render mode | Toggle particle ⟷ continuum |
| Color by | Color particles by speed or pressure |
| Colormap | viridis / inferno / turbo / coolwarm |
| Walls | Hide or show the boundary particles |
| Scene | Switch dam-break / droplet drop / two-column |
| Particle count | Low ≈ 1k / Med ≈ 3k / High ≈ 5k preset (fluid) |
| Play / Pause / Step | Run, halt, or advance one frame |
| Time scale | Speed up/slow down without altering the physics (0.1–8×) |
| Appearance | Dark / Light theme |
| Reset | Re-initialize the current scene from rest |
| Live stats | FPS and active fluid-particle count |

Time scale changes apparent speed by running more (or fewer) physics substeps per frame —
the numerics are never altered. Particle count is exposed as presets (not a raw number)
so the simulation stays within safe memory/compute bounds by design.

## Run locally

ES modules must be served over HTTP — opening `index.html` via `file://` will not work.

```bash
python -m http.server 8000
# then open http://localhost:8000
```

No dependencies are fetched at runtime: the UI is hand-written vanilla JS/CSS, so there is
nothing to install or vendor.

## Project layout

```
index.html        entry page, loads ES modules
src/
  main.js         app entry: animation loop, run state, wiring
  kernel.js       Wendland C2 smoothing kernel + analytical gradient
  grid.js         linked-list cell grid (O(N) neighbor search)
  engine.js       SPH core: density, Tait pressure, forces, integration, ptype
  boundary.js     reflective domain walls (safety clamp behind the DBC layers)
  scenes.js       fluid + boundary-particle initialization per scene preset
  render.js       Canvas2D renderer (particle + continuum)
  colormap.js     speed/pressure → color (viridis / inferno / turbo / coolwarm)
  ui.js           custom dark-glass control panel + click/drag spawn
  ui.css          control-panel styling (Dark/Light themes)
  validate.js     headless physics validation harness
  validate_scenes.js  headless scene validation harness
```

## How it works (brief)

Each particle carries position, velocity, density, pressure, and a `ptype` flag
(fluid or boundary) in Structure-of-Arrays `Float32Array`/`Uint8Array`s. Per step the
engine (1) builds a uniform cell grid and computes each particle's density by kernel
summation over neighbors, (2) derives pressure from density via the Tait EOS (clamped
non-negative; boundary particles are purely repulsive), (3) accumulates symmetrized
pressure forces, Monaghan artificial viscosity, and gravity on the fluid, then (4)
integrates the fluid with symplectic Euler under a CFL-bounded timestep. Boundary
particles are fixed (never integrated) but participate fully in the density and pressure
sums so near-wall fluid sees a complete neighborhood. A periodic Shepard density
re-initialization renormalizes truncated kernel support. The numerics were validated
headless (kernel normalization, hydrostatic settling, momentum conservation, near-wall
pressure, no-penetration) before any rendering was written.

## Tech stack

Vanilla JavaScript (`Float32Array` SoA) · Canvas2D · hand-written HTML/CSS UI · GitHub
Pages. No build step, no runtime dependencies.

## References

- Monaghan, J.J. (1992). *Smoothed Particle Hydrodynamics*. Annu. Rev. Astron. Astrophys.
- Monaghan, J.J. (2005). *Smoothed Particle Hydrodynamics and Its Diverse Applications*.
  Annu. Rev. Fluid Mech.
- Müller, M., Charypar, D., Gross, M. (2003). *Particle-Based Fluid Simulation for
  Interactive Applications*. SCA 2003.
- Crespo, A.J.C., Gómez-Gesteira, M., Dalrymple, R.A. (2007). *Boundary Conditions
  Generated by Dynamic Particles in SPH Methods*. CMC.

## Roadmap (post-v1)

- WebGL (`gl.POINTS`) renderer for 10k–50k particles.
- Marching-squares surface reconstruction with optional internal pressure overlay.
