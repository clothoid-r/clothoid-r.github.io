(function () {
    'use strict';

    function initInteractiveHero() {
        const hero = document.getElementById('hero-section');
        const canvas = document.getElementById('hero-canvas');
        const emblemCard = document.getElementById('hero-emblem-card');
        const emblemGlare = document.getElementById('hero-emblem-glare');
        const emblemLogoWrap = document.getElementById('hero-emblem-logo-wrap');

        if (!hero || !canvas) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;
        let dpr = 1;
        let isVisible = true;
        let time = 0;

        const pointer = {
            active: false,
            x: 0,
            y: 0,
            smoothX: 0,
            smoothY: 0
        };

        const tilt = {
            curX: 0,
            curY: 0,
            targetX: 0,
            targetY: 0,
            glareX: 50,
            glareY: 50
        };

        // Virtual autonomous vehicle state following smooth curvature transitions (Clothoid-inspired)
        const vehicle = {
            x: 0,
            y: 0,
            angle: 0,
            curvature: 0,
            trail: []
        };

        const POINT_COUNT = 58;
        const points = [];

        function resize() {
            const rect = hero.getBoundingClientRect();
            width = Math.max(1, rect.width);
            height = Math.max(1, rect.height);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (points.length === 0) {
                for (let i = 0; i < POINT_COUNT; i++) {
                    points.push({
                        x: Math.random() * width,
                        y: Math.random() * height,
                        vx: (Math.random() - 0.5) * 0.35,
                        vy: (Math.random() - 0.5) * 0.35,
                        r: 1.2 + Math.random() * 1.8
                    });
                }
                vehicle.x = width * 0.35;
                vehicle.y = height * 0.55;
                pointer.smoothX = vehicle.x;
                pointer.smoothY = vehicle.y;
            }
        }

        resize();
        window.addEventListener('resize', resize);

        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            pointer.active = true;
            pointer.x = e.clientX - rect.left;
            pointer.y = e.clientY - rect.top;

            if (emblemCard) {
                const cRect = emblemCard.getBoundingClientRect();
                const relX = (e.clientX - (cRect.left + cRect.width / 2)) / (cRect.width / 2);
                const relY = (e.clientY - (cRect.top + cRect.height / 2)) / (cRect.height / 2);
                const clampedX = Math.max(-1.4, Math.min(1.4, relX));
                const clampedY = Math.max(-1.4, Math.min(1.4, relY));
                tilt.targetY = clampedX * 9;
                tilt.targetX = -clampedY * 9;
                tilt.glareX = Math.max(0, Math.min(100, 50 + clampedX * 38));
                tilt.glareY = Math.max(0, Math.min(100, 50 + clampedY * 38));
            }
        });

        hero.addEventListener('mouseleave', () => {
            pointer.active = false;
            tilt.targetX = 0;
            tilt.targetY = 0;
            tilt.glareX = 50;
            tilt.glareY = 50;
        });

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                isVisible = entries.some(en => en.isIntersecting);
            }, { threshold: 0.05 });
            io.observe(hero);
        }

        function normalizeAngle(a) {
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        }

        function step() {
            requestAnimationFrame(step);
            if (!isVisible || document.hidden) return;

            time += 0.016;
            ctx.clearRect(0, 0, width, height);

            // Autopilot infinity trajectory when pointer is outside hero
            const autoX = width * 0.5 + Math.cos(time * 0.65) * (width * 0.32);
            const autoY = height * 0.52 + Math.sin(time * 1.3) * (height * 0.24);
            const goalX = pointer.active ? pointer.x : autoX;
            const goalY = pointer.active ? pointer.y : autoY;

            pointer.smoothX += (goalX - pointer.smoothX) * 0.12;
            pointer.smoothY += (goalY - pointer.smoothY) * 0.12;

            // 1. Radial LiDAR spotlight aura around pointer/target
            const grad = ctx.createRadialGradient(
                pointer.smoothX, pointer.smoothY, 8,
                pointer.smoothX, pointer.smoothY, 240
            );
            grad.addColorStop(0, pointer.active ? 'rgba(244, 63, 94, 0.18)' : 'rgba(244, 63, 94, 0.09)');
            grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.05)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // Subtle expanding LiDAR pulse ring when mouse is active
            if (pointer.active) {
                const pulseRadius = 24 + ((time * 55) % 130);
                const pulseAlpha = Math.max(0, 1 - pulseRadius / 154) * 0.25;
                ctx.beginPath();
                ctx.arc(pointer.smoothX, pointer.smoothY, pulseRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(251, 113, 133, ${pulseAlpha.toFixed(3)})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }

            // 2. LiDAR Point Cloud & Perception Mesh
            const SCAN_RADIUS = 195;
            const activePts = [];

            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                const dx = p.x - pointer.smoothX;
                const dy = p.y - pointer.smoothY;
                const dist = Math.hypot(dx, dy);

                if (dist < SCAN_RADIUS) {
                    const intensity = 1 - dist / SCAN_RADIUS;
                    activePts.push({ p, intensity });
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r + intensity * 1.8, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(251, 113, 133, ${(0.28 + intensity * 0.65).toFixed(3)})`;
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
                    ctx.fill();
                }
            }

            // Connect scanned LiDAR points into local costmap mesh
            for (let i = 0; i < activePts.length; i++) {
                for (let j = i + 1; j < activePts.length; j++) {
                    const a = activePts[i].p;
                    const b = activePts[j].p;
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d < 105) {
                        const lineAlpha = (1 - d / 105) * Math.min(activePts[i].intensity, activePts[j].intensity) * 0.42;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = `rgba(251, 113, 133, ${lineAlpha.toFixed(3)})`;
                        ctx.lineWidth = 0.9;
                        ctx.stroke();
                    }
                }
            }

            // 3. Clothoid Smooth Trajectory Follower
            const dxGoal = goalX - vehicle.x;
            const dyGoal = goalY - vehicle.y;
            const distGoal = Math.hypot(dxGoal, dyGoal);

            if (distGoal > 6) {
                const desiredAngle = Math.atan2(dyGoal, dxGoal);
                const angleErr = normalizeAngle(desiredAngle - vehicle.angle);
                // Smoothly transition curvature (dκ/ds bounded like a Clothoid transition curve)
                const targetCurvature = Math.max(-0.085, Math.min(0.085, angleErr * 0.16));
                vehicle.curvature += (targetCurvature - vehicle.curvature) * 0.18;
                vehicle.angle = normalizeAngle(vehicle.angle + vehicle.curvature);

                const speed = Math.min(4.8, Math.max(1.8, distGoal * 0.045));
                vehicle.x += Math.cos(vehicle.angle) * speed;
                vehicle.y += Math.sin(vehicle.angle) * speed;
            }

            vehicle.trail.push({ x: vehicle.x, y: vehicle.y });
            if (vehicle.trail.length > 44) {
                vehicle.trail.shift();
            }

            // Draw smooth Clothoid trajectory ribbon
            if (vehicle.trail.length > 2) {
                for (let i = 1; i < vehicle.trail.length; i++) {
                    const ratio = i / vehicle.trail.length;
                    const prev = vehicle.trail[i - 1];
                    const curr = vehicle.trail[i];
                    ctx.beginPath();
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(curr.x, curr.y);
                    ctx.strokeStyle = i > vehicle.trail.length - 10
                        ? `rgba(251, 191, 36, ${(ratio * 0.65).toFixed(3)})`
                        : `rgba(244, 63, 94, ${(ratio * 0.5).toFixed(3)})`;
                    ctx.lineWidth = 1.2 + ratio * 2.8;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Waypoint nodes along the path
                    if (i % 7 === 0) {
                        ctx.beginPath();
                        ctx.arc(curr.x, curr.y, 1.8, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(253, 224, 71, ${(ratio * 0.7).toFixed(3)})`;
                        ctx.fill();
                    }
                }

                // Lookahead line from vehicle head to target cursor when active
                if (pointer.active && distGoal > 14 && distGoal < 360) {
                    ctx.save();
                    ctx.setLineDash([4, 5]);
                    ctx.beginPath();
                    ctx.moveTo(vehicle.x, vehicle.y);
                    ctx.lineTo(pointer.smoothX, pointer.smoothY);
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                }

                // Vehicle / Trajectory Lead Marker
                ctx.save();
                ctx.translate(vehicle.x, vehicle.y);
                ctx.rotate(vehicle.angle);
                ctx.beginPath();
                ctx.moveTo(7, 0);
                ctx.lineTo(-5, -4.2);
                ctx.lineTo(-2.5, 0);
                ctx.lineTo(-5, 4.2);
                ctx.closePath();
                ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
                ctx.fill();
                ctx.restore();
            }

            // 4. 3D Perspective Tilt on Emblem Card
            if (emblemCard) {
                tilt.curX += (tilt.targetX - tilt.curX) * 0.1;
                tilt.curY += (tilt.targetY - tilt.curY) * 0.1;
                emblemCard.style.transform = `perspective(900px) rotateX(${tilt.curX.toFixed(2)}deg) rotateY(${tilt.curY.toFixed(2)}deg)`;

                if (emblemLogoWrap) {
                    emblemLogoWrap.style.transform = `translate3d(${(tilt.curY * 0.7).toFixed(1)}px, ${(-tilt.curX * 0.7).toFixed(1)}px, 0)`;
                }
                if (emblemGlare) {
                    const glareOpacity = pointer.active ? 0.16 : 0;
                    emblemGlare.style.opacity = String(glareOpacity);
                    emblemGlare.style.background = `radial-gradient(circle at ${tilt.glareX.toFixed(0)}% ${tilt.glareY.toFixed(0)}%, rgba(255,255,255,0.65), transparent 65%)`;
                }
            }
        }

        requestAnimationFrame(step);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInteractiveHero);
    } else {
        initInteractiveHero();
    }
})();
