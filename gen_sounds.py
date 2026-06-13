#!/usr/bin/env python3
"""
Generate tennis game sound effects as 44100 Hz 16-bit mono WAV files.

Output: sounds/hit.wav  bounce.wav  net.wav
        sounds/point_win.wav  point_lose.wav  fault.wav
        sounds/hit_flat.wav  hit_topspin.wav  hit_slice.wav
        sounds/hit_soft.wav  hit_smash.wav
"""

import wave, struct, math, random, os

SR = 44100
random.seed(7)

os.makedirs('sounds', exist_ok=True)


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    scale = 0.88 / peak
    packed = bytearray()
    for s in samples:
        v = max(-32767, min(32767, int(s * scale * 32767)))
        packed += struct.pack('<h', v)
    with wave.open(path, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(bytes(packed))


# ---------------------------------------------------------------------------
# DSP helpers
# ---------------------------------------------------------------------------

def _biquad(b, a, samples):
    b0,b1,b2 = b; a1,a2 = a[1],a[2]
    x1=x2=y1=y2=0.0; out=[]
    for x0 in samples:
        y0 = b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2
        out.append(y0); x2=x1; x1=x0; y2=y1; y1=y0
    return out

def bandpass(samples, freq, q):
    w0 = 2*math.pi*freq/SR
    sw = math.sin(w0); cw = math.cos(w0)
    alpha = sw/(2*q); a0 = 1+alpha
    return _biquad([sw/2/a0, 0, -sw/2/a0],
                   [1, -2*cw/a0, (1-alpha)/a0], samples)

def lowpass(samples, freq, q=0.707):
    w0=2*math.pi*freq/SR; cw=math.cos(w0); sw=math.sin(w0)
    alpha=sw/(2*q); a0=1+alpha
    return _biquad([(1-cw)/2/a0, (1-cw)/a0, (1-cw)/2/a0],
                   [1, -2*cw/a0, (1-alpha)/a0], samples)

def noise(n):
    return [random.gauss(0, 0.45) for _ in range(n)]

def sine_wave(freq, n, phase=0.0):
    return [math.sin(2*math.pi*freq*i/SR + phase) for i in range(n)]

def t_axis(n):
    return [i/SR for i in range(n)]

def smix(layers, n=None):
    if n is None:
        n = max(len(s) for s,_ in layers)
    out = [0.0]*n
    for sig, gain in layers:
        for i, v in enumerate(sig):
            out[i] += v * gain
    return out


# ---------------------------------------------------------------------------
# Sounds
# ---------------------------------------------------------------------------

def gen_hit(path='sounds/hit.wav'):
    """
    Racket striking ball: fast percussive pop.
    Two bandpass noise layers (string resonance + body impact) + low sine thud.
    """
    n = int(SR * 0.090)
    t = t_axis(n)
    ns = noise(n)

    # String resonance (~1 kHz tight bandpass)
    strings  = bandpass(ns, 1100, 1.6)
    e_str    = [math.exp(-ti/0.016) for ti in t]
    layer1   = [s*e for s,e in zip(strings, e_str)]

    # Ball body impact (~450 Hz)
    body     = bandpass(ns, 450, 1.2)
    e_body   = [math.exp(-ti/0.028) for ti in t]
    layer2   = [s*e for s,e in zip(body, e_body)]

    # Low thud sine (~210 Hz)
    thud     = sine_wave(210, n)
    e_thud   = [math.exp(-ti/0.038) for ti in t]
    layer3   = [s*e for s,e in zip(thud, e_thud)]

    write_wav(path, smix([(layer1, 0.55), (layer2, 0.45), (layer3, 0.18)]))
    print(f'  {path}')


def gen_bounce(path='sounds/bounce.wav'):
    """Ball on hard court: short low thud."""
    n = int(SR * 0.080)
    t = t_axis(n)
    ns = noise(n)

    impact   = bandpass(ns, 320, 1.1)
    e_imp    = [math.exp(-ti/0.018) for ti in t]
    layer1   = [s*e for s,e in zip(impact, e_imp)]

    # Slight detune for hollow ball feel
    thud     = [0.5*(a+b) for a,b in zip(sine_wave(125, n), sine_wave(108, n))]
    e_thud   = [math.exp(-ti/0.034) for ti in t]
    layer2   = [s*e for s,e in zip(thud, e_thud)]

    write_wav(path, smix([(layer1, 0.55), (layer2, 0.30)]))
    print(f'  {path}')


def gen_net(path='sounds/net.wav'):
    """Ball into net: soft low-frequency thud with net vibration tail."""
    n = int(SR * 0.140)
    t = t_axis(n)
    ns = noise(n)

    impact   = bandpass(ns, 195, 0.7)
    e_imp    = [math.exp(-ti/0.042) for ti in t]
    layer1   = [s*e for s,e in zip(impact, e_imp)]

    vib      = sine_wave(82, n)
    # Slight soft attack so the vibration doesn't click
    e_vib    = [math.exp(-ti/0.065) * (1 - math.exp(-ti/0.004)) for ti in t]
    layer2   = [s*e for s,e in zip(vib, e_vib)]

    write_wav(path, smix([(layer1, 0.50), (layer2, 0.28)]))
    print(f'  {path}')


def gen_point_win(path='sounds/point_win.wav'):
    """Ascending tone sweep: 440 → 880 Hz."""
    dur = 0.280
    n = int(SR * dur)
    t = t_axis(n)

    def sweep(f0, f1):
        sig = []; phase = 0.0
        for ti in t:
            freq = f0 * (f1/f0)**(ti/dur)
            sig.append(math.sin(phase))
            phase += 2*math.pi*freq/SR
        return sig

    sig  = sweep(440, 880)
    sig2 = sweep(660, 1320)

    env  = []
    fade_start = dur - 0.065
    for ti in t:
        att  = min(ti/0.012, 1.0)
        fade = max(0.0, 1.0 - (ti - fade_start)/0.065) if ti > fade_start else 1.0
        env.append(att * fade)

    result = [(a + 0.38*b)*e for a,b,e in zip(sig, sig2, env)]
    write_wav(path, result)
    print(f'  {path}')


def gen_point_lose(path='sounds/point_lose.wav'):
    """Descending tone sweep: 330 → 175 Hz with exp decay."""
    dur = 0.260
    n = int(SR * dur)
    t = t_axis(n)

    sig = []; phase = 0.0
    for ti in t:
        freq = 330 * (175/330)**(ti/dur)
        sig.append(math.sin(phase))
        phase += 2*math.pi*freq/SR

    env = [min(ti/0.010, 1.0) * math.exp(-ti/0.18) for ti in t]
    write_wav(path, [a*e for a,e in zip(sig, env)])
    print(f'  {path}')


def gen_fault(path='sounds/fault.wav'):
    """Short buzzy descending sawtooth: 200 → 120 Hz, low-passed."""
    dur = 0.195
    n = int(SR * dur)
    t = t_axis(n)

    sig = []; phase = 0.0
    for ti in t:
        freq = 200 * (120/200)**(ti/dur)
        sig.append(((phase/(2*math.pi)) % 1.0)*2 - 1)
        phase += 2*math.pi*freq/SR

    sig = lowpass(sig, 750)
    env = [min(ti/0.008, 1.0) * math.exp(-ti/0.11) for ti in t]
    write_wav(path, [s*e for s,e in zip(sig, env)])
    print(f'  {path}')


# ---------------------------------------------------------------------------
# Differentiated hit sounds
# ---------------------------------------------------------------------------

def _thump(freq, n, t, decay, gain=1.0):
    """Sine fundamental + two harmonics at decreasing amplitude & faster decay."""
    s1 = sine_wave(freq,       n); e1 = [math.exp(-ti/decay)        for ti in t]
    s2 = sine_wave(freq*1.85,  n); e2 = [math.exp(-ti/(decay*0.55)) for ti in t]
    s3 = sine_wave(freq*3.1,   n); e3 = [math.exp(-ti/(decay*0.28)) for ti in t]
    return [(s1[i]*e1[i] + s2[i]*e2[i]*0.38 + s3[i]*e3[i]*0.16) * gain for i in range(n)]

def _texture(ns, freq, q, decay, n, t, gain=1.0):
    """Low-Q bandpass noise — string contact texture, not rattly."""
    filt = bandpass(ns, freq, q)
    env  = [math.exp(-ti/decay) for ti in t]
    return [filt[i]*env[i]*gain for i in range(n)]

def _click(ns, n, t, gain=1.0):
    """1–3 ms high-frequency transient: percussive attack without ringing."""
    filt = bandpass(ns, 1600, 0.45)
    env  = [math.exp(-ti/0.002) for ti in t]
    return [filt[i]*env[i]*gain for i in range(n)]


def gen_hit_flat(path='sounds/hit_flat.wav'):
    """
    Flat drive / flat serve: punchy 'thwack'.
    Dominated by a 270 Hz fundamental thump — ball compressing at maximum speed.
    Brief high-freq click gives attack bite without ringing.
    """
    n = int(SR * 0.070)
    t = t_axis(n)
    ns = noise(n)

    body    = _thump(270, n, t, decay=0.020)
    texture = _texture(ns, 560, 0.60, 0.012, n, t)
    click   = _click(ns, n, t)

    write_wav(path, smix([(body, 0.80), (texture, 0.30), (click, 0.12)]))
    print(f'  {path}')


def gen_hit_topspin(path='sounds/hit_topspin.wav'):
    """
    Topspin / kick serve: solid 'thump' — the ball digs into the strings.
    Slightly rounder than flat (lower fundamental, no click), with a soft
    high-freq string-roll layer that has a brief delayed onset.
    """
    n = int(SR * 0.085)
    t = t_axis(n)
    ns  = noise(n)
    ns2 = noise(n)

    body    = _thump(240, n, t, decay=0.026)
    texture = _texture(ns, 490, 0.58, 0.016, n, t)

    # Brush layer: a second noise stream, deliberately low amplitude, onset-delayed
    brush = bandpass(ns2, 720, 0.50)
    e_br  = [math.exp(-ti/0.018) * (1 - math.exp(-ti/0.007)) for ti in t]
    layer_br = [brush[i]*e_br[i] for i in range(n)]

    write_wav(path, smix([(body, 0.78), (texture, 0.28), (layer_br, 0.14)]))
    print(f'  {path}')


def gen_hit_slice(path='sounds/hit_slice.wav'):
    """
    Slice / slice serve: 'chop' — strings graze across the back of the ball.
    Lower frequency than flat (less compression), longer string contact,
    no click. The grazing noise sits around 420 Hz for a dull 'thock'.
    """
    n = int(SR * 0.095)
    t = t_axis(n)
    ns = noise(n)

    body    = _thump(210, n, t, decay=0.030)
    # Wider, longer texture — the sideways brush lingers
    texture = _texture(ns, 420, 0.52, 0.022, n, t)

    write_wav(path, smix([(body, 0.72), (texture, 0.38)]))
    print(f'  {path}')


def gen_hit_soft(path='sounds/hit_soft.wav'):
    """
    Dropshot / lob / drop volley / touch overhead: delicate 'pop'.
    Low energy, soft attack (1-exp onset), no click.  The ball barely
    dents the strings — mostly rubber bounce at ~160 Hz.
    """
    n = int(SR * 0.100)
    t = t_axis(n)
    ns = noise(n)

    body  = _thump(165, n, t, decay=0.038)
    # Soft onset to remove click
    e_bod = [math.exp(-ti/0.038) * (1 - math.exp(-ti/0.006)) for ti in t]
    body_soft = [sine_wave(165, n)[i]*e_bod[i] for i in range(n)]

    texture = _texture(ns, 340, 0.48, 0.020, n, t)
    e_tex   = [math.exp(-ti/0.020) * (1 - math.exp(-ti/0.006)) for ti in t]
    texture_soft = [texture[i]*e_tex[i] for i in range(n)]

    write_wav(path, smix([(body_soft, 0.65), (texture_soft, 0.28)]))
    print(f'  {path}')


def gen_hit_smash(path='sounds/hit_smash.wav'):
    """
    Smash overhead / punch volley: loudest, hardest thud.
    290 Hz fundamental with strong harmonic stack, clear attack click.
    Fastest decay of all shots — maximum energy transfer, minimum dwell.
    """
    n = int(SR * 0.075)
    t = t_axis(n)
    ns = noise(n)

    body    = _thump(290, n, t, decay=0.016)
    texture = _texture(ns, 620, 0.65, 0.010, n, t)
    click   = _click(ns, n, t)

    write_wav(path, smix([(body, 0.85), (texture, 0.32), (click, 0.18)]))
    print(f'  {path}')


# ---------------------------------------------------------------------------
# Crowd sounds  (replace point_win / point_lose)
# ---------------------------------------------------------------------------

def _applause_env(n, dur, seed, claps_per_sec, n_strands):
    """
    Build an amplitude-modulation envelope that simulates overlapping claps.
    Returns a list of length n: the sum of many short exponential bursts
    at staggered random times, one 'strand' per simulated person in the crowd.
    """
    random.seed(seed)
    env = [0.0] * n
    for _ in range(n_strands):
        t_clap = random.uniform(0, 0.08)   # each person starts slightly off-beat
        while t_clap < dur:
            idx = int(t_clap * SR)
            amp = random.uniform(0.25, 1.0)
            decay = random.uniform(0.010, 0.022) * SR   # samples
            window = int(decay * 8)
            for j in range(min(window, n - idx)):
                if idx + j < n:
                    env[idx + j] += amp * math.exp(-j / decay)
            t_clap += (1.0 / claps_per_sec) * random.uniform(0.7, 1.35)
    return env


def gen_crowd_cheer(path='sounds/point_win.wav'):
    """
    Enthusiastic crowd response: layered applause wash + crowd roar.
    Build-up burst → sustained cheer → quick fade.
    """
    dur = 1.30
    n = int(SR * dur)
    t = t_axis(n)

    # --- Clap layer: two bandpass noise channels at different freqs, AM'd by applause pattern ---
    ns1 = noise(n);  ns2 = noise(n)
    clap_hi  = bandpass(ns1, 2400, 0.75)   # high-freq clap snap
    clap_mid = bandpass(ns2, 1300, 0.85)   # mid-freq clap body

    # Dense clapping pattern: ~12 claps/sec/strand × 14 strands = packed crowd
    ap_env = _applause_env(n, dur, seed=13, claps_per_sec=11, n_strands=14)
    # Normalise envelope so it sits at a usable level
    ap_peak = max(ap_env) or 1.0
    ap_env  = [v / ap_peak for v in ap_env]
    # Overall swell: fast attack, sustained, gentle fade
    swell = [min(ti/0.15, 1.0) * (max(0.0, (dur - ti)/0.35) if ti > dur-0.35 else 1.0) for ti in t]

    clap_layer = [(clap_hi[i]*0.55 + clap_mid[i]*0.45) * ap_env[i] * swell[i] for i in range(n)]

    # --- Crowd roar: low-passed noise, models collective voice ---
    roar_ns = noise(n)
    roar = lowpass(lowpass(roar_ns, 700), 400)   # twice for smoother character
    roar_env = [min(ti/0.30, 1.0) * (max(0.0, (dur - ti)/0.30) if ti > dur-0.30 else 1.0) for ti in t]
    roar_layer = [roar[i] * roar_env[i] * 0.35 for i in range(n)]

    # --- Cheer tone: a warm "ahhh" chord (crowd voices) ---
    cheer_freqs = [320, 410, 510, 640, 760]
    cheer_sig = [0.0]*n
    for freq in cheer_freqs:
        ph = random.uniform(0, 6.28)
        s  = sine_wave(freq, n, ph)
        for i in range(n): cheer_sig[i] += s[i] * 0.018
    cheer_env = [min(ti/0.25, 1.0) * (max(0.0, (dur-ti)/0.35) if ti > dur-0.35 else 1.0) for ti in t]
    cheer_layer = [cheer_sig[i] * cheer_env[i] for i in range(n)]

    result = [clap_layer[i] + roar_layer[i] + cheer_layer[i] for i in range(n)]
    write_wav(path, result)
    print(f'  {path}')


def gen_crowd_groan(path='sounds/point_lose.wav'):
    """
    Polite applause + collective 'aww': shorter, quieter, subdued.
    Sparser clapping, no cheer roar, ends quickly.
    """
    dur = 0.80
    n = int(SR * dur)
    t = t_axis(n)

    ns1 = noise(n);  ns2 = noise(n)
    clap_hi  = bandpass(ns1, 2200, 0.70)
    clap_mid = bandpass(ns2, 1100, 0.80)

    # Sparser pattern: ~7 claps/sec × 9 strands (thinner crowd response)
    ap_env = _applause_env(n, dur, seed=99, claps_per_sec=7, n_strands=9)
    ap_peak = max(ap_env) or 1.0
    ap_env  = [v / ap_peak for v in ap_env]
    swell = [min(ti/0.10, 1.0) * (max(0.0, (dur-ti)/0.40) if ti > dur-0.40 else 1.0) for ti in t]

    clap_layer = [(clap_hi[i]*0.50 + clap_mid[i]*0.50) * ap_env[i] * swell[i] for i in range(n)]

    # Soft crowd murmur (lower level than cheer)
    murmur_ns = noise(n)
    murmur = lowpass(lowpass(murmur_ns, 500), 280)
    murmur_env = [min(ti/0.12, 1.0) * (max(0.0, (dur-ti)/0.35) if ti > dur-0.35 else 1.0) for ti in t]
    murmur_layer = [murmur[i] * murmur_env[i] * 0.18 for i in range(n)]

    # Collective 'aww': descending tone
    aww_sig = []
    phase = 0.0
    f0, f1 = 380.0, 260.0
    for ti in t:
        freq = f0 * (f1/f0)**(ti/dur)
        aww_sig.append(math.sin(phase) * 0.025)
        phase += 2*math.pi*freq/SR
    aww_env = [min(ti/0.08, 1.0) * math.exp(-ti/0.45) for ti in t]
    aww_layer = [aww_sig[i]*aww_env[i] for i in range(n)]

    result = [clap_layer[i] + murmur_layer[i] + aww_layer[i] for i in range(n)]
    write_wav(path, result)
    print(f'  {path}')


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

print('Generating sounds...')
gen_hit()
gen_bounce()
gen_net()
gen_fault()
gen_hit_flat()
gen_hit_topspin()
gen_hit_slice()
gen_hit_soft()
gen_hit_smash()
gen_crowd_cheer()    # → point_win.wav
gen_crowd_groan()    # → point_lose.wav
print('Done.')
