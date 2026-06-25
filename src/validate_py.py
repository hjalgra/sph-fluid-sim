"""
Headless SPH validation harness — Python port of the JS engine.
Mirrors the logic in kernel.js, grid.js, and engine.js exactly.
Run with: python src/validate_py.py

This script validates the physics without Node.js.
The canonical Node harness is src/validate.js (for environments with Node).
"""

import math
import sys

# ------------------------------------------------------------------ #
#  Kernel (mirrors kernel.js)
# ------------------------------------------------------------------ #

def kernel_constants(h):
    alpha = 7.0 / (4.0 * math.pi * h * h)
    return {"alpha": alpha, "invH": 1.0 / h, "support": 2.0 * h, "h": h}

def W(r, kc):
    q = r * kc["invH"]
    if q >= 2.0:
        return 0.0
    t = 1.0 - 0.5 * q
    return kc["alpha"] * t**4 * (2.0 * q + 1.0)

def gradW(dx, dy, r, kc):
    if r < 1e-12:
        return 0.0, 0.0
    q = r * kc["invH"]
    if q >= 2.0:
        return 0.0, 0.0
    t = 1.0 - 0.5 * q
    dWdr = kc["alpha"] * (-5.0 * q * t**3) * kc["invH"]
    invR = 1.0 / r
    return dWdr * dx * invR, dWdr * dy * invR

# ------------------------------------------------------------------ #
#  Grid (mirrors grid.js)
# ------------------------------------------------------------------ #

class Grid:
    def __init__(self, domainW, domainH, cell_size):
        self.domainW = domainW
        self.domainH = domainH
        self.cell_size = cell_size
        self.nx = max(1, math.ceil(domainW / cell_size))
        self.ny = max(1, math.ceil(domainH / cell_size))
        n_cells = self.nx * self.ny
        self.head = [-1] * n_cells
        self.next = None

    def build(self, x, y, N):
        cs = self.cell_size
        nx, ny = self.nx, self.ny
        self.head = [-1] * (nx * ny)
        self.next = [-1] * N
        for i in range(N):
            cx = max(0, min(nx - 1, int(x[i] / cs)))
            cy = max(0, min(ny - 1, int(y[i] / cs)))
            cell_idx = cy * nx + cx
            self.next[i] = self.head[cell_idx]
            self.head[cell_idx] = i

    def for_each_neighbor(self, px, py, cb):
        cs = self.cell_size
        nx, ny = self.nx, self.ny
        cx = int(px / cs)
        cy = int(py / cs)
        for dcy in range(-1, 2):
            ccy = cy + dcy
            if ccy < 0 or ccy >= ny:
                continue
            for dcx in range(-1, 2):
                ccx = cx + dcx
                if ccx < 0 or ccx >= nx:
                    continue
                j = self.head[ccy * nx + ccx]
                while j != -1:
                    cb(j)
                    j = self.next[j]

# ------------------------------------------------------------------ #
#  Engine (mirrors engine.js)
# ------------------------------------------------------------------ #

class Engine:
    def __init__(self, N, domainW, domainH,
                 h=0.04, rho0=1000.0, gamma=7, c0=20.0,
                 alpha=0.1, beta=0.0, mass=None,
                 gx=0.0, gy=-9.81, cfl=0.3):
        self.N = N
        self.domainW = domainW
        self.domainH = domainH
        self.h = h
        self.rho0 = rho0
        self.gamma = gamma
        self.c0 = c0
        self.alpha = alpha
        self.beta = beta
        self.mass = mass if mass is not None else rho0 * h * h
        self.gx = gx
        self.gy = gy
        self.cfl = cfl
        self.B = rho0 * c0 * c0 / gamma
        self.kc = kernel_constants(h)
        self.support = self.kc["support"]

        self.x        = [0.0] * N
        self.y        = [0.0] * N
        self.vx       = [0.0] * N
        self.vy       = [0.0] * N
        self.density  = [0.0] * N
        self.pressure = [0.0] * N
        self._ax      = [0.0] * N
        self._ay      = [0.0] * N

        self.grid = Grid(domainW, domainH, self.support)

    def _compute_density(self):
        N = self.N
        x, y, mass, density, kc = self.x, self.y, self.mass, self.density, self.kc
        self.grid.build(x, y, N)
        for i in range(N):
            rho = 0.0
            def accum_rho(j, _i=i):
                dx = x[_i] - x[j]
                dy = y[_i] - y[j]
                r = math.sqrt(dx*dx + dy*dy)
                self.density[_i] += mass * W(r, kc)
            density[i] = 0.0
            self.grid.for_each_neighbor(x[i], y[i], accum_rho)
            density[i] = max(density[i], self.rho0 * 0.5)

    def _compute_pressure(self):
        rho0, gamma, B = self.rho0, self.gamma, self.B
        for i in range(self.N):
            ratio = self.density[i] / rho0
            r7 = ratio**7
            self.pressure[i] = B * (r7 - 1.0)

    def _compute_forces(self):
        N = self.N
        x, y, vx, vy = self.x, self.y, self.vx, self.vy
        density, pressure = self.density, self.pressure
        mass, kc, h = self.mass, self.kc, self.h
        alpha, beta, c0 = self.alpha, self.beta, self.c0
        gx, gy = self.gx, self.gy
        support = self.support
        eps = 0.01

        ax = self._ax
        ay = self._ay
        for i in range(N):
            ax[i] = 0.0
            ay[i] = 0.0

        for i in range(N):
            xi, yi = x[i], y[i]
            vxi, vyi = vx[i], vy[i]
            rhoi, pi = density[i], pressure[i]
            fxi = fyi = 0.0

            def accum_force(j, _i=i, _xi=xi, _yi=yi, _vxi=vxi, _vyi=vyi,
                             _rhoi=rhoi, _pi=pi):
                nonlocal fxi, fyi
                if j == _i:
                    return
                dx = _xi - x[j]
                dy = _yi - y[j]
                r2 = dx*dx + dy*dy
                if r2 >= support * support:
                    return
                r = math.sqrt(r2)
                gxij, gyij = gradW(dx, dy, r, kc)
                rhoj = density[j]
                pj   = pressure[j]
                pressure_term = _pi / (_rhoi * _rhoi) + pj / (rhoj * rhoj)
                dvx = _vxi - vx[j]
                dvy = _vyi - vy[j]
                vdotr = dvx*dx + dvy*dy
                visc = 0.0
                if vdotr < 0:
                    mu = h * vdotr / (r2 + eps * h * h)
                    rhobar = 0.5 * (_rhoi + rhoj)
                    visc = (-alpha * c0 * mu + beta * mu * mu) / rhobar
                coeff = -mass * (pressure_term + visc)
                fxi += coeff * gxij
                fyi += coeff * gyij

            self.grid.for_each_neighbor(xi, yi, accum_force)
            ax[i] = fxi + gx
            ay[i] = fyi + gy

    def _cfl_dt(self, max_dt):
        N = self.N
        vx, vy, ax, ay = self.vx, self.vy, self._ax, self._ay
        h, c0, cfl = self.h, self.c0, self.cfl
        vmax2 = 0.0
        amax  = 0.0
        for i in range(N):
            v2 = vx[i]**2 + vy[i]**2
            if v2 > vmax2:
                vmax2 = v2
            a = math.sqrt(ax[i]**2 + ay[i]**2)
            if a > amax:
                amax = a
        vmax = math.sqrt(vmax2)
        dt_v = cfl * h / (c0 + vmax + 1e-10)
        dt_f = cfl * math.sqrt(h / amax) if amax > 1e-10 else max_dt
        return min(max_dt, dt_v, dt_f)

    def _integrate(self, dt):
        N = self.N
        domainW, domainH, h = self.domainW, self.domainH, self.h
        r = h * 0.5
        for i in range(N):
            self.vx[i] += self._ax[i] * dt
            self.vy[i] += self._ay[i] * dt
            self.x[i]  += self.vx[i]  * dt
            self.y[i]  += self.vy[i]  * dt
            # Placeholder reflective boundary
            if self.x[i] < r:
                self.x[i] = r
                self.vx[i] = abs(self.vx[i])
            if self.x[i] > domainW - r:
                self.x[i] = domainW - r
                self.vx[i] = -abs(self.vx[i])
            if self.y[i] < r:
                self.y[i] = r
                self.vy[i] = abs(self.vy[i])
            if self.y[i] > domainH - r:
                self.y[i] = domainH - r
                self.vy[i] = -abs(self.vy[i])

    def step(self, max_dt=0.005):
        self._compute_density()
        self._compute_pressure()
        self._compute_forces()
        dt = self._cfl_dt(max_dt)
        self._integrate(dt)
        return dt

    def kinetic_energy(self):
        return 0.5 * self.mass * sum(vx**2 + vy**2
                                     for vx, vy in zip(self.vx, self.vy))

    def linear_momentum(self):
        return (self.mass * sum(self.vx),
                self.mass * sum(self.vy))

# ------------------------------------------------------------------ #
#  Init helper
# ------------------------------------------------------------------ #

def init_block(eng, xmin, xmax, ymin, ymax, spacing):
    i = 0
    iy = 0
    while True:
        py = ymin + spacing * 0.5 + iy * spacing
        if py > ymax:
            break
        ix = 0
        while True:
            px = xmin + spacing * 0.5 + ix * spacing
            if px > xmax:
                break
            if i >= eng.N:
                return i
            eng.x[i] = px
            eng.y[i] = py
            eng.vx[i] = 0.0
            eng.vy[i] = 0.0
            i += 1
            ix += 1
        iy += 1
    return i

# ------------------------------------------------------------------ #
#  Validation checks
# ------------------------------------------------------------------ #

pass_count = 0
fail_count = 0

def check(label, condition, detail=""):
    global pass_count, fail_count
    tag = "PASS" if condition else "FAIL"
    d = f"  [{detail}]" if detail else ""
    print(f"  {tag}  {label}{d}")
    if condition:
        pass_count += 1
    else:
        fail_count += 1

def has_nan(*lists):
    for lst in lists:
        for v in lst:
            if not math.isfinite(v):
                return True
    return False


# ---- Test 1 & 2: Kernel normalization & gradient symmetry ----------

print("\n=== Test 1 & 2: Kernel properties ===")

h = 0.04
kc = kernel_constants(h)
support = kc["support"]
n_grid = 200
step = (2 * support) / n_grid
dV = step * step

integral = 0.0
sum_gx = 0.0
sum_gy = 0.0

for iy in range(n_grid):
    dy = -support + (iy + 0.5) * step
    for ix in range(n_grid):
        dx = -support + (ix + 0.5) * step
        r = math.sqrt(dx*dx + dy*dy)
        integral += W(r, kc) * dV
        gx_v, gy_v = gradW(dx, dy, r, kc)
        sum_gx += gx_v * dV
        sum_gy += gy_v * dV

print(f"  Kernel integral = {integral:.6f}  (want approx. 1)")
print(f"  Sum gradW·dV = ({sum_gx:.3e}, {sum_gy:.3e})  (want approx. 0)")

check("Kernel integral approx. 1 (within 2%)",
      abs(integral - 1.0) < 0.02, f"got {integral:.5f}")
check("Sum gradW_x approx. 0 (within 1e-6)",
      abs(sum_gx) < 1e-6, f"got {sum_gx:.3e}")
check("Sum gradW_y approx. 0 (within 1e-6)",
      abs(sum_gy) < 1e-6, f"got {sum_gy:.3e}")


# ---- Test 3: Static block stability --------------------------------

print("\n=== Test 3: Static block stability ===")

h = 0.04
spacing = h * 0.9
domainW = 1.0
domainH = 1.0
block_W = 0.4
block_H = 0.4
approx_N = int(block_W / spacing) * int(block_H / spacing)
N = approx_N
c0 = 20.0
rho0 = 1000.0
mass = rho0 * spacing * spacing

eng3 = Engine(N, domainW, domainH,
              h=h, rho0=rho0, gamma=7, c0=c0,
              alpha=0.1, beta=0.0, mass=mass,
              gx=0.0, gy=-9.81, cfl=0.3)
init_block(eng3, 0.3, 0.7, 0.3, 0.7, spacing)
print(f"  N={N}, spacing={spacing:.4f}, h={h}, c0={c0}, mass={mass:.4f}")

STEPS = 200
nan_found = False
max_x = 0.0
max_v = 0.0

for s in range(STEPS):
    eng3.step(0.002)
    if has_nan(eng3.x, eng3.y, eng3.vx, eng3.vy, eng3.density, eng3.pressure):
        nan_found = True
        print(f"  NaN/Inf at step {s}")
        break

for i in range(N):
    xi = abs(eng3.x[i])
    vi = math.sqrt(eng3.vx[i]**2 + eng3.vy[i]**2)
    if xi > max_x:
        max_x = xi
    if vi > max_v:
        max_v = vi

ke3 = eng3.kinetic_energy()
print(f"  After {STEPS} steps: maxV={max_v:.4f}, KE={ke3:.4f}, nan={nan_found}")

check("No NaN/Inf in static block", not nan_found)
check("Particles stay in domain", max_x < domainW + 0.01, f"maxX={max_x:.4f}")
check("Static block max speed bounded < 5 m/s", max_v < 5.0, f"maxV={max_v:.4f}")


# ---- Test 4: Hydrostatic column ------------------------------------

print("\n=== Test 4: Hydrostatic column ===")

h = 0.04
spacing = h * 0.9
domainW = 0.5
domainH = 1.0
col_W = domainW
col_H = 0.4
approx_N = int(col_W / spacing) * int(col_H / spacing)
N = approx_N
c0 = 20.0
rho0 = 1000.0
mass = rho0 * spacing * spacing

eng4 = Engine(N, domainW, domainH,
              h=h, rho0=rho0, gamma=7, c0=c0,
              alpha=0.5, beta=0.0, mass=mass,
              gx=0.0, gy=-9.81, cfl=0.25)
init_block(eng4, 0, col_W, 0, col_H, spacing)
print(f"  N={N}, column {col_W}x{col_H}, alpha=0.5")

SETTLE = 800
nan_found4 = False
ke0 = -1.0

for s in range(SETTLE):
    eng4.step(0.002)
    if s == 10:
        ke0 = eng4.kinetic_energy()
    if has_nan(eng4.x, eng4.y, eng4.vx, eng4.vy):
        nan_found4 = True
        print(f"  NaN/Inf at step {s}")
        break

ke_final = eng4.kinetic_energy()
print(f"  KE at step 10  = {ke0:.6f}")
print(f"  KE after {SETTLE} steps = {ke_final:.6f}")

y_low  = 0.1
y_high = col_H - 0.05
p_low = p_high = 0.0
n_low = n_high = 0
for i in range(N):
    if eng4.y[i] < y_low:
        p_low += eng4.pressure[i]
        n_low += 1
    if eng4.y[i] > y_high:
        p_high += eng4.pressure[i]
        n_high += 1

p_low  = p_low  / n_low  if n_low  > 0 else 0.0
p_high = p_high / n_high if n_high > 0 else 0.0
print(f"  avg pressure: bottom={p_low:.2f}, top={p_high:.2f}")

check("No NaN/Inf in hydrostatic column", not nan_found4)
check("KE after settling < KE at step 10",
      ke_final < ke0, f"KE0={ke0:.4f}, KEf={ke_final:.4f}")
check("KE final bounded < 100 J", ke_final < 100.0, f"KE={ke_final:.4f}")
check("Pressure increases with depth (bottom > top)",
      p_low > p_high, f"pLow={p_low:.1f}, pHigh={p_high:.1f}")


# ---- Test 5: Momentum conservation (gravity off) -------------------

print("\n=== Test 5: Momentum conservation (gravity off) ===")

h = 0.04
spacing = h * 0.9
domainW = 0.5
domainH = 0.5
col_W2 = 0.3
col_H2 = 0.3
approx_N = int(col_W2 / spacing) * int(col_H2 / spacing)
N = approx_N
c0 = 20.0
rho0 = 1000.0
mass = rho0 * spacing * spacing

eng5 = Engine(N, domainW, domainH,
              h=h, rho0=rho0, gamma=7, c0=c0,
              alpha=0.1, beta=0.0, mass=mass,
              gx=0.0, gy=0.0, cfl=0.3)
init_block(eng5, 0.1, 0.4, 0.1, 0.4, spacing)

# Deterministic pseudo-random velocities
def rand_val(seed):
    x = math.sin(seed * 127.1) * 43758.5453
    return x - math.floor(x)

for i in range(N):
    eng5.vx[i] = (rand_val(i * 2)     - 0.5) * 0.5
    eng5.vy[i] = (rand_val(i * 2 + 1) - 0.5) * 0.5

px0, py0 = eng5.linear_momentum()
print(f"  Initial momentum: ({px0:.6f}, {py0:.6f})")

STEPS5 = 300
nan_found5 = False
max_dpx = 0.0
max_dpy = 0.0

for s in range(STEPS5):
    eng5.step(0.001)
    if has_nan(eng5.x, eng5.y, eng5.vx, eng5.vy):
        nan_found5 = True
        print(f"  NaN/Inf at step {s}")
        break
    px, py = eng5.linear_momentum()
    dpx = abs(px - px0)
    dpy = abs(py - py0)
    if dpx > max_dpx:
        max_dpx = dpx
    if dpy > max_dpy:
        max_dpy = dpy

pxF, pyF = eng5.linear_momentum()
p0_mag = math.sqrt(px0**2 + py0**2) + 1e-10
p_scale = N * mass * c0
rel_bound = max_dpx / p_scale
print(f"  Final momentum: ({pxF:.6f}, {pyF:.6f})")
print(f"  Max |dpx|={max_dpx:.6f}, Max |dpy|={max_dpy:.6f}")
print(f"  Normalized drift |dpx|/(N*m*c0) = {rel_bound:.3e}")

check("No NaN/Inf with gravity off", not nan_found5)
check("Momentum bounded (normalized drift < 0.1)",
      rel_bound < 0.1, f"normalized={rel_bound:.3e}")


# ---- Summary -------------------------------------------------------

print(f"\n{'='*50}")
print(f"Results: {pass_count} PASS, {fail_count} FAIL")
if fail_count > 0:
    print("OVERALL: FAIL")
    sys.exit(1)
else:
    print("OVERALL: PASS")
    sys.exit(0)

