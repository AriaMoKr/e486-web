/**
 * Period-Correct CRT Shader & Canvas Renderer
 * Simulates vintage curved cathode ray tube displays, scanline rasters,
 * aperture grille / shadow mask phosphors, CRT blooming, degauss wobble, and power collapse.
 */

export class CrtRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Offscreen raw emulator buffer canvas (320x200 or 640x400)
        this.rawCanvas = document.createElement('canvas');
        this.rawCanvas.width = 640;
        this.rawCanvas.height = 400;
        this.rawCtx = this.rawCanvas.getContext('2d', { willReadFrequently: true });

        // Shader parameters
        this.mode = 'crt'; // 'crt', 'green', 'amber', 'mono', 'crisp'
        this.overscanX = 28; // Horizontal CRT overscan / porch border (px)
        this.overscanY = 22; // Vertical CRT overscan / porch border (px)
        this.curvature = 0.08;
        this.scanlineIntensity = 0.25;
        this.brightness = 1.0;
        this.contrast = 1.0;
        this.powerOn = true;

        // Degauss animation
        this.degaussActive = false;
        this.degaussStartTime = 0;

        // Power switch collapse/expand animation
        this.powerTransition = 1.0; // 0.0 = collapsed dot, 1.0 = full screen
    }

    setMode(mode) {
        this.mode = mode;
    }

    triggerDegauss() {
        this.degaussActive = true;
        this.degaussStartTime = performance.now();
    }

    setPower(on) {
        this.powerOn = on;
    }

    render(activeVideoCard) {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Animate power on/off transition
        if (this.powerOn && this.powerTransition < 1.0) {
            this.powerTransition = Math.min(1.0, this.powerTransition + 0.08);
        } else if (!this.powerOn && this.powerTransition > 0.0) {
            this.powerTransition = Math.max(0.0, this.powerTransition - 0.12);
        }

        if (this.powerTransition <= 0.01) {
            // Screen is completely powered off (black with faint glass reflection)
            this.ctx.fillStyle = '#060809';
            this.ctx.fillRect(0, 0, w, h);
            this.drawGlassReflection(w, h);
            return;
        }

        // 1. Let active video card render raw pixels onto the offscreen rawCanvas
        if (activeVideoCard && activeVideoCard.renderDisplay) {
            activeVideoCard.renderDisplay(this.rawCtx, this.rawCanvas.width, this.rawCanvas.height);
        }

        // 2. Check degauss wobble
        let degaussShiftX = 0;
        let degaussShiftY = 0;
        if (this.degaussActive) {
            const elapsed = (performance.now() - this.degaussStartTime) / 1000;
            if (elapsed < 1.2) {
                const damping = Math.exp(-elapsed * 3.5);
                const freq = 45;
                degaussShiftX = Math.sin(elapsed * freq) * 18 * damping;
                degaussShiftY = Math.cos(elapsed * freq * 0.8) * 14 * damping;
            } else {
                this.degaussActive = false;
            }
        }

        // 3. Calculate display dimensions with overscan border & power transition collapse effect
        const scaleX = this.powerTransition;
        const scaleY = (this.powerTransition > 0.3) ? (this.powerTransition - 0.3) / 0.7 : 0.02;

        const innerW = w - (this.overscanX * 2);
        const innerH = h - (this.overscanY * 2);
        const destW = innerW * scaleX;
        const destH = innerH * scaleY;
        const destX = ((w - destW) / 2) + degaussShiftX;
        const destY = ((h - destH) / 2) + degaussShiftY;

        // 4. Fill CRT screen & draw active frame under the exact same filter and background color
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = (this.mode === 'crt');

        // Apply contrast & brightness to both the overscan border and active display
        this.ctx.filter = `brightness(${this.brightness * 100}%) contrast(${this.contrast * 100}%)`;

        // Match exact display background color across the entire CRT tube (including overscan border)
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, w, h);

        // Draw screen image inset by overscan border
        this.ctx.drawImage(this.rawCanvas, destX, destY, destW, destH);
        this.ctx.restore();

        // 5. Apply CRT effects across the full CRT tube face (overscan border + display)
        if (this.mode !== 'crisp' && this.powerTransition > 0.5) {
            this.applyCrtPostProcess(0, 0, w, h);
        }

        // 6. Glass glare and CRT bezel edge shadow
        this.drawGlassReflection(w, h);
    }

    applyCrtPostProcess(x, y, w, h) {
        this.ctx.save();

        // Phosphor tinting and subtle tube glow across both display and overscan border
        if (this.mode === 'green') {
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = '#33ff66';
            this.ctx.fillRect(x, y, w, h);
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.fillStyle = 'rgba(0, 40, 15, 0.22)';
            this.ctx.fillRect(x, y, w, h);
        } else if (this.mode === 'amber') {
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = '#ffaa22';
            this.ctx.fillRect(x, y, w, h);
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.fillStyle = 'rgba(45, 25, 0, 0.22)';
            this.ctx.fillRect(x, y, w, h);
        } else if (this.mode === 'mono') {
            this.ctx.globalCompositeOperation = 'color';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(x, y, w, h);
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.fillStyle = 'rgba(30, 35, 40, 0.18)';
            this.ctx.fillRect(x, y, w, h);
        } else if (this.mode === 'crt') {
            // Subtle CRT phosphor background glow across full screen + border
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.fillStyle = 'rgba(10, 16, 22, 0.20)';
            this.ctx.fillRect(x, y, w, h);
        }

        // Scanlines across entire CRT face (border + active area)
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.scanlineIntensity})`;
        const scanlineStep = Math.max(2, Math.floor(h / 200));
        for (let py = y; py < y + h; py += scanlineStep) {
            this.ctx.fillRect(x, py, w, 1);
        }

        // Subtle CRT vignette
        const vignette = this.ctx.createRadialGradient(
            x + w / 2, y + h / 2, Math.min(w, h) * 0.45,
            x + w / 2, y + h / 2, Math.min(w, h) * 0.75
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = vignette;
        this.ctx.fillRect(x, y, w, h);

        this.ctx.restore();
    }

    drawGlassReflection(w, h) {
        // High-gloss diagonal glass reflection typical of convex CRT screens
        this.ctx.save();
        const reflection = this.ctx.createLinearGradient(0, 0, w, h * 0.7);
        reflection.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        reflection.addColorStop(0.3, 'rgba(255, 255, 255, 0.03)');
        reflection.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
        this.ctx.fillStyle = reflection;
        this.ctx.fillRect(0, 0, w, h);

        // Dark bezel inner border shadow
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(2, 2, w - 4, h - 4);
        this.ctx.restore();
    }
}
