"""
Choppy Party surface detail textures, generated from scratch (so they are CC0 / our own).

Each output is one tileable JPEG:
  R, G = surface normal X / Y (0.5 = flat), B = albedo detail (0.5 = neutral, multiplied x2 in the shader).
The shader reconstructs normal Z, multiplies the material colour by the detail, and nudges roughness.

usage: python3 gentex.py <outdir> [size]
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
S = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
R = np.random.default_rng(1234)
import zlib
hash = lambda t: zlib.crc32(t.encode())


def fnoise(scale, power=2.0, seed=0, aniso=(1.0, 1.0)):
    """Periodic fractal noise via filtered white noise in the frequency domain."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((S, S))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(S)[:, None] * S * aniso[1]
    fx = np.fft.fftfreq(S)[None, :] * S * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / (f ** power)
    amp *= np.exp(-(f / (S / scale)) ** 2) if scale else 1
    amp[0, 0] = 0
    n = np.real(np.fft.ifft2(F * amp))
    n -= n.min()
    n /= n.max()
    return n


def band(scale_lo, scale_hi, seed=0, aniso=(1.0, 1.0)):
    """Noise with features between two sizes (in pixels)."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal((S, S))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(S)[:, None] * aniso[1]
    fx = np.fft.fftfreq(S)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy) + 1e-9
    lo, hi = 1.0 / scale_hi, 1.0 / scale_lo
    amp = np.where((f >= lo) & (f <= hi), 1.0, 0.0) / np.sqrt(f)
    n = np.real(np.fft.ifft2(F * amp))
    n -= n.min()
    n /= n.max() + 1e-9
    return n


def voronoi(cells, seed=0, jitter=0.85):
    """Tileable Worley noise: returns F1, F2 distances (pixels) and cell id."""
    rng = np.random.default_rng(seed)
    g = S / cells
    pts = []
    for j in range(cells):
        for i in range(cells):
            pts.append(((i + 0.5 + (rng.random() - 0.5) * jitter) * g, (j + 0.5 + (rng.random() - 0.5) * jitter) * g))
    pts = np.array(pts)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    f1 = np.full((S, S), 1e9, np.float32)
    f2 = np.full((S, S), 1e9, np.float32)
    cid = np.zeros((S, S), np.int32)
    for k, (px, py) in enumerate(pts):
        dx = np.abs(xx - px)
        dx = np.minimum(dx, S - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, S - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        cid = np.where(closer, k, cid)
        f1 = np.where(closer, d, f1)
    return f1, f2, cid


def wrap_draw(draw_fn, mode='L', bg=0, ss=1):
    """Draw with PIL on a canvas 3x the size, then fold so strokes crossing edges tile."""
    big = Image.new(mode, (S * 3 * ss, S * 3 * ss), bg)
    d = ImageDraw.Draw(big)
    draw_fn(d, ss)
    a = np.asarray(big, np.float32) / 255.0
    T = S * ss
    out = np.zeros((T, T), np.float32)
    for j in range(3):
        for i in range(3):
            out = np.maximum(out, a[j * T:(j + 1) * T, i * T:(i + 1) * T])
    if ss > 1:
        out = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).resize((S, S), Image.LANCZOS), np.float32) / 255
    return out


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    # wrap-pad so the blur tiles
    p = int(r * 3) + 2
    big = np.pad(np.asarray(im), p, mode='wrap')
    b = Image.fromarray(big).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(b, np.float32)[p:-p, p:-p] / 255.0


def norm01(a):
    a = a - a.min()
    return a / (a.max() + 1e-9)


def save(name, height, detail, strength):
    """Pack one texture: R = height (for bump), G = albedo detail (0.5 neutral), B = roughness variation (0.5 neutral).
    `strength` is how bumpy the surface should read; it is baked into the height range."""
    h = norm01(height.astype(np.float32))
    k = min(1.0, strength / 9.0)
    h = 0.5 + (h - 0.5) * k
    rough = np.clip(0.5 + (0.5 - detail) * 0.8 + (band(1, 4, hash(name) % 1000) - 0.5) * 0.25, 0, 1)
    img = np.stack([h, np.clip(detail, 0, 1), rough], -1)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=90, optimize=True)
    print(name, 'detail mean %.3f sd %.3f' % (float(detail.mean()), float(detail.std())))


def around(a, mean=0.5, sd=0.08):
    a = (a - a.mean()) / (a.std() + 1e-9)
    return np.clip(mean + a * sd, 0, 1)


# ---------- grass: dense blade strokes over soft patches
def grass():
    rng = np.random.default_rng(11)
    def strokes(d, ss):
        for _ in range(int(9000 * (S / 1024) ** 2)):
            x, y = rng.random() * S * 3, rng.random() * S * 3
            ang = -math.pi / 2 + (rng.random() - 0.5) * 1.3
            ln = (10 + rng.random() * 18) * S / 1024
            v = int(110 + rng.random() * 145)
            for k in range(3):
                w = (3 - k) * ss
                x2 = x + math.cos(ang) * ln * (1 - k * 0.15)
                y2 = y + math.sin(ang) * ln * (1 - k * 0.15)
                d.line([(x * ss, y * ss), (x2 * ss, y2 * ss)], fill=int(v * (0.7 + k * 0.15)), width=max(1, int(w)))
    blades = wrap_draw(strokes, ss=1)
    patches = fnoise(S / 6, 1.6, 3)
    h = blades * 0.75 + patches * 0.35
    det = around(blades * 0.6 + patches * 0.7 + band(2, 8, 4) * 0.2, 0.5, 0.11)
    save('grass', h, det, 5.0)


# ---------- dirt: lumpy soil with pebbles
def dirt():
    rng = np.random.default_rng(21)
    lumps = fnoise(S / 3, 1.7, 21)
    fine = band(1.5, 6, 22)
    def pebbles(d, ss):
        for _ in range(int(900 * (S / 1024) ** 2)):
            x, y = rng.random() * S * 3, rng.random() * S * 3
            r = (2 + rng.random() ** 2 * 9) * S / 1024
            v = int(120 + rng.random() * 135)
            d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=v)
    peb = blur(wrap_draw(pebbles), 1.2)
    h = lumps * 0.6 + fine * 0.25 + peb * 0.6
    det = around(lumps * 0.5 + fine * 0.4 + peb * 0.5, 0.5, 0.1)
    save('dirt', h, det, 6.0)


# ---------- cobblestone: rounded voronoi stones and mortar
def cobble():
    f1, f2, cid = voronoi(9, 31, 0.7)
    edge = np.clip((f2 - f1) / (S / 9 * 0.18), 0, 1)
    dome = np.sqrt(edge)
    rng = np.random.default_rng(32)
    tone = rng.random(cid.max() + 1)[cid]
    grain = band(1.5, 5, 33)
    h = dome * 0.85 + grain * 0.15 + fnoise(S / 8, 1.5, 34) * 0.15
    det = around(dome * 0.5 + tone * 0.55 + grain * 0.3 - (1 - edge) ** 4 * 0.6, 0.5, 0.12)
    save('cobble', h, det, 9.0)


# ---------- rock / cliff: strata bands, ridges and cracks
def rock():
    yy = np.mgrid[0:S, 0:S][0] / S
    strata = np.sin((yy * 9 + fnoise(S / 2, 1.8, 41) * 1.6) * math.pi * 2) * 0.5 + 0.5
    ridge = 1 - np.abs(fnoise(S / 4, 1.6, 42) * 2 - 1)
    f1, f2, _ = voronoi(5, 43, 1.0)
    crack = 1 - np.exp(-((f2 - f1) / 6.0) ** 2)
    fine = band(1.5, 6, 44)
    h = strata * 0.35 + ridge * 0.45 + crack * 0.35 + fine * 0.15
    det = around(strata * 0.35 + ridge * 0.4 + crack * 0.6 + fine * 0.25, 0.5, 0.12)
    save('rock', h, det, 8.0)


# ---------- wood planks with grain, seams and nails
def wood():
    rows = 6
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    pw = S / rows
    row = (yy // pw).astype(int)
    rng = np.random.default_rng(51)
    shift = rng.random(rows + 1)[row] * S
    plank_len = S / 2
    u = (xx + shift) % S
    seg = (u // plank_len).astype(int) + row * 4
    tone = rng.random(seg.max() + 1)[seg]
    grain = band(1, 4, 52, aniso=(0.06, 1.0))
    rings = np.sin((yy / pw * 6 + fnoise(S / 3, 1.7, 53, aniso=(0.2, 1)) * 5) * math.pi * 2) * 0.5 + 0.5
    vy = (yy % pw) / pw
    vx = (u % plank_len) / plank_len
    seam = np.minimum(np.clip(vy * pw / 3, 0, 1), np.clip((1 - vy) * pw / 3, 0, 1)) * np.minimum(np.clip(vx * plank_len / 3, 0, 1), np.clip((1 - vx) * plank_len / 3, 0, 1))
    bevel = np.minimum(np.clip(vy * pw / 10, 0, 1), np.clip((1 - vy) * pw / 10, 0, 1))
    h = bevel * 0.6 + grain * 0.25 + rings * 0.1
    det = around(tone * 0.6 + grain * 0.45 + rings * 0.35, 0.52, 0.1) * (0.35 + 0.65 * seam)
    save('wood', h * seam, det, 7.0)


# ---------- metal: panels, seams, rivets, brushed lines
def metal():
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    n = 4
    p = S / n
    vx, vy = (xx % p) / p, (yy % p) / p
    seam = np.minimum.reduce([np.clip(vx * p / 4, 0, 1), np.clip((1 - vx) * p / 4, 0, 1), np.clip(vy * p / 4, 0, 1), np.clip((1 - vy) * p / 4, 0, 1)])
    riv = np.zeros_like(xx)
    for cx in (0.08, 0.92):
        for cy in (0.08, 0.92):
            d = np.sqrt(((vx - cx) * p) ** 2 + ((vy - cy) * p) ** 2)
            riv = np.maximum(riv, np.clip(1 - d / (p * 0.035), 0, 1) ** 0.5)
    brushed = band(1, 3, 61, aniso=(0.02, 1.0))
    rng = np.random.default_rng(62)
    cid = (xx // p).astype(int) + (yy // p).astype(int) * n
    tone = rng.random(n * n)[cid]
    smudge = fnoise(S / 4, 1.6, 63)
    h = seam * 0.7 + riv * 0.5 + brushed * 0.05
    det = around(tone * 0.3 + brushed * 0.35 + smudge * 0.4, 0.52, 0.06) * (0.55 + 0.45 * seam) + riv * 0.08
    save('metal', h, det, 6.0)


# ---------- snow: soft drifts and sparkle
def snow():
    drift = fnoise(S / 2, 1.9, 71)
    soft = band(3, 18, 72)
    rng = np.random.default_rng(73)
    sp = (rng.random((S, S)) > 0.9985).astype(np.float32)
    h = drift * 0.7 + soft * 0.3
    det = around(drift * 0.6 + soft * 0.3, 0.54, 0.04) + sp * 0.35
    save('snow', h, det, 3.0)


# ---------- ceramic tiles with grout
def tiles():
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    n = 8
    p = S / n
    vx, vy = (xx % p) / p, (yy % p) / p
    e = np.minimum.reduce([vx, 1 - vx, vy, 1 - vy]) * p
    tile = np.clip(e / 5, 0, 1)
    bev = np.clip(e / 14, 0, 1)
    rng = np.random.default_rng(81)
    tone = rng.random(n * n)[(xx // p).astype(int) + (yy // p).astype(int) * n]
    h = bev * 0.8 + fnoise(S / 6, 1.8, 82) * 0.05
    det = around(tone * 0.5 + fnoise(S / 5, 1.6, 83) * 0.3, 0.53, 0.05) * (0.45 + 0.55 * tile)
    save('tiles', h, det, 6.0)


# ---------- bricks with mortar
def brick():
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    rows = 12
    bh = S / rows
    bw = S / 6
    row = (yy // bh).astype(int)
    u = (xx + (row % 2) * bw / 2) % S
    vx, vy = (u % bw) / bw, (yy % bh) / bh
    e = np.minimum(np.minimum(vx, 1 - vx) * bw, np.minimum(vy, 1 - vy) * bh)
    b = np.clip(e / 4, 0, 1)
    rng = np.random.default_rng(91)
    cid = (u // bw).astype(int) + row * 7
    tone = rng.random(cid.max() + 1)[cid]
    rough = band(1.5, 6, 92)
    h = np.clip(e / 9, 0, 1) * 0.8 + rough * 0.2
    det = around(tone * 0.6 + rough * 0.4 + fnoise(S / 4, 1.6, 93) * 0.3, 0.52, 0.1) * (0.5 + 0.5 * b)
    save('brick', h, det, 7.0)


# ---------- bark: vertical furrows
def bark():
    furrow = 1 - np.abs(fnoise(S / 6, 1.5, 101, aniso=(1.0, 0.12)) * 2 - 1)
    fine = band(1.5, 5, 102, aniso=(1, 0.3))
    h = furrow * 0.8 + fine * 0.2
    det = around(furrow * 0.7 + fine * 0.3, 0.5, 0.12)
    save('bark', h, det, 9.0)


# ---------- fabric weave
def fabric():
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    k = 2 * math.pi / (S / 128)
    a = np.sin(xx * k) * 0.5 + 0.5
    b = np.sin(yy * k) * 0.5 + 0.5
    check = ((np.floor(xx / (S / 128)) + np.floor(yy / (S / 128))) % 2)
    weave = np.where(check > 0, a, b)
    fuzz = band(1, 3, 111)
    h = weave * 0.7 + fuzz * 0.3
    det = around(weave * 0.5 + fuzz * 0.3 + fnoise(S / 4, 1.6, 112) * 0.4, 0.52, 0.06)
    save('fabric', h, det, 3.0)


# ---------- toy: the faint painted/plastic micro surface for everything else
def toy():
    soft = fnoise(S / 3, 1.7, 121)
    speck = band(1, 3, 122)
    h = soft * 0.6 + speck * 0.4
    det = around(soft * 0.8 + speck * 0.2, 0.5, 0.035)
    save('toy', h, det, 1.6)


# ---------- sand ripples
def sand():
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    warp = fnoise(S / 2, 1.8, 131) * 4
    rip = np.sin((yy / S * 18 + xx / S * 3 + warp) * math.pi * 2) * 0.5 + 0.5
    grain = band(1, 3, 132)
    h = rip * 0.7 + grain * 0.3
    det = around(rip * 0.4 + grain * 0.5 + fnoise(S / 3, 1.7, 133) * 0.4, 0.52, 0.07)
    save('sand', h, det, 3.5)


for f in (grass, dirt, cobble, rock, wood, metal, snow, tiles, brick, bark, fabric, toy, sand):
    f()
