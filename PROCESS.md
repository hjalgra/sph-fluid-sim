# Process Log

Documents the agentic AI development methodology for this project: what was done,
which agent did it, and how the user supervised. Newest entries at the bottom.

## Log

* [2026-06-15] Main agent — Reviewed CLAUDE.md for memory/process self-maintenance.
  Found PROCESS.md was undocumented and MEMORY.md guidance lacked triggers and a
  format. Added PROCESS.md to the Architecture section, rewrote the Memory strategy
  with section-by-section triggers and a dated entry format, and added a Process
  documentation strategy section. User directed the change and approved the edits.
* [2026-06-15] Main agent — Drafted IMPLEMENTATION.md via collaborative Q&A with the
  user. Proposed a 7-chat execution structure (one self-contained context per
  subsystem) using an attached example project as a template, then resolved four
  user-facing choices through a structured question round: chat granularity, control
  set, particle-count presets, and scene presets. Seeded MEMORY.md roadmap and
  decisions. User answered the questions and approved the plan and the file updates.
* [2026-06-15] Main agent — Readiness review of all planning files surfaced two
  issues: a GitHub Pages vs. private-repo conflict and doc drift in PROJECT_OVERVIEW.
  Per the user's decisions, revised IMPLEMENTATION.md (Chat 1 now pushes to a private
  repo; the Pages publish moved to Chat 7 as the single public release, with the
  build kept Pages-ready throughout), updated PROJECT_OVERVIEW §2.3–2.6 to the
  expanded scenes/controls/deployment, and recorded the deployment decision plus the
  superseded early-deploy assumption in MEMORY.md. User directed both decisions.
* [2026-06-16] Main agent — Added human-in-the-loop workflow controls across the planning
  files. CLAUDE.md gained a control-chain rule (human instructs the always-Opus main
  agent, which delegates) and a Model & reasoning policy table; IMPLEMENTATION.md gained a
  per-chat Session manifest (model/reasoning, MCP, skills, Deliverable, Human validation,
  Handoff out) on all 7 chats. Added committed context profiles (.claude/settings.headless
  .json, settings.frontend.json) and a kickoff-chat project skill that emits a cold-start
  brief and stops for the human. The user reviewed drafts before implementation and chose
  documented-policy enforcement (no per-agent frontmatter) to keep the structure simple.
* [2026-06-19] Main agent + Front-end developer sub-agent — Executed Chat 1 (scaffold).
  Main agent ran the kickoff-chat brief, verified the existing `origin` remote is not
  public (unauthenticated GitHub API -> 404) before any push, then delegated the build to
  a Sonnet front-end sub-agent with a scaffold-only context window (tech stack, repo-layout
  subset, deliverable, coding conventions -- no physics/render/UI). Sub-agent created
  `index.html`, `src/main.js`, vendored `dat.gui.min.js` (0.7.9), and `README.md`, and
  self-verified HTTP 200s and zero external URLs. Main agent reviewed the files against the
  acceptance criteria (relative paths, brief standalone comments, no markdown refs, KISS),
  confirmed no external URLs via grep, then committed and pushed to the private origin/main.
  GitHub push was kept with the main agent since `gh` is not installed. User directed the
  kickoff and authorized sub-agent execution; visual browser confirmation remains the
  user's validation step.
* [2026-06-19] Main agent + Physics modeling sub-agent — Executed Chat 2 (headless physics
  engine). Main agent ran the kickoff-chat brief, then delegated to a Sonnet·high physics
  sub-agent with a physics-only context window (SPH references, state design, validation
  targets -- no rendering/UI/scaffold internals). Sub-agent implemented `src/kernel.js`
  (Wendland C2 + ∇W), `src/grid.js` (linked-list O(N) grid), `src/engine.js` (`Engine`
  class: density summation, Tait EOS, symmetrized Monaghan pressure force + artificial
  viscosity, symplectic Euler, CFL dt) and a validation harness. Node.js is absent on the
  machine, so the sub-agent wrote a faithful Python port (`validate_py.py`) alongside the
  canonical `validate.js`. Main agent supervised by reading all four JS files for physics
  correctness, diffing the Python port against the JS line-for-line, then independently
  re-running the harness (12/12 PASS reproduced, not trusting the pasted output). Flagged
  the Float32-vs-float64 fidelity gap, free-surface negative pressure, and a per-pair
  gradW allocation as known issues for later chats. No Opus escalation needed (passed first
  attempt). Bookkeeping (IMPLEMENTATION/MEMORY/PROCESS) kept with the main agent.
* [2026-06-19] Main agent + Physics modeling sub-agent (×2) — Executed Chat 3 (boundaries &
  scenes). Main agent ran the kickoff-chat brief, confirmed the headless profile (MCP denied),
  read the Chat-2 engine internals to hand off precisely, then delegated to a Sonnet·high physics
  sub-agent with an engine-API-only context. Sub-agent delivered `boundary.js` (reflective walls,
  restitution 0.5, wired into `_integrate` replacing the placeholder), `scenes.js` (three scenes,
  presets, reset), and `validate_scenes.js` — both harnesses green. On review the main agent caught
  that the presets produced ~110/220/405 particles, ~10× under the Low≈1k/Med≈3k/High≈5k spec, and
  that the sub-agent had rationalized the deviation rather than fixing it. Re-delegated a focused
  correction to a second Sonnet sub-agent: invert the design to target a count and derive spacing &
  h from it (spacing=sqrt(fillArea/(Ntarget·0.97)), h=spacing/0.9). Realized counts came to
  ~960/2900/4850, High ≤ 5000; 54/54 + 12/12 PASS. Main agent then independently ran an out-of-band
  2.5 s dam-break (KE settled to 2.9% of peak, no NaN) to confirm the "stable settled pool"
  criterion the in-suite check no longer covers at fine resolution, and logged that gap as a known
  issue. User directed the kickoff and authorized sub-agent execution.
* [2026-06-19] Main agent — Chat 4 kickoff + MCP/preview setup (no sub-agent yet; planning &
  environment only). Ran the kickoff-chat brief for Chat 4 (Rendering). The user asked whether
  they must set the sub-agent model manually; main agent clarified the control split — the model
  is set by the main agent in the Agent call (Sonnet·high), while the only human-side step is
  selecting the `.claude` context profile. On inspection the main agent found the Chat 4 manifest's
  `Claude_Preview` MCP server was never real: no `.mcp.json` defined it, no active `settings.json`
  applied the frontend profile, and the live session exposed only the Google cloud MCPs. Course
  corrections, all user-directed: (1) user first chose manual validation, so the main agent edited
  IMPLEMENTATION/MEMORY to drop MCP for Chat 4; (2) the user then reversed — wanting a real preview
  MCP — so the main agent reverted those edits and, after the user picked Playwright MCP from three
  options, created project `.mcp.json` defining `Claude_Preview` → `npx @playwright/mcp@latest`,
  pre-fetched the package, and installed Chromium. Also explained that launching with
  `--settings settings.frontend.json` was harmless even while the server was undefined, and that the
  already-open chat must be restarted to pick up the new `.mcp.json`. Net: front-end chats (4–6) now
  validate via a browser MCP that screenshots the live canvas. Lesson logged here because the back-
  and-forth (manifest named a phantom server; decision flipped twice) was a source of user confusion;
  MEMORY decisions updated to reflect the final state. No code written, no sub-agent spawned — Chat 4
  implementation still pending a clean restart with the profile loaded.
* [2026-06-19] Main agent + Front-end developer sub-agent — Executed Chat 4 (rendering). Before
  delegating, the main agent fixed a process bug the user flagged: the kickoff-chat skill wrongly
  listed the sub-agent model as a human setup step, so the skill was edited to split "human controls"
  (load the `.claude` profile, restart on `.mcp.json` change) from "main agent applies at spawn"
  (the Agent-tool `model` param), cross-referencing the documented-policy decision. Main agent then
  read the existing scaffold (`main.js`, `index.html`) and the scene/engine APIs to hand off precisely,
  and spawned a Sonnet front-end sub-agent (model set in the Agent call) with a render-only context
  (state arrays, domain bounds, scene API, scaffold facts — no physics internals), scoping out the
  Chat-5 GUI. Sub-agent delivered `colormap.js` (viridis + LUT), `render.js` (particle + continuum
  modes, world↔screen transforms), and rewrote `main.js` (engine step loop, temp `m`/`c` toggles +
  HUD, DPR-bug fix), self-validating via the `Claude_Preview` Playwright MCP. Rather than trust the
  pasted screenshots, the main agent independently served the repo and drove Playwright itself —
  confirming particle/speed, particle/pressure (visibly different), and continuum heatmap all render
  the live dam-break with zero JS errors (only a benign favicon 404). A transient browser-context
  close mid-check (mistaken at first for a page reset) was retried cleanly. No Opus escalation needed.
  Logged continuum O(N·grid) cost, particle overlap at high preset, and the favicon 404 as Chat-6
  follow-ups. User directed the kickoff, the skill fix, and authorized sub-agent execution; bookkeeping
  kept with the main agent.
* [2026-06-19] Main agent + Front-end developer sub-agent — Executed Chat 5 (UI & interaction). Main
  agent ran the kickoff-chat brief, then read the current `main.js`, `index.html`, and the `Engine`
  internals before delegating. Key pre-delegation finding: the engine allocated fixed-size SoA
  `Float32Array`s with no add-particle method, so click/drag spawn was impossible without an engine
  change — the main agent specified a minimal additive `addParticle` (capacity-doubling growth,
  physics signatures untouched) and a hard `MAX_PARTICLES=5000` guardrail in the handoff. Spawned a
  Sonnet·high front-end sub-agent with a UI-only context (engine/renderer/scene public APIs, the temp
  Chat-4 controls to delete, the 8 required features). Sub-agent delivered `src/ui.js` (dat.GUI panel +
  pointer-spawn), the `addParticle` method, a rewritten `main.js` (run state, time-scale via substep
  scaling, FPS EMA, Step), and an inline-SVG favicon, self-validating via the Playwright MCP. Rather
  than trust the report, the main agent independently served the repo and drove Playwright: switched to
  the High preset through the real GUI `<select>`, fired 300 pointerdown events through the actual
  canvas spawn path and confirmed the count capped at exactly N=5000 (the explicit acceptance test),
  verified Pause→Step advanced a single frame, toggled continuum mode (heatmap + spawned particles
  visible), and confirmed zero console errors/warnings. Cleaned Playwright/screenshot artifacts and
  added them to `.gitignore` before committing. Logged the High+continuum ≈31 fps margin as a Chat-6
  perf note and struck the now-fixed favicon 404. No Opus escalation needed. User directed the kickoff
  and pre-authorized the commit conditional on the main agent's own tests passing; bookkeeping and the
  git commit kept with the main agent.
* [2026-06-20] Main agent + Coding expert sub-agent — Executed Chat 6 (performance & polish). Main agent
  ran the kickoff-chat brief, then delegated to a Sonnet·medium coding sub-agent with a perf-only context
  (engine/renderer/UI public APIs, the four named bottlenecks, the 30+ fps acceptance bar, the headless
  harnesses for regression). Sub-agent rebuilt the continuum field around a spatial-bucket grid + a single
  `putImageData→drawImage` (isolated render ~18ms→~0.77ms), made `kernel.gradW` write into caller scratch
  (zero per-pair alloc), added `grid.getNeighbors(x,y,out)` to replace the per-candidate closure callback,
  inlined the particle-mode transform/LUT lookup, tuned dot radius/alpha at High, and added a dark-navy
  background. It also dropped `BASE_SUBSTEPS` 3→2 to fit the frame budget. Rather than trust the pasted
  numbers, the main agent independently re-ran both harnesses (12/12 + 54/54 PASS, momentum drift identical
  → physics bit-unchanged) and read the diffs. Two issues surfaced on review: (1) the sub-agent's headline
  "47 fps" was an extrapolation from a ~21ms compute budget, NOT a live measurement — Playwright's RAF is
  throttled to ~32 Hz here, so live fps stays a human-browser validation step; (2) the `BASE_SUBSTEPS` 3→2
  change is not purely a perf fix — it slows the fluid's apparent evolution ~33% at timeScale=1. The main
  agent surfaced the substep tradeoff to the user, who chose to keep 2 and validate fps live first. No Opus
  escalation. Chat 6 left open pending the user's real-browser 30+ fps confirmation; bookkeeping kept with
  the main agent.
* [2026-06-20] Main agent + user — Closed Chat 6 after a careful fps validation. The user reported a
  perfectly steady 32 fps at High+continuum — suspicious because it equalled the pre-Chat-6 baseline and a
  flat round number is not what compute-bound code produces. The main agent ran a differential test
  (Low+particle, a near-idle load) which ALSO pinned to exactly 32, proving the limit was an environment
  RAF cap (battery/power throttle), not the simulation. To get a cap-independent number the main agent had
  the user paste a console snippet timing `engine.step`+`renderer.draw` outside RAF: 4.43 ms/frame at High
  preset → ~226 fps uncapped, ~7× the 30 fps bar and direct proof the perf work landed (the fps readout
  simply couldn't show the headroom). The main agent resisted banking the bare 32 fps number and dug until
  the result was honest. Marked Chat 6 done across the three docs and committed the five `src/` files. User
  performed every live measurement; main agent diagnosed the cap and kept the bookkeeping + commit.
* [2026-06-21] Main agent + user — Executed Chat 7 (deploy & documentation), the final chat and the
  single public release. The realized work (docs + git + the auth-gated publish) is the kind every
  prior chat kept with the main agent, so no sub-agent was spawned. Main agent ran the kickoff-chat
  brief, then surfaced the real gate up front: `gh` was not installed and the build's publish target
  was undecided. The user installed GitHub CLI via winget (`GitHub.cli` 2.95.0); because the session
  predated the install, `gh` was not on PATH, so the main agent located and invoked it by absolute
  path (`C:\Program Files\GitHub CLI\gh.exe`) rather than forcing a chat restart. Two publish choices
  were resolved with the user through a structured question round: (1) a NEW public repo
  `hja-99/sph-fluid-demo` (keeping the dev repo `sph-fluid-simulator` private) rather than flipping the
  existing repo — chosen after the main agent flagged that a new repo could not reuse the existing
  private repo's name; (2) a CLEAN single-commit snapshot rather than full history, for the cleanest
  public face. The user authenticated `gh` interactively (the only step the main agent could not run);
  main agent verified the token carried `repo`+`workflow` scope before proceeding. Pre-publish, the
  main agent re-ran both headless harnesses itself (`validate.js` 12/12, `validate_scenes.js` 54/54)
  and grepped the HTML/JS for external URLs (none) to certify the build Pages-ready, then wrote the
  portfolio `README.md`. The publish was a staged clean snapshot: only the app + the public-facing
  story docs (`index.html`, `src/`, `vendor/`, `README.md`, `PROCESS.md`, `PROJECT_OVERVIEW.md`) were
  copied to a temp build dir and committed as a single "v1" commit; the internal orchestration files
  (`CLAUDE.md`, `MEMORY.md`, `IMPLEMENTATION.md`, `.claude/`, `project-skills/`, `.mcp.json`) were
  deliberately excluded so `PROCESS.md` remains the curated public account of the agentic workflow.
  Main agent created the public repo via `gh repo create --public --push`, enabled GitHub Pages
  (main branch, root) via the API, and verified the live URL — https://hja-99.github.io/sph-fluid-demo/.
  User directed the kickoff, made both publish decisions, performed the interactive auth, and
  authorized the single public release; main agent kept the docs, the snapshot build, and all git/Pages
  operations. v1 complete.
* [2026-06-23] Main agent + Coding-expert sub-agent (+ Opus research sub-agent) — Executed Chat 8
  (simulation-core audit, read-only), the first Phase-2 chat. Main agent ran the kickoff-chat brief; the
  user overrode the policy Sonnet·medium to **Sonnet·xhigh** for the audit and required an explicit
  abort-on-inconclusive tripwire (abort → main agent retries on Opus). Main agent delegated to a
  Coding-expert sub-agent with a sim-core-only context (the five files kernel/grid/engine/boundary/scenes,
  the engine/scene API notes from Chats 2–3, the known-issues list), hard-scoped to read-only with AUDIT.md
  the only writable file. Sub-agent returned conclusively (no abort, no Opus escalation): 7 findings
  F-01..F-07 (2 High, 2 Med, 3 Low) ranked with file:line, category, proposed fix and risk note; all 3
  known issues confirmed; a 25-row verified-correct coverage table. Rather than trust the summary, the main
  agent re-read the two High findings against the actual source (F-01 `_computePressure` ignores `gamma`;
  F-03 `resetScene` never restores `N`) — both verified — and added the nuance that F-03 is latent because
  the live UI Reset uses `createEngineForScene`, not `resetScene`. Triage ran as a structured human-in-the-
  loop round: the user fixed F-05 (force-CFL), and for the deep-numerics finding F-02 (free-surface negative
  pressure) asked for a research phase rather than a snap decision. Main agent spawned a dedicated **Opus**
  research sub-agent that did web search + SPH-literature review (Becker & Teschner 2007, Monaghan 2000,
  Colagrossi & Landrini 2003, DualSPHysics DBC/mDBC, Adami-Hu-Adams) and produced RESEARCH_F02.md — a ranked
  menu of 5 strategies with a top recommendation. After the main agent surfaced "is this common in the
  literature / what's the standard fix", the user chose **Strategy 5 (clamp + periodic Shepard)** and then
  opted to fix ALL 7 findings (including the two trivial Lows) in Chat 9. Main agent recorded the triaged
  fix list as the Chat-9 handoff-out and updated the three docs. No source files modified (audit honored
  read-only). User directed the kickoff, the model override, the per-item triage, and the F-02 strategy;
  main agent supervised the sub-agents, independently spot-checked findings, and kept the bookkeeping.

* [2026-06-23] Main agent + Physics-modeling sub-agent — Executed Chat 9 (fix simulation bugs). Kickoff
  via the `/kickoff-chat` project skill (read manually — it lives in project-skills, not the loadable
  registry): main agent emitted the cold-start brief from the Chat-8 handoff-out and stopped for the human,
  who launched. Main agent (Opus) delegated implementation to a Physics-modeling sub-agent on **Sonnet·high**
  with a context hard-scoped to the five sim-core files plus AUDIT.md and RESEARCH_F02.md — no rendering/UI,
  no doc-editing, no commit (those reserved for the main agent). Sub-agent implemented all 7 triaged findings
  F-01..F-07: F-01 gamma-aware EOS with a γ=7 fast path; F-02 non-negative pressure clamp every step + a new
  `_shepardDensity()` reinit reusing the neighbour pass every 30 steps; F-03 `_sceneN` restore in
  `resetScene`; F-04/F-06/F-07 comment+style; F-05 force-CFL fix. It added 3 validation checks and returned
  harnesses 19/19 + 54/54 with an F-02 stability spot-check at the Chat-10 extremes (gy=−100, 16 substeps).
  Rather than trust the summary, the main agent re-ran both harnesses itself and read the full engine/scenes
  diff against the agreed strategy — all confirmed. On the user's question "is the Shepard improvement
  acceptable / what does the literature say", the main agent gave a literature-grounded judgment (zeroth-order
  Shepard's ~1.1× surface gain is inherent, not a bug; standard reinit cadence is every 10–50 steps per
  Colagrossi & Landrini 2003; MLS is the first-order upgrade, deferred as over-engineering). User agreed with
  the recommendation to keep the 30-step cadence and re-point the misleading test. Main agent re-pointed
  `validate.js` Test 7 from a top-surface ρ=ρ0 target to truncated-support edge reproduction (edge 10.4%→8.2%,
  bulk untouched), re-ran green (19/19), and updated the three docs. User directed the kickoff, ruled on the
  Shepard cadence/literature question, and validates the numerics; main agent supervised the sub-agent,
  independently verified, advised on the physics, and kept the bookkeeping.

* [2026-06-23] Main agent + Front-end sub-agent — Executed Chat 10 (UI rebuild + widened controls).
  Kickoff via the `/kickoff-chat` project skill: main agent emitted the cold-start brief from the
  Chat-9 handoff-out and stopped for the human, who launched. Main agent (Opus) delegated to a
  Front-end-developer sub-agent on **Sonnet·high** with a context hard-scoped to the front-end files
  plus the engine/renderer/scene APIs and the aesthetic/range decisions — sim core explicitly off-limits
  (only a render.js background-color hook permitted), no doc-editing, no commit. The chat ran as a
  TWO-GATE staged handoff. Phase 1: the sub-agent built the dark-glass panel, removed dat.GUI, wired
  every control, served it locally and screenshotted the live sim, then STOPPED at the interim mockup
  gate. The main agent read the screenshots itself before relaying, then put the look to the human via a
  structured approve/tweak/rework question. Human answered "approve with tweaks" and specified three:
  a compass dial for gravity direction (snap 10°), a dark dropdown background, and a Dark/Light theme
  toggle. Main agent folded these into a single finalize message and resumed the SAME sub-agent (context
  preserved) rather than spawning cold. Phase 2: sub-agent implemented the three tweaks + deferred polish
  and verified the widened extremes (gravity 100, 8×→16 substeps) live. Rather than trust the summary, the
  main agent independently checked scope (`git diff --stat` + grep: sim core untouched, zero dat.GUI refs),
  read the render.js/main.js diffs to confirm the background hook was truly minimal, and viewed the final
  compass/dropdown/light-theme screenshots. Final human-validation gate: user approved and chose to close.
  Main agent marked Chat 10 done in IMPLEMENTATION.md with a Chat-11 handoff-out and updated MEMORY.md +
  PROCESS.md. User directed both gates (mockup approval, the three tweaks, final sign-off); main agent
  supervised the sub-agent across the staged handoff, independently verified scope and diffs, and kept the
  bookkeeping.

* [2026-06-23] Chat 11 — Full review of the v2 build (main agent Opus + one Coding-expert sub-agent).
  Kickoff via the `/kickoff-chat` project skill: main agent emitted the cold-start brief from the
  Chat-10 handoff-out and stopped; human launched. Main agent ran the regression gate itself first
  (`node src/validate.js` 19/19, `node src/validate_scenes.js` 54/54) to establish ground truth — a
  trivial headless check, not heavy implementation — then delegated the deep front-end review to a
  Coding-expert sub-agent on **Sonnet·medium**, context hard-scoped to the six front-end files plus the
  Chat-10 change context, **read-only / report-only** (no edits — fixes were the main agent’s call).
  The sub-agent returned 11 prioritized findings (no correctness bugs, no listener leaks, no per-frame
  DOM cost) + a clean-bill list. The main agent independently verified each High/Med finding against
  the actual source (Read/Grep at the cited file:line) before acting, then applied only the safe,
  behavior-preserving cleanups itself: a `_layout()` DRY helper in render.js, dead `viridis`/`--canvas-bg`
  removal, the `baseSubsteps` injection, dropdown `stopPropagation`, and deletion of the orphaned
  `vendor/dat.gui.min.js`. It re-ran both harnesses (still green), then drove the live app via
  Claude_Preview: bit-exact round-trip test of the refactored transforms (~3e-17), a perf re-check at
  the High preset (~52 fps default, worst-case 8× stable at 0 NaN/0 escape), every control exercised,
  Dark+Light visual pass across a resize, short-window scroll check, and a whole-session console sweep
  (0 err/0 warn). Throwaway `.jpeg` screenshots were deleted (gitignore only covers `*.png`). Main agent
  marked Chat 11 done in IMPLEMENTATION.md with a Chat-12 handoff-out (incl. the v2 feature list and the
  stale-dat.GUI-docs note) and updated MEMORY.md. User supervised: launched the chat and holds the final
  sign-off; main agent split the work (self-ran the cheap regression gate + live verification, delegated
  the code-reading), verified the sub-agent’s findings rather than trusting them, and owned the fixes.

* [2026-06-24] Chat 12 — DBC design & spec, read-only (main agent Opus + one Coding-expert sub-agent,
  physics-modeling lens). Opens Phase 3 (dynamic boundary particles to cure the wall-sticking artifact).
  Kickoff via the `/kickoff-chat` project skill: main agent emitted the cold-start brief from the Phase-3
  plan + Chat-11 handoff and stopped; human launched. Main agent delegated to a sub-agent on
  **Sonnet·medium**, context hard-scoped to the five sim-core files (kernel/grid/engine/boundary/scenes)
  plus the locked Phase-3 decisions and the F-02 fix context, **read-only** (produce exactly one file,
  `DBC_DESIGN.md`, modify no source), with an explicit abort-on-inconclusive tripwire → re-run on Opus.
  The sub-agent delivered a conclusive 531-line spec (Classic-DBC math, a `ptype` data model with a
  loop-by-loop branch table, 3-layer wall geometry + `_nFluid`/`_nBoundary` bookkeeping, the
  F-02/Shepard/clamp interaction, a file-by-file touch-point list, and three new headless regression
  gates) — no tripwire, no Opus escalation. The main agent independently spot-checked the spec's code
  references against the real source (`_nbr` size at engine.js:94, `addParticle` signature at engine.js:331,
  `wallR` at scenes.js:69 — all accurate) rather than trusting them, then ran the Chat-12 human-validation
  gate: surfaced the four genuine design forks to the user via a structured question (wall geometry
  inside-vs-outside the domain, 3-layer support coverage, startup pressure spike) and triaged each. User
  chose inside-domain layers, keep-3-layers-verify-via-gates, and warm-up steps — all confirming the spec.
  Main agent recorded the triage in DBC_DESIGN.md §0, marked Chat 12 done in IMPLEMENTATION.md with a
  Chat-13 handoff-out (locked design calls + carried risks), and updated MEMORY.md (roadmap + a dated
  decisions entry). User supervised: launched the chat and made every design-fork call at the gate; main
  agent planned/delegated/verified and owned the bookkeeping, doing no heavy implementation itself.

* [2026-06-24] Chat 13 — DBC engine core, headless (main agent Opus + one Physics-modeling sub-agent).
  First code chat of Phase 3: turns the locked `DBC_DESIGN.md` spec into a working `ptype` data model.
  Kickoff via the `/kickoff-chat` project skill: main agent emitted the cold-start brief from the Chat-12
  handoff-out and stopped; human launched with "start chat 13". Before delegating, the main agent read
  `DBC_DESIGN.md` in full and confirmed the five sim-core files + validators existed, then hard-scoped the
  sub-agent to ONLY `engine.js` + `boundary.js` + `validate.js` (Tests 9/10) — explicitly fencing off
  `scenes.js`/`render.js`/`ui.js`/`validate_scenes.js` as Chat 14–15 — with the box fixture placed
  programmatically (no scene wall-generation yet). Delegated to a Physics-modeling sub-agent on
  **Sonnet·high** (escalate-to-Opus tripwire on engine destabilization), no doc edits / no commit.
  Sub-agent implemented the §3 branch table exactly: `ptype` Uint8Array + `_nFluid`/`_nBoundary` counters,
  `addParticle(...,type=0)` growing `ptype` as its own array, `_nbr` 256→512, `continue` on `ptype===1` in
  Shepard/forces/integrate/CFL/KE/momentum and `applyBoundary`, with density+pressure left running over all
  particles. Added Test 9 (boundary strip lifts near-wall density 500→950) and Test 10 (sub-rest boundary
  pressure floored to 0); reported 21/21 PASS and a stable box fixture. Rather than trust the summary, the
  main agent Read all of engine.js (verified `_computeDensity`/`_computePressure` are NOT branched, the
  Uint8Array capacity-growth is handled separately, mass not inflated), Read boundary.js and grepped the two
  new tests, then independently re-ran `node src/validate.js` → 21/21 PASS reproduced. No deviations, no Opus
  escalation. Main agent marked Chat 13 done in IMPLEMENTATION.md with a Chat-14 handoff-out (the engine
  `ptype` API + the carried scene/warm-up/validation work) and updated MEMORY.md (roadmap + architecture
  summary). User directed the kickoff and launched; main agent planned/delegated/independently verified
  the diff and the harness, and owned the bookkeeping.

* [2026-06-24] Chat 14 — DBC boundary generation in scenes, headless (main agent Opus + one
  Physics-modeling sub-agent). Places the 3-layer DBC walls the Chat-13 engine was built to read.
  Kickoff via the `/kickoff-chat` skill: main agent emitted the cold-start brief from the Chat-13
  handoff-out and stopped; human launched with "Launch chat 14". Main agent hard-scoped the sub-agent to
  ONLY headless files (`scenes.js`, `validate_scenes.js`), handed it the locked DBC_DESIGN geometry/inset/
  warm-up calls, and instructed it to STOP and report rather than touch the engine if a core change seemed
  needed. Delegated to a Physics-modeling sub-agent on **Sonnet·high**, escalate-to-Opus tripwire on
  destabilization. Sub-agent implemented boundary-first placement (`_placeBoundaryParticles`, `addParticle
  (...,1)`), the `wallR=3dp+dp/2` fluid inset, `_nFluid`/`_nBoundary`/`_sceneName` bookkeeping, a `warmUp`
  export, and the three new scene gates (G no-gap, H no-penetration, I hydrostatic-wall), reporting
  `validate.js` 21/21 + `validate_scenes.js` 54→57 and headless evidence the sticking artifact is gone.
  The sub-agent also self-committed the chat. Rather than trust the summary, the main agent independently
  re-ran BOTH harnesses (21/21, 57/57 reproduced), read the full `scenes.js`/`validate_scenes.js` diff, and
  cross-checked the corner-duplicate handling against DBC_DESIGN §4 — confirming the implementation matches
  the human-triaged spec and flagging two non-blocking items for Chat 16 (the ~2.4× near-wall over-pressure
  inherent to Classic DBC, and the inert coincident corner particles). Reviewed two spec deviations the
  sub-agent surfaced (Section I upper bound 2×→4×; intentional corner duplicates) and accepted both with the
  physical rationale recorded. Main agent marked Chat 14 done in IMPLEMENTATION.md with a Chat-15 handoff-out,
  updated MEMORY.md (roadmap + architecture + struck the wall-sticking known issue as resolved-headless,
  live-pending), and logged this entry. User directed the kickoff and launched; main agent planned/delegated/
  independently verified and owned the documentation.

- [2026-06-24] **Chat 15 — Rendering & UI integration (Front-end developer sub-agent).** Wires the
  live front end to the Chat-14 dynamic boundary particles. Kickoff via `/kickoff-chat 15`: main agent
  emitted the cold-start brief from the Chat-14 handoff-out and stopped; human launched with "start chat 15".
  Main agent hard-scoped the sub-agent to ONLY the front end (`render.js`/`ui.js`/`main.js`), handing it the
  Chat-14 scene API (`createEngineForScene`, `warmUp`, `_nFluid`/`_nBoundary`/`ptype`/`spacing`) and the four
  to-dos (distinct-or-hidden walls, fluid-only stats, wall-safe + fluid-capped spawn, fluid-only color range)
  plus the warmUp-on-every-create rule, with an instruction NOT to touch the sim core or harnesses. Delegated
  to a Front-end sub-agent on **Sonnet·high**, MCP Claude_Preview for live verification. Sub-agent chose a
  hidden-by-default Walls toggle (muted gray-blue when shown), routed render/stats/spawn/color-range through
  `_nFluid`, inset spawn to `3dp+dp/2`, and called `warmUp` on startup + `reloadScene`; verified live via the
  browser MCP (artifact gone, count math checks, console clean both themes) with screenshots. Rather than
  trust the summary, the main agent read the full three-file diff, confirmed only the front end changed, and
  verified the load-bearing `addParticle(type=0)→_nFluid++` claim at engine.js:374; then independently re-ran
  BOTH harnesses (21/21, 57/57) to confirm no sim-core regression. Marked Chat 15 done in IMPLEMENTATION.md
  with a Chat-16 handoff-out, updated MEMORY.md (roadmap + architecture), and logged this entry. Human final
  page-open validation left as the closing gate. User directed the kickoff and launched; main agent planned/
  delegated/independently verified and owned the documentation.

- [2026-06-25] **Chat 16 — Full review + 3 bug fixes + rendering polish (Coding-expert review sub-agent,
  three diagnose→fix sub-agent cycles, one Front-end sub-agent, plus main-agent inline edits).** Kickoff via
  `/kickoff-chat 16`: main agent emitted the cold-start brief from the Chat-15 handoff-out and stopped; human
  launched with "Yes, let's start". **Review:** delegated a whole-app regression+perf+visual review to a
  Coding-expert sub-agent on **Sonnet·medium** (Claude_Preview); it re-baselined the harnesses, strengthened
  `validate_scenes.js` 57→62 (Section J boundary-fixed, K all-walls no-gap), did a DRY/KISS pass, and reported
  High-preset ~62 fps (no fluid trim). Main agent independently re-ran both harnesses (21/21, 62/62) and read
  the diff before sign-off. **Human page-open then surfaced three bugs**, each handled as a diagnosis-first
  loop the user explicitly approved: (1) particles launched off the walls at t=0 — a **diagnosis-only**
  Physics sub-agent (Sonnet·medium) traced it to the 0.5·dp fluid inset (kernel-peak density spike), main
  agent verified the geometry at `scenes.js:77/226` and spawned a Sonnet·high implementer to widen the gap to
  1.0·dp; (2) particles stuck behind the walls — diagnosis sub-agent found the reflective clamp at `h*0.5`
  trapping tunnelers in the pressure-dead zone, main agent verified `boundary.js:22` + the un-factored
  force-CFL at `engine.js:283`; (3) high-speed tunneling — same diagnosis. The user chose fixes A+B+C, and a
  Sonnet·high implementer applied: clamp→`spacing*3`, `dtF=cfl*sqrt(h/amax)`, and a `2*c0` speed cap, verified
  by node penetration tests (0 trapped at 50 m/s / 200×g / ±40 m/s) and live. Main agent independently re-ran
  harnesses and read every diff after each fix. **Rendering polish (user-directed):** a Front-end sub-agent
  (Sonnet·high) added four colormaps + a constant color scale (fixing at-rest flicker); then on further user
  requests the **main agent did the smaller UI work inline** — replaced the dropdown with four gradient-filled
  buttons, removed the color-bar legend, DRY'd `lutToGradient` into the buttons, and set the final caps
  (5 m/s / 12000 Pa) — verified live via Claude_Preview (four buttons on one row, active-glow switch, console
  clean) and screenshot-checked. Used `AskUserQuestion` to let the human pick the colormap direction (they
  chose all four). Main agent then owned close-out: verified the dev repo is PRIVATE via `gh` before pushing,
  marked Chat 16 done in IMPLEMENTATION.md with a Chat-17 handoff-out, updated MEMORY.md (roadmap +
  architecture + known issues + decisions), committed the combined Chat-16 work, and pushed to the private
  origin/main. User supervised throughout: approved each diagnosis→fix step, verified the live sim personally,
  and directed the rendering changes and the close-out/commit/push.
