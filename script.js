'use strict';
// =========================================================
// Переменная облачность — логика страницы
//  1. Небо: море облаков + переливающаяся аура (WebGL-шейдер)
//  2. Главы: смена палитры, шкала внизу, счётчик сверху
//  3. Оглавление, цитата, появление блоков
// =========================================================

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;

/* ---------------------------------------------------------
   Палитры ауры для каждой главы.
   a — ядро, b — середина, c — край, sky — оттенок неба.
   center — где висит аура (0,0 — центр экрана), size — размер,
   glow — яркость, cloud — сколько облаков, dark — насколько
   они тёмные, rain — дождь, horizon — высота «моря облаков».
   --------------------------------------------------------- */
const PALETTES = {
    // Цвета взяты из самого мультфильма: вечернее небо, тёплые персиковые и розовые облака,
    // серо-синяя туча Гаса. Яркость занижена, чтобы текст на фоне читался.
    hero:    { a: '#ffe2b0', b: '#ffa38a', c: '#7f8cf2', sky: '#18244f', center: [0, 0.10],      size: 0.44, glow: 0.62, cloud: 0.50, dark: 0.0,  rain: 0, horizon: -0.36 },
    quote:   { a: '#ffe2b0', b: '#ffa38a', c: '#7f8cf2', sky: '#18244f', center: [0.62, 0.30],  size: 0.30, glow: 0.30, cloud: 0.45, dark: 0.0,  rain: 0, horizon: -0.34 },
    world:   { a: '#ffe4ee', b: '#ffa8c6', c: '#9aa6ff', sky: '#1b2552', center: [0.58, 0.26],  size: 0.28, glow: 0.42, cloud: 0.55, dark: 0.0,  rain: 0, horizon: -0.24 },
    gus:     { a: '#e6ecfb', b: '#8193bd', c: '#4a5594', sky: '#121b3a', center: [-0.58, 0.26], size: 0.26, glow: 0.34, cloud: 0.90, dark: 0.45, rain: 1, horizon: -0.18 },
    peck:    { a: '#f1faff', b: '#86c2ff', c: '#5068dc', sky: '#12234d', center: [0.58, 0.26],   size: 0.28, glow: 0.42, cloud: 0.60, dark: 0.1,  rain: 0, horizon: -0.24 },
    sunset:  { a: '#ffdca6', b: '#ff9e80', c: '#c27ad8', sky: '#2a2050', center: [-0.58, 0.24], size: 0.30, glow: 0.46, cloud: 0.55, dark: 0.0,  rain: 0, horizon: -0.22 },
    opinion: { a: '#fff0f6', b: '#ffb4d2', c: '#8f9fff', sky: '#161e48', center: [0.64, 0.32],  size: 0.26, glow: 0.34, cloud: 0.35, dark: 0.0,  rain: 0, horizon: -0.40 },
};

const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Текущее (плавно меняющееся) состояние неба
const state = {};
let target = PALETTES.hero;
function toState(p) {
    // На телефоне в главах аура уходит к верхнему краю, чтобы не мешать тексту
    const narrow = window.innerWidth / window.innerHeight < 1;
    const inChapter = p !== PALETTES.hero && p !== PALETTES.quote;
    const center = narrow && inChapter ? [p.center[0] * 0.8, 0.5] : p.center.slice();
    const glow = narrow && inChapter ? p.glow * 0.8 : p.glow;
    return {
        a: hexToRgb(p.a), b: hexToRgb(p.b), c: hexToRgb(p.c), sky: hexToRgb(p.sky),
        center, size: p.size, glow, cloud: p.cloud,
        dark: p.dark, rain: p.rain, horizon: p.horizon,
    };
}
Object.assign(state, toState(target));
let targetState = toState(target);

/* =========================================================
   1. НЕБО (WebGL)
   ========================================================= */
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uA, uB, uC, uSky;
uniform vec2  uCenter;
uniform float uSize, uGlow, uCloud, uDark, uRain, uFlash, uHorizon;
uniform vec2  uMouse;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = ROT * p; a *= 0.5; }
    return v;
}
float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p = ROT * p; a *= 0.5; }
    return v;
}

// Аура: мягкое «живое» пятно с перетекающими цветами
vec3 aura(vec2 p, float t) {
    vec2 q = p - uCenter - uMouse * 0.025;
    vec2 w = vec2(fbm3(q * 1.3 / uSize * 0.5 + vec2(0.0, t * 0.09)),
                  fbm3(q * 1.3 / uSize * 0.5 + vec2(5.2, 1.3) - t * 0.08));
    vec2 qq = q + (w - 0.5) * 0.7 * uSize;
    float r = length(qq) / uSize;
    float ang = atan(qq.y, qq.x);

    float wob = 0.09 * sin(ang * 3.0 + t * 0.35) + 0.06 * sin(ang * 5.0 - t * 0.27) + 0.24 * (w.x - 0.5);
    float edge = 0.8 + wob;
    float bodyMask = smoothstep(edge + 0.16, edge - 0.3, r);

    // второй слой: цвет края «затекает» внутрь пятнами
    float m  = fbm3(qq * 1.8 / uSize + w * 2.0 + vec2(t * 0.05, -t * 0.04));
    float m2 = fbm3(qq * 1.1 / uSize - w * 1.5 + vec2(-t * 0.03, t * 0.05));
    vec3 col = mix(uB, uA, smoothstep(0.3, 0.62, m) * smoothstep(edge * 1.05, 0.1, r));
    col = mix(col, uC, smoothstep(0.55, 1.0, r / edge + (m2 - 0.5) * 0.9));

    // тонкие светлые «прожилки», как у ауры в плеере
    float vein = smoothstep(0.03, 0.0, abs(m - 0.5)) * smoothstep(edge, 0.25, r);
    col += uA * vein * 0.08;

    // едва заметные лучи по краю
    float rays = pow(max(0.0, sin(ang * 6.0 + w.y * 6.0 + t * 0.1)), 40.0)
               * smoothstep(1.35, 0.9, r) * smoothstep(0.6, 0.95, r);

    vec3 c = col * bodyMask * 1.35;
    c += uC * exp(-r * r * 2.6) * 0.16;          // внешнее свечение
    c += mix(uA, uC, 0.5) * rays * 0.03;
    return c;
}

// Плотность гряды облаков: шум + «чем выше, тем меньше облака»
float bankDensity(vec2 p, float base, float scale, float speed, float t) {
    vec2 q = p * scale + vec2(t * speed * scale, 0.0);
    float n = fbm(q) + 0.16 * fbm(q * 3.1 + 7.3);
    return n * 1.35 - (p.y - base) * 2.6 - 0.22 + uCloud * 0.18;
}

// Гряда кучевых облаков с подсветкой краёв со стороны ауры
vec3 cloudBank(vec3 col, vec2 p, float base, float scale, float speed, float haze, vec3 light, float t) {
    float d = bankDensity(p, base, scale, speed, t);
    float alpha = smoothstep(0.5, 0.62, d);
    if (alpha <= 0.0) return col;

    vec2 L = normalize(uCenter - p + vec2(0.0001));
    float dl = bankDensity(p + L * 0.03 / scale, base, scale, speed, t);
    float rim  = clamp((d - dl) * 5.0, 0.0, 1.0);          // край, обращённый к свету
    float thin = 1.0 - smoothstep(0.55, 1.2, d);            // тонкие места просвечивают

    float dC = length(p - uCenter);
    float near = exp(-dC * dC / (uSize * uSize * 1.8));

    vec3 shadow = mix(vec3(0.05, 0.06, 0.13), uSky * 0.5, 0.4);
    vec3 cc = shadow + vec3(0.06, 0.06, 0.10) * thin;
    cc += light * (rim * 1.3 + thin * 0.22) * near * uGlow;
    cc += vec3(0.20, 0.22, 0.34) * rim * (1.0 - near) * 0.5;  // слабый холодный свет неба
    cc = mix(cc, cc * 0.45 + vec3(0.006, 0.008, 0.012), uDark);
    cc += vec3(0.55, 0.6, 0.75) * uFlash * (0.35 + rim);    // молния подсвечивает облака
    cc = mix(cc, col, haze * (1.0 - alpha * 0.5));          // дальняя гряда тонет в дымке
    return mix(col, cc, alpha);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uTime;

    vec3 light = mix(uB, uA, 0.45);
    float dC = length(p - uCenter);
    float near = exp(-dC * dC / (uSize * uSize * 2.4));

    // --- небо ---
    float hy = p.y - uHorizon;
    vec3 col = mix(uSky * 0.9 + light * 0.05, vec3(0.02, 0.03, 0.08), smoothstep(0.0, 0.85, hy));
    col += light * exp(-abs(hy) * 9.0) * 0.1 * uGlow;       // дымка у горизонта

    // --- высокие перистые облака ---
    if (hy > 0.0) {
        vec2 hp = vec2(p.x * 0.55 + t * 0.006, p.y * 2.6);
        float hd = fbm(hp * 2.4 + vec2(t * 0.004, 0.0));
        hd = smoothstep(0.52 - uCloud * 0.12, 0.95, hd) * smoothstep(0.0, 0.18, hy) * (0.35 + uCloud * 0.5);
        vec3 hc = mix(vec3(0.05, 0.05, 0.07), light * 0.75 + 0.05, clamp(near * uGlow * 1.5, 0.0, 1.0));
        hc = mix(hc, vec3(0.035, 0.04, 0.05), uDark);
        col = mix(col, hc, hd * 0.6);
    }

    // --- аура (за морем облаков) ---
    col += aura(p, t) * uGlow;

    // --- две гряды кучевых облаков: дальняя и ближняя ---
    if (hy < 0.38) {
        col = cloudBank(col, p, uHorizon + 0.02, 2.4, 0.010, 0.55, light, t);   // дальняя, в дымке
        col = cloudBank(col, p, uHorizon - 0.13, 1.35, 0.018, 0.0, light, t);   // ближняя, плотная
    }

    // --- вспышка молнии ---
    col += vec3(0.45, 0.5, 0.65) * uFlash * (0.08 + 0.25 * smoothstep(0.6, -0.2, hy));

    // --- дождь ---
    if (uRain > 0.01) {
        vec2 rp = vec2(p.x + p.y * 0.16, p.y);
        float id = floor(rp.x * 150.0);
        float rn = hash(vec2(id, 3.7));
        float y  = fract(rp.y * 0.8 + t * (1.3 + rn) + rn * 17.0);
        float streak = smoothstep(0.0, 0.01, y) * smoothstep(0.1, 0.015, y);
        float xf = abs(fract(rp.x * 150.0) - 0.5);
        streak *= smoothstep(0.45, 0.1, xf) * step(0.7, rn);
        col += vec3(0.6, 0.66, 0.8) * streak * 0.22 * uRain;
    }

    // виньетка, мягкий тонмаппинг и дизеринг от «ступенек»
    vec2 v = uv - 0.5;
    col *= 1.0 - dot(v, v) * 0.9;
    col = 1.0 - exp(-col * 1.25);
    col = pow(col, vec3(0.95));
    col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
}
`;

const canvas = document.getElementById('sky');
const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });

let uniforms = null;
let flash = 0;
let nextFlashAt = 0;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(sh));
        return null;
    }
    return sh;
}

function initSky() {
    if (!gl) return false;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uniforms = {};
    ['uRes', 'uTime', 'uA', 'uB', 'uC', 'uSky', 'uCenter', 'uSize', 'uGlow', 'uCloud',
     'uDark', 'uRain', 'uFlash', 'uHorizon', 'uMouse'].forEach((name) => {
        uniforms[name] = gl.getUniformLocation(prog, name);
    });
    return true;
}

// Рисуем в половинном разрешении — всё мягкое, разницы не видно, а работает быстрее
function resizeSky() {
    const scale = window.innerWidth > 1400 ? 0.45 : 0.55;
    canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
    canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
}

// На узких экранах сдвигаем и уменьшаем ауру, чтобы она не уезжала за край
function adaptForScreen(s) {
    const aspect = window.innerWidth / window.innerHeight;
    const k = Math.min(1, aspect / 1.6);
    return {
        cx: s.center[0] * k,
        cy: s.center[1],
        size: s.size * Math.max(0.58, Math.min(1, aspect * 0.95)),
    };
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpArr = (a, b, k) => { for (let i = 0; i < a.length; i++) a[i] = lerp(a[i], b[i], k); };

let last = performance.now();
let time = Math.random() * 100;

function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt * (reduceMotion ? 0.05 : 1);

    // плавный переход к палитре текущей главы
    const k = 1 - Math.exp(-dt * 1.8);
    ['a', 'b', 'c', 'sky', 'center'].forEach((key) => lerpArr(state[key], targetState[key], k));
    ['size', 'glow', 'cloud', 'dark', 'rain', 'horizon'].forEach((key) => {
        state[key] = lerp(state[key], targetState[key], k);
    });

    // молнии только в грозовой главе
    if (!reduceMotion && body.dataset.palette === 'gus' && now > nextFlashAt) {
        flash = 1;
        nextFlashAt = now + 3500 + Math.random() * 5000;
        setTimeout(() => { flash = Math.max(flash, 0.7); }, 140);
    }
    flash *= Math.exp(-dt * 7);

    mouse.x = lerp(mouse.x, mouse.tx, 1 - Math.exp(-dt * 2));
    mouse.y = lerp(mouse.y, mouse.ty, 1 - Math.exp(-dt * 2));

    const fit = adaptForScreen(state);
    gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform3fv(uniforms.uA, state.a);
    gl.uniform3fv(uniforms.uB, state.b);
    gl.uniform3fv(uniforms.uC, state.c);
    gl.uniform3fv(uniforms.uSky, state.sky);
    gl.uniform2f(uniforms.uCenter, fit.cx, fit.cy);
    gl.uniform1f(uniforms.uSize, fit.size);
    gl.uniform1f(uniforms.uGlow, state.glow);
    gl.uniform1f(uniforms.uCloud, state.cloud);
    gl.uniform1f(uniforms.uDark, state.dark);
    gl.uniform1f(uniforms.uRain, state.rain);
    gl.uniform1f(uniforms.uFlash, flash);
    gl.uniform1f(uniforms.uHorizon, state.horizon);
    gl.uniform2f(uniforms.uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
}

if (initSky()) {
    document.documentElement.classList.add('has-webgl');
    resizeSky();
    window.addEventListener('resize', resizeSky);
    window.addEventListener('pointermove', (e) => {
        mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    });
    requestAnimationFrame(frame);
} else {
    canvas.hidden = true;
}

/* =========================================================
   2. ГЛАВЫ: палитра, шкала, счётчик
   ========================================================= */
const paletteEls = Array.from(document.querySelectorAll('[data-palette]:not(body)'));
const segEls = Array.from(document.querySelectorAll('[data-seg]'));
const timeline = document.getElementById('timeline');
const readoutNum = document.getElementById('readoutNum');
const readoutTitle = document.getElementById('readoutTitle');

// Строим шкалу внизу из глав страницы
const segLinks = segEls.map((el, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const id = el.id || el.querySelector('[id]').id;
    a.href = '#' + id;
    a.innerHTML = `<span class="timeline__bar"><span class="timeline__fill"></span></span><span class="timeline__label">${String(i).padStart(2, '0')} · ${el.dataset.title}</span>`;
    li.appendChild(a);
    timeline.appendChild(li);
    return a;
});

let currentPalette = 'hero';
let currentSeg = -1;

function setPalette(name) {
    if (name === currentPalette || !PALETTES[name]) return;
    currentPalette = name;
    body.dataset.palette = name;
    targetState = toState(PALETTES[name]);
    nextFlashAt = performance.now() + 600;
}

const topbar = document.querySelector('.topbar');

function onScroll() {
    const mid = window.innerHeight * 0.5;
    topbar.classList.toggle('is-scrolled', window.scrollY > 40);

    // палитра — у того блока, который пересекает середину экрана
    for (const el of paletteEls) {
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { setPalette(el.dataset.palette); break; }
    }

    // прогресс каждой главы на шкале
    segEls.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (mid - r.top) / r.height));
        segLinks[i].style.setProperty('--p', p.toFixed(3));
        if (r.top <= mid && r.bottom > mid && currentSeg !== i) {
            currentSeg = i;
            segLinks.forEach((a, j) => a.classList.toggle('is-active', j === i));
            readoutNum.textContent = String(i).padStart(2, '0');
            readoutTitle.textContent = el.dataset.title;
            menuLinks.forEach((a, j) => a.classList.toggle('is-current', j === i));
        }
    });

    litQuoteWords();
}

let ticking = false;
window.addEventListener('scroll', () => {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { onScroll(); ticking = false; });
    }
}, { passive: true });
window.addEventListener('resize', () => {
    targetState = toState(PALETTES[currentPalette]);
    onScroll();
});

/* =========================================================
   3. ОГЛАВЛЕНИЕ
   ========================================================= */
const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menuBtn');
const menuLinks = Array.from(menu.querySelectorAll('.menu__list a'));
const preview = menu.querySelector('.menu__preview');
const previewImg = preview.querySelector('img');

function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) (menuLinks[Math.max(0, currentSeg)] || menuLinks[0]).focus({ preventScroll: true });
}

menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menuLinks.forEach((a) => {
    a.addEventListener('click', () => setMenu(false));
    const show = () => {
        const src = a.dataset.thumb;
        if (!src || previewImg.getAttribute('src') === src) return;
        preview.classList.add('is-swapping');
        setTimeout(() => {
            previewImg.src = src;
            preview.classList.remove('is-swapping');
        }, 200);
    };
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', show);
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
});

/* =========================================================
   4. ЦИТАТА: слова «загораются» при прокрутке
   ========================================================= */
const quoteText = document.querySelector('.quote__text');
let quoteWords = [];
if (quoteText) {
    const words = quoteText.textContent.trim().split(/\s+/);
    quoteText.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
    quoteWords = Array.from(quoteText.querySelectorAll('.w'));
}

function litQuoteWords() {
    if (!quoteWords.length) return;
    const r = quoteText.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 — цитата только показалась снизу, 1 — дошла до верхней трети
    const p = reduceMotion ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.85 - vh * 0.3)));
    const count = Math.round(p * quoteWords.length);
    quoteWords.forEach((w, i) => w.classList.toggle('is-lit', i < count));
}

/* =========================================================
   5. ПОЯВЛЕНИЕ БЛОКОВ
   ========================================================= */
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.18 });

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// Старт
onScroll();
