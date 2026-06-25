# SPH Fluid Simulator — Project Overview

## 1. Project Description

This project is a browser-based **2D Smoothed Particle Hydrodynamics (SPH) fluid simulator**, built entirely through **agentic AI-assisted development (vibe-coding)**. The simulator models real fluid dynamics — pressure, viscosity, free surfaces, and particle interactions — running in real time in the browser with no installation required.

The central thesis of this project is not the simulator itself, but **how it was built**: the developer had no prior experience with particle simulations, yet was able to design and deliver a physically accurate, visually polished fluid simulator by supervising an agentic AI workflow. This project demonstrates that difficult engineering goals are achievable with modern agentic AI tools, provided the user can supply domain judgment, high-level direction, and quality supervision.

The project is intended as a **portfolio and demonstration piece** for the broader developer community and technical recruiters, showcasing the intersection of computational physics and agentic AI-assisted software development.

**Live demo:** https://hjalgra.github.io/sph-fluid-sim/
**Repository:** documents both the simulator and the AI-assisted development process

---

## 2. Product Requirements

### 2.1 Core Simulation
- 2D SPH fluid simulation using weakly compressible SPH (Tait equation of state)
- Cubic spline or Wendland kernel with analytical gradient evaluation
- Symmetrized pressure force and artificial viscosity (Monaghan scheme)
- Symplectic Euler time integration with CFL-based adaptive time stepping
- $O(N)$ linked-list cell grid for neighbor search
- **Dynamic boundary particles (Classic DBC, Crespo et al. 2007):** fixed boundary
  particles line all four walls, take density by kernel summation and pressure via the
  same Tait EOS, and repel fluid through the symmetrized pressure force — curing the
  near-wall density deficiency (the wall-sticking artifact)
- Target: **~5,000 fluid particles at stable 30+ fps** (boundary particles are extra)

### 2.2 Rendering — Two Modes
- **Particle mode:** each particle rendered individually, colored by speed or pressure using a heatmap colormap
- **Continuum mode:** smoothed density field rendered as a background heatmap interpolated onto a grid, giving the appearance of a continuous fluid body

> **Planned extension (post-v1):** marching squares surface reconstruction to extract and fill the fluid boundary as a polygon, with an optional internal pressure overlay.

### 2.3 Scenes
- **Dam-break** (default): particles initialized as a rectangular body of fluid released from rest, collapsing under gravity
- **Droplet drop**: a blob of fluid falling into a shallow pool
- **Two-column collision**: two fluid columns released to collide

### 2.4 User Interactions
- Reset button to re-initialize the currently selected scene from rest
- Click or click-drag to spawn new particles into the simulation (up to the particle-count guardrail, kept clear of the walls)
- Solid boundary walls on all domain edges (dynamic boundary particles, with a thin reflective clamp as a leak safety-net)

### 2.5 Controls
- Slider: gravity magnitude (0–100 m/s²) + draggable compass dial for direction
- Slider: viscosity coefficient
- Toggle: particle mode / continuum mode
- Selector: color particles by speed or pressure (particle mode)
- Selector: colormap (viridis / inferno / turbo / coolwarm)
- Toggle: hide / show the boundary particles
- Selector: scene (dam-break / droplet drop / two-column collision)
- Selector: particle-count preset (Low ≈ 1k / Med ≈ 3k / High ≈ 5k fluid)
- Play / Pause / Step controls
- Slider: time scale 0.1–8× (simulation speed via substep count; physics unchanged)
- Toggle: Dark / Light appearance (re-themes the panel and the canvas)
- Live stats readout: FPS and active fluid-particle count

### 2.6 Deployment
- Runs entirely in the browser — no backend, no build step required
- Intermediate development is pushed to a **private** repository; the public release is a
  clean snapshot published to **GitHub Pages**
- Hosted as a static site on **GitHub Pages**

---

## 3. Resources

### 3.1 Tech Stack
| Layer | Technology | Rationale |
|---|---|---|
| Simulation loop | Vanilla JavaScript (`Float32Array`) | Cache-friendly, no GC pressure, portable |
| Rendering | Canvas2D | Sufficient for v1 particle counts, zero dependencies |
| UI controls | Custom vanilla HTML/CSS/JS panel | Full styling control, no runtime deps, dark-glass aesthetic |
| Deployment | GitHub Pages | Zero friction, industry-standard portfolio format |

> **Planned extension (post-v1):** WebGL (`gl.POINTS`) rendering for 10k–50k particle counts.

### 3.2 Key References
- Monaghan, J.J. (1992). *Smoothed Particle Hydrodynamics*. Annual Review of Astronomy and Astrophysics.
- Monaghan, J.J. (2005). *Smoothed Particle Hydrodynamics and Its Diverse Applications*. Annual Review of Fluid Mechanics.
- Müller, M., Charypar, D., Gross, M. (2003). *Particle-Based Fluid Simulation for Interactive Applications*. SCA 2003. *(the standard SPH game/demo reference)*
- Crespo, A.J.C., Gómez-Gesteira, M., Dalrymple, R.A. (2007). *Boundary Conditions Generated by Dynamic Particles in SPH Methods*. CMC. *(the Classic DBC wall treatment)*

### 3.3 AI Workflow Documentation
- `PROCESS.md` — documents the agentic AI development methodology: which components were AI-generated, how supervision was applied, and what the vibe-coding workflow looked like in practice. This file is a first-class deliverable alongside the simulator itself.