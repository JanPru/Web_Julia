// ==========================================
// HERO D'INICI: núvol de punts a partir d'una foto
// ==========================================
// La foto es mostreja en una graella; cada píxel prou "viu" es converteix en un
// petit traç horitzontal amb relleu (z). Al carregar, els traços surten d'un
// núvol esfèric i s'ordenen fins a formar la foto. Es pot girar arrossegant i
// el ratolí (o el dit) empeny les partícules.

const HERO_PHOTO = 'foto_inici.jpeg';
const HERO_MODEL = { width: 560, height: 420, depthBase: 10, depthRange: 42 };
// Retall de la foto (centre en fraccions de la imatge). Al mòbil, quadrat i centrat a les cares.
const HERO_CROP = {
    wide: { cx: 0.5, cy: 0.5, width: 560, height: 420 },
    narrow: { cx: 0.6, cy: 0.42, width: 460, height: 460 }
};
const HERO_RAMP = ['#2b0f05', '#8a2a0c', '#e0501e', '#ffa02e', '#ffe2b0'];
const HERO_BASE_TILT = 0.12;
const HERO_SWAY = 0.2;
const HERO_STAGGER = 0.45;

const HERO_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aCloud;
layout(location = 2) in vec3 aTarget;
layout(location = 3) in vec2 aMeta;
layout(location = 4) in vec3 aTravel;
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uScale;
uniform float uDist;
uniform float uYaw;
uniform float uTilt;
uniform float uMix;
uniform float uSpread;
uniform float uDash;
uniform float uWidth;
uniform vec2 uPointer;
uniform float uPush;
out float vAcross;
out float vTone;
out float vDepth;

vec3 rotate(vec3 p) {
  float cy = cos(uYaw), sy = sin(uYaw);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float cx = cos(uTilt), sx = sin(uTilt);
  return vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
}

vec2 project(vec3 p) {
  float w = max((uDist - p.z * uScale) / uDist, 0.05);
  return uCenter + vec2(p.x, -p.y) * uScale / w;
}

void main() {
  float tone = aMeta.x;
  float seed = aMeta.y;
  float t = clamp(uMix * (1.0 + ${HERO_STAGGER.toFixed(2)}) - seed * ${HERO_STAGGER.toFixed(2)}, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  vec3 c = mix(aCloud, aTarget, t) + aTravel * sin(3.14159265 * t);
  c *= 1.0 + uSpread * (0.08 + 0.24 * fract(seed * 7.13));

  float halfLen = mix(0.7, uDash, t);
  vec3 a = rotate(c - vec3(halfLen, 0.0, 0.0));
  vec3 b = rotate(c + vec3(halfLen, 0.0, 0.0));
  vec2 pa = project(a);
  vec2 pb = project(b);

  vec2 away = (pa + pb) * 0.5 - uPointer;
  float ad = length(away);
  float fall = 1.0 - smoothstep(0.0, 120.0, ad);
  fall *= fall;
  vec2 shove = away / max(ad, 28.0) * fall * uPush * (8.0 + seed * 14.0);
  pa += shove;
  pb += shove;

  vec2 d = pb - pa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = uWidth + 1.0;
  vec2 p = mix(pa, pb, aCorner.x) + dir * (aCorner.x * 2.0 - 1.0) + nrm * (aCorner.y * hw);

  vAcross = aCorner.y * hw;
  vTone = mix(0.45, tone, t);
  vDepth = clamp(mix(a.z, b.z, aCorner.x) / 600.0 + 0.5, 0.0, 1.0);

  vec2 s = p / uView;
  gl_Position = vec4(s.x * 2.0 - 1.0, 1.0 - s.y * 2.0, 0.0, 1.0);
}`;

const HERO_FS = `#version 300 es
precision highp float;
in float vAcross;
in float vTone;
in float vDepth;
uniform float uWidth;
uniform float uAlpha;
uniform vec3 uRamp[5];
out vec4 outColor;

vec3 ramp(float x) {
  float f = clamp(x, 0.0, 1.0) * 4.0;
  vec3 c = mix(uRamp[0], uRamp[1], clamp(f, 0.0, 1.0));
  c = mix(c, uRamp[2], clamp(f - 1.0, 0.0, 1.0));
  c = mix(c, uRamp[3], clamp(f - 2.0, 0.0, 1.0));
  return mix(c, uRamp[4], clamp(f - 3.0, 0.0, 1.0));
}

void main() {
  float cov = clamp(uWidth - abs(vAcross) + 0.5, 0.0, 1.0);
  float alpha = cov * uAlpha;
  if (alpha <= 0.004) discard;
  outColor = vec4(ramp(0.25 + vTone * 0.6 + vDepth * 0.15), alpha);
}`;

// ---- Foto -> traços ----
function heroSmooth(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

function heroSamplePhoto(img, cols, rows, crop) {
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Retall "cover" a la proporció del model, centrat al punt d'interès
    const aspect = crop.width / crop.height;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (sw / sh > aspect) sw = sh * aspect; else sh = sw / aspect;
    const sx = Math.min(img.naturalWidth - sw, Math.max(0, crop.cx * img.naturalWidth - sw / 2));
    const sy = Math.min(img.naturalHeight - sh, Math.max(0, crop.cy * img.naturalHeight - sh / 2));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    return ctx.getImageData(0, 0, cols, rows).data;
}

// Difuminat ràpid (3 passades de caixa ≈ gaussiana) per al contrast local
function heroBlur(src, cols, rows, radius) {
    let a = Float32Array.from(src);
    let b = new Float32Array(a.length);
    const pass = (from, to, horizontal) => {
        const len = horizontal ? cols : rows;
        const lines = horizontal ? rows : cols;
        for (let l = 0; l < lines; l++) {
            for (let i = 0; i < len; i++) {
                let sum = 0;
                let n = 0;
                for (let k = Math.max(0, i - radius); k <= Math.min(len - 1, i + radius); k++) {
                    sum += horizontal ? from[l * cols + k] : from[k * cols + l];
                    n++;
                }
                to[horizontal ? l * cols + i : i * cols + l] = sum / n;
            }
        }
    };
    for (let i = 0; i < 3; i++) {
        pass(a, b, true);
        pass(b, a, false);
    }
    return a;
}

function heroBuildTargets(data, cols, rows, crop) {
    const { depthBase, depthRange } = HERO_MODEL;
    const W = crop.width;
    const H = crop.height;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const px = i => [data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255];
    const dist = (a, b) => Math.sqrt(0.25 * (a[0] - b[0]) ** 2 + 0.5 * (a[1] - b[1]) ** 2 + 0.25 * (a[2] - b[2]) ** 2);

    // Color de fons: mediana de les cantonades superiors
    const median = (vals) => vals.sort((a, b) => a - b)[vals.length >> 1];
    const samples = [[], [], []];
    const cw = Math.round(cols * 0.15);
    const ch = Math.round(rows * 0.12);
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            for (const xx of [x, cols - 1 - x]) {
                const c = px(y * cols + xx);
                samples[0].push(c[0]); samples[1].push(c[1]); samples[2].push(c[2]);
            }
        }
    }
    const bg = samples.map(median);

    const lums = new Float32Array(cols * rows);
    for (let i = 0; i < lums.length; i++) {
        lums[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    }
    const localMean = heroBlur(lums, cols, rows, Math.max(2, Math.round(cols / 40)));

    const targets = [];
    const tones = [];
    const cell = W / (cols - 1);
    for (let y = 0; y < rows; y++) {
        const my = H / 2 - (y / (rows - 1)) * H;
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const c = px(i);
            const lum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
            const subject = heroSmooth(0.035, 0.2, dist(c, bg));
            const edge = heroSmooth(0.018, 0.11, Math.max(
                dist(c, px(x > 0 ? i - 1 : i)),
                dist(c, px(x + 1 < cols ? i + 1 : i)),
                dist(c, px(y > 0 ? i - cols : i)),
                dist(c, px(y + 1 < rows ? i + cols : i))
            ));
            // Contrast local (les cares es llegeixen millor en una foto sencera),
            // sense el fons i amb les vores esvaïdes
            const u = (x / (cols - 1)) * 2 - 1;
            const v = (y / (rows - 1)) * 2 - 1;
            const vignette = 1 - heroSmooth(0.72, 1.08, Math.hypot(u, v));
            const local = 0.5 + (lum - localMean[i]) * 2.2 + (lum - 0.45) * 0.6;
            const energy = Math.min(1, Math.max(0, local)) * vignette * subject;
            const threshold = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
            if (energy <= threshold) continue;

            const z = depthBase + Math.min(1, Math.max(0, 0.62 * energy + 0.23 * subject + 0.15 * edge)) * depthRange;
            targets.push((x / (cols - 1)) * W - W / 2, my, z);
            tones.push(0.2 + energy * 0.8);
        }
    }
    return { targets: new Float32Array(targets), tones, dash: cell * 0.36 };
}

function heroRandom(seed) {
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967295;
    };
}

// ---- WebGL ----
function heroCompile(gl, vs, fs) {
    const make = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    return prog;
}

function initHeroCloud() {
    const hero = document.getElementById('heroCloud');
    const canvas = document.getElementById('heroCanvas');
    if (!hero || !canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: true });
    if (!gl) {
        hero.classList.add('no-webgl');
        return;
    }

    let program;
    try {
        program = heroCompile(gl, HERO_VS, HERO_FS);
    } catch (err) {
        console.error("Hero shader error:", err);
        hero.classList.add('no-webgl');
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const uni = {};
    ['uView', 'uCenter', 'uScale', 'uDist', 'uYaw', 'uTilt', 'uMix', 'uSpread', 'uDash', 'uWidth',
        'uPointer', 'uPush', 'uAlpha', 'uRamp'].forEach(n => { uni[n] = gl.getUniformLocation(program, n); });

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instanceAttr = (loc, size) => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(loc, 1);
        return buf;
    };
    const cloudBuf = instanceAttr(1, 3);
    const targetBuf = instanceAttr(2, 3);
    const metaBuf = instanceAttr(3, 2);
    const travelBuf = instanceAttr(4, 3);

    gl.useProgram(program);
    gl.uniform3fv(uni.uRamp, HERO_RAMP.flatMap(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // ---- State ----
    const state = {
        count: 0,
        dash: 1,
        mix: 0,
        alpha: 0,
        spread: 0,
        spreadTarget: 0,
        yaw: 0,
        yawVel: 0,
        tilt: HERO_BASE_TILT,
        push: 0,
        pointer: [-1e5, -1e5],
        pointerTravel: 0,
        pointerSpeed: 0,
        lastPointer: null,
        dragging: false,
        dragX: 0,
        dragY: 0,
        view: [1, 1],
        center: [0, 0],
        scale: 1,
        dpr: 1,
        model: HERO_CROP.wide,
        start: 0,
        last: 0,
        morphStart: null,
        running: false,
        raf: 0
    };

    const uploadParticles = ({ targets, tones, dash }) => {
        const n = targets.length / 3;
        const rand = heroRandom(7);
        const cloud = new Float32Array(n * 3);
        const travel = new Float32Array(n * 3);
        const meta = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(rand() * 2 - 1);
            const r = 235 + rand() * 130;
            cloud[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
            cloud[i * 3 + 1] = Math.cos(phi) * r * 0.8;
            cloud[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
            travel[i * 3] = (rand() - 0.5) * 60;
            travel[i * 3 + 1] = (rand() - 0.5) * 60;
            travel[i * 3 + 2] = rand() * 80;
            meta[i * 2] = tones[i];
            meta[i * 2 + 1] = rand();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuf);
        gl.bufferData(gl.ARRAY_BUFFER, cloud, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, targetBuf);
        gl.bufferData(gl.ARRAY_BUFFER, targets, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
        gl.bufferData(gl.ARRAY_BUFFER, meta, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, travelBuf);
        gl.bufferData(gl.ARRAY_BUFFER, travel, gl.STATIC_DRAW);
        state.count = n;
        state.dash = dash;
    };

    // ---- Layout ----
    const layout = () => {
        const rect = hero.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        state.dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(rect.width * state.dpr);
        canvas.height = Math.round(rect.height * state.dpr);
        state.view = [rect.width, rect.height];

        const W = state.model.width;
        const H = state.model.height;
        if (rect.width <= 700) {
            const mast = hero.querySelector('.hc-mast').getBoundingClientRect();
            const nav = hero.querySelector('.hc-nav').getBoundingClientRect();
            const top = mast.bottom - rect.top;
            const bottom = nav.top - rect.top;
            const avail = Math.max(160, bottom - top);
            state.scale = Math.min((avail * 0.95) / H, (rect.width - 12) / W);
            state.center = [rect.width / 2, (top + bottom) / 2];
        } else {
            state.scale = Math.min((rect.height * 0.8) / H, (rect.width * 0.62) / W);
            state.center = [rect.width / 2, rect.height * 0.47];
        }
    };

    // ---- Loop ----
    const frame = (now) => {
        state.raf = 0;
        if (!state.running) return;
        const time = now / 1000;
        const dt = state.last ? Math.min(0.1, time - state.last) : 0;
        state.last = time;

        // Fade-in i morph núvol -> foto
        state.alpha = Math.min(1, state.alpha + dt / 0.7);
        if (state.morphStart !== null) {
            const p = Math.min(1, (time - state.morphStart) / 2.6);
            state.mix = reducedMotion ? 1 : p;
        }

        // Rotació: inèrcia + retorn suau + balanceig
        if (!state.dragging) {
            state.yaw += state.yawVel * dt;
            state.yawVel *= Math.exp(-3 * dt);
            if (state.mix >= 1) state.yaw += (0 - state.yaw) * (1 - Math.exp(-0.9 * dt));
            state.tilt += (HERO_BASE_TILT - state.tilt) * (1 - Math.exp(-2 * dt));
        }
        const cloudSpin = state.mix < 1 && !reducedMotion ? time * 0.25 * (1 - state.mix) : 0;
        const sway = reducedMotion ? 0 : Math.sin((time - state.start) * 0.32) * HERO_SWAY;

        // Empenta segons la velocitat del punter
        const speed = dt > 0 ? state.pointerTravel / dt : 0;
        state.pointerTravel = 0;
        state.pointerSpeed += (speed - state.pointerSpeed) * (1 - Math.exp(-10 * dt));
        const pushTarget = 0.8 * (1 - Math.exp(-Math.min(3500, state.pointerSpeed) / 700));
        const rate = pushTarget > state.push ? 18 : 5;
        state.push += (pushTarget - state.push) * (1 - Math.exp(-rate * dt));

        state.spread += (state.spreadTarget - state.spread) * (1 - Math.exp(-4 * dt));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (state.count) {
            gl.useProgram(program);
            gl.bindVertexArray(vao);
            gl.uniform2f(uni.uView, state.view[0], state.view[1]);
            gl.uniform2f(uni.uCenter, state.center[0], state.center[1]);
            gl.uniform1f(uni.uScale, state.scale);
            gl.uniform1f(uni.uDist, 2400);
            gl.uniform1f(uni.uYaw, state.yaw + sway + cloudSpin);
            gl.uniform1f(uni.uTilt, state.tilt);
            gl.uniform1f(uni.uMix, state.mix);
            gl.uniform1f(uni.uSpread, state.spread);
            gl.uniform1f(uni.uDash, state.dash);
            gl.uniform1f(uni.uWidth, 0.72 * Math.min(1, Math.sqrt(state.scale / 1.2)));
            gl.uniform2f(uni.uPointer, state.pointer[0], state.pointer[1]);
            gl.uniform1f(uni.uPush, state.push);
            gl.uniform1f(uni.uAlpha, state.alpha);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, state.count);
        }
        state.raf = requestAnimationFrame(frame);
    };

    const homeEl = document.getElementById('home');
    const updateRunning = () => {
        const shouldRun = homeEl.classList.contains('active') && !document.hidden;
        if (shouldRun && !state.running) {
            state.running = true;
            state.last = 0;
            layout();
            state.raf = requestAnimationFrame(frame);
        } else if (!shouldRun && state.running) {
            state.running = false;
            cancelAnimationFrame(state.raf);
            state.raf = 0;
        }
    };

    // ---- Interaction ----
    const local = (e) => {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const feedPointer = (e) => {
        const p = local(e);
        if (state.lastPointer) {
            state.pointerTravel += Math.min(240, Math.hypot(p[0] - state.lastPointer[0], p[1] - state.lastPointer[1]));
        }
        state.lastPointer = p;
        state.pointer = p;
    };

    const resetPointer = () => {
        state.lastPointer = null;
        state.pointer = [-1e5, -1e5];
    };

    hero.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.hc-nav')) return;
        state.dragging = true;
        state.dragX = e.clientX;
        state.dragY = e.clientY;
        state.yawVel = 0;
        hero.classList.add('is-dragging');
        if (e.pointerType !== 'touch') hero.setPointerCapture(e.pointerId);
        feedPointer(e);
    });

    hero.addEventListener('pointermove', (e) => {
        feedPointer(e);
        if (!state.dragging) return;
        const dx = e.clientX - state.dragX;
        const dy = e.clientY - state.dragY;
        state.dragX = e.clientX;
        state.dragY = e.clientY;
        state.yaw += dx * 0.006;
        state.yawVel = state.yawVel * 0.6 + (dx * 0.006) * 60 * 0.4;
        if (e.pointerType !== 'touch') {
            state.tilt = Math.max(-0.5, Math.min(0.7, state.tilt + dy * 0.004));
        }
    });

    const endDrag = () => {
        state.dragging = false;
        hero.classList.remove('is-dragging');
    };
    hero.addEventListener('pointerup', (e) => {
        endDrag();
        if (e.pointerType === 'touch') resetPointer();
    });
    hero.addEventListener('pointercancel', () => { endDrag(); resetPointer(); });
    hero.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') resetPointer(); });

    hero.querySelectorAll('.hc-item').forEach(btn => {
        btn.addEventListener('pointerenter', () => { state.spreadTarget = 1; });
        btn.addEventListener('pointerleave', () => { state.spreadTarget = 0; });
        btn.addEventListener('focus', () => { state.spreadTarget = 1; });
        btn.addEventListener('blur', () => { state.spreadTarget = 0; });
        btn.addEventListener('click', () => {
            state.spreadTarget = 0;
            navigateTo(btn.dataset.go);
        });
    });

    new ResizeObserver(() => { if (state.running) layout(); }).observe(hero);
    new MutationObserver(updateRunning).observe(homeEl, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', updateRunning);

    // ---- Load photo ----
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
        const small = window.innerWidth <= 700;
        const crop = small ? HERO_CROP.narrow : HERO_CROP.wide;
        const cols = small ? 200 : 270;
        const rows = Math.round(cols * crop.height / crop.width);
        state.model = crop;
        uploadParticles(heroBuildTargets(heroSamplePhoto(img, cols, rows, crop), cols, rows, crop));
        layout();
        state.start = performance.now() / 1000;
        state.morphStart = state.start + (reducedMotion ? 0 : 0.6);
        hero.classList.add('is-ready');
        updateRunning();
    };
    img.onerror = () => {
        console.warn("No s'ha pogut carregar la foto d'inici:", HERO_PHOTO);
        hero.classList.add('no-webgl');
    };
    img.src = HERO_PHOTO;
}

document.addEventListener('DOMContentLoaded', initHeroCloud);
