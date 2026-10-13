/*
 * BY Sirius - Cosmos layer
 * Vanilla canvas starfield: drifting parallax stars, soft constellation links,
 * pointer gravity well and occasional shooting stars.
 * Idea adapted from 21st.dev "Gravity Stars" / "Constellation Field" (rewritten without React).
 */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Canvas ----------
    var canvas = document.createElement('canvas');
    canvas.id = 'cosmos-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var W = 0, H = 0, dpr = 1;
    var stars = [];
    var shooters = [];
    var pointer = { x: 0, y: 0, active: false };
    var scrollY = window.scrollY || 0;
    var running = false;
    var rafId = 0;
    var last = 0;

    var LINK = 120;
    var TAU = Math.PI * 2;

    // Pre-rendered glow sprites: cool white, blue-white, warm gold
    var TINTS = [[232, 236, 255], [170, 200, 255], [255, 226, 160]];
    var sprites = TINTS.map(function (c) {
        var s = document.createElement('canvas');
        s.width = s.height = 64;
        var g = s.getContext('2d');
        var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(' + c + ',1)');
        grad.addColorStop(0.08, 'rgba(' + c + ',0.95)');
        grad.addColorStop(0.2, 'rgba(' + c + ',0.38)');
        grad.addColorStop(0.5, 'rgba(' + c + ',0.07)');
        grad.addColorStop(1, 'rgba(' + c + ',0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return s;
    });

    function starCount() {
        var base = Math.round((W * H) / 9000);
        return Math.max(60, Math.min(base, W < 700 ? 90 : 190));
    }

    function seed() {
        var n = starCount();
        stars = [];
        for (var i = 0; i < n; i++) {
            var z = Math.pow(Math.random(), 1.7); // skew to far/small stars
            var a = Math.random() * TAU;
            var m = 6 + z * 14;
            var r = Math.random();
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: 0, vy: 0,
                dx: Math.cos(a) * m, dy: Math.sin(a) * m,
                z: z,
                ph: Math.random() * TAU,
                rate: 0.6 + Math.random() * 1.1,
                tint: r < 0.08 ? 2 : (r < 0.4 ? 1 : 0)
            });
        }
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
        if (!running) draw(0, true);
    }

    function spawnShooter() {
        var fromLeft = Math.random() < 0.5;
        var ang = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.3;
        var sp = 520 + Math.random() * 360;
        shooters.push({
            x: Math.random() * W * 0.7 + (fromLeft ? 0 : W * 0.3),
            y: Math.random() * H * 0.45,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: 0,
            max: 0.9 + Math.random() * 0.6
        });
    }

    var nextShooter = 1.2;

    function step(dt) {
        var damping = Math.pow(0.97, dt * 60);
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            if (pointer.active) {
                var reach = 240 * (0.6 + s.z * 0.8);
                var px = pointer.x - s.x, py = pointer.y - s.y;
                var d2 = px * px + py * py;
                if (d2 < reach * reach) {
                    var d = Math.sqrt(d2);
                    var soft = Math.sqrt(d2 + 676);
                    var fade = 1 - d / reach;
                    var pull = 0.35 + s.z;
                    var str = Math.min(2600000 * pull / (soft * soft), 3500) * fade * fade;
                    var nx = px / soft, ny = py / soft;
                    s.vx += (nx * str - ny * str * 0.85) * dt;
                    s.vy += (ny * str + nx * str * 0.85) * dt;
                }
            }
            s.vx *= damping; s.vy *= damping;
            s.x += (s.vx + s.dx) * dt;
            s.y += (s.vy + s.dy) * dt;
            if (s.x < -10) s.x += W + 20; else if (s.x > W + 10) s.x -= W + 20;
            if (s.y < -10) s.y += H + 20; else if (s.y > H + 10) s.y -= H + 20;
        }

        nextShooter -= dt;
        if (nextShooter <= 0 && shooters.length < 2) {
            spawnShooter();
            nextShooter = 2 + Math.random() * 3.5;
        }
        for (var k = shooters.length - 1; k >= 0; k--) {
            var sh = shooters[k];
            sh.life += dt;
            sh.x += sh.vx * dt;
            sh.y += sh.vy * dt;
            if (sh.life > sh.max) shooters.splice(k, 1);
        }
    }

    function draw(t, still) {
        ctx.clearRect(0, 0, W, H);
        var par = scrollY * 0.12;
        var i, j, a, b;

        // constellation links
        ctx.lineWidth = 0.6;
        for (i = 0; i < stars.length; i++) {
            a = stars[i];
            if (a.z < 0.25) continue;
            var ay = a.y - par * a.z;
            for (j = i + 1; j < stars.length; j++) {
                b = stars[j];
                if (b.z < 0.25) continue;
                var dx = a.x - b.x;
                if (dx > LINK || dx < -LINK) continue;
                var by = b.y - par * b.z;
                var dy = ay - by;
                if (dy > LINK || dy < -LINK) continue;
                var dd = dx * dx + dy * dy;
                if (dd < LINK * LINK) {
                    var al = Math.pow(1 - Math.sqrt(dd) / LINK, 1.5) * 0.28 * (0.4 + (a.z + b.z) * 0.5);
                    ctx.strokeStyle = 'rgba(190,205,255,' + al.toFixed(3) + ')';
                    ctx.beginPath();
                    ctx.moveTo(a.x, ay);
                    ctx.lineTo(b.x, by);
                    ctx.stroke();
                }
            }
        }

        // stars
        for (i = 0; i < stars.length; i++) {
            a = stars[i];
            var wave = still ? Math.sin(a.ph) : Math.sin(t * a.rate + a.ph);
            var alpha = (0.18 + a.z * 0.82) * (1 - 0.5 * 0.55 * (1 - wave));
            var core = 1.1 * (0.42 + a.z * 1.9);
            var halo = core * 5.2 * (0.6 + a.z * 0.7);
            var yy = a.y - par * a.z;
            if (yy < -halo) yy += H + halo * 2;
            ctx.globalAlpha = alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
            ctx.drawImage(sprites[a.tint], a.x - halo, yy - halo, halo * 2, halo * 2);
        }
        ctx.globalAlpha = 1;

        // shooting stars
        for (i = 0; i < shooters.length; i++) {
            var s = shooters[i];
            var p = s.life / s.max;
            var fadeA = Math.sin(Math.min(p, 1) * Math.PI);
            var len = 140;
            var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
            var tx = s.x - (s.vx / sp) * len, ty = s.y - (s.vy / sp) * len;
            var g = ctx.createLinearGradient(s.x, s.y, tx, ty);
            g.addColorStop(0, 'rgba(255,240,200,' + (0.9 * fadeA).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(255,240,200,0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
        }
    }

    function tick(now) {
        if (!running) return;
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        step(dt);
        draw(now / 1000, false);
        rafId = requestAnimationFrame(tick);
    }

    function start() {
        if (running || reduceMotion) return;
        running = true;
        last = performance.now();
        rafId = requestAnimationFrame(tick);
    }
    function stop() {
        running = false;
        cancelAnimationFrame(rafId);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('scroll', function () { scrollY = window.scrollY || 0; }, { passive: true });
    window.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    document.addEventListener('pointerleave', function () { pointer.active = false; });
    window.addEventListener('blur', function () { pointer.active = false; });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });

    resize();
    start();

    // ---------- Orbit rings for inner-page heroes (index.html ships its own) ----------
    document.querySelectorAll('.internal-hero').forEach(function (hero) {
        if (hero.querySelector('.hero-orbits')) return;
        var o = document.createElement('div');
        o.className = 'hero-orbits';
        o.setAttribute('aria-hidden', 'true');
        o.innerHTML = '<span class="core"></span><span class="ring r1"><i></i></span>' +
            '<span class="ring r2"><i></i></span><span class="ring r3"><i></i></span>';
        hero.insertBefore(o, hero.firstChild);
    });

    // ---------- Auto-tag existing markup (no per-page HTML edits needed) ----------
    function tag(sel, cls) {
        document.querySelectorAll(sel).forEach(function (el) { el.classList.add(cls); });
    }
    tag('.service-card, .industry-card, .service-row, .sector-row, .block-about', 'spot');
    tag('.section-intro, .services-grid, .industries-grid, .block-about, .service-row, .sector-row', 'reveal');

    // ---------- Spotlight cards: cursor-tracking glow ----------
    document.addEventListener('pointermove', function (e) {
        var card = e.target.closest && e.target.closest('.spot');
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });

    // ---------- Scroll reveal ----------
    var revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !reduceMotion) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) {
                    en.target.classList.add('in');
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el) { io.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('in'); });
    }
})();
