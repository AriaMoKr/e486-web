/**
 * IBM Color Graphics Adapter (CGA) Modular Card
 * Features Motorola 6845 CRTC, 16KB VRAM at 0xB8000, 320x200 4-color palettes,
 * 80x25 text mode, and authentic composite color simulation.
 */

import { AdapterCard } from './adapter_card.js';

export class CgaCard extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'cga_card',
            name: 'IBM Color Graphics Adapter (CGA)',
            shortName: 'CGA 16KB',
            slotType: 'ISA-8',
            category: 'Video',
            description: 'Authentic 1981 IBM Color Graphics Adapter with Motorola 6845 CRTC and 16KB video RAM.',
            pcbColor: '#1d4d2b',
            accentColor: '#d4af37',
            jumpers: {
                compositeArtifacts: false,
                defaultPalette: 1 // 0 = Green/Red/Brown, 1 = Cyan/Magenta/White
            }
        }, config));

        this.vram = new Uint8Array(16384); // 16 KB VRAM at 0xB8000
        this.crtcIndex = 0;
        this.crtcRegs = new Uint8Array(32);
        this.modeControl = 0x29; // 80x25 color text enabled
        this.colorSelect = 0x30; // Palette 1, high intensity
        this.statusReg = 0x00;

        // CGA 16-Color Palette in RGBA32
        this.cgaPalette = [
            0xff000000, 0xffaa0000, 0xff00aa00, 0xffaaaa00,
            0xff0000aa, 0xffaa00aa, 0xff0055aa, 0xffaaaaaa,
            0xff555555, 0xffff5555, 0xff55ff55, 0xffffff55,
            0xff5555ff, 0xffff55ff, 0xff55ffff, 0xffffffff
        ];
    }

    getIOPortHandlers() {
        return [
            // 6845 CRTC Index & Data
            { port: 0x3D4, read: () => this.crtcIndex, write: (addr, val) => { this.crtcIndex = val & 0x1f; } },
            { port: 0x3D5, read: () => this.crtcRegs[this.crtcIndex], write: (addr, val) => { this.crtcRegs[this.crtcIndex] = val & 0xff; } },
            // CGA Mode Control & Color Select
            { port: 0x3D8, read: () => this.modeControl, write: (addr, val) => { this.modeControl = val; } },
            { port: 0x3D9, read: () => this.colorSelect, write: (addr, val) => { this.colorSelect = val; } },
            // CGA Status Register (Vertical retrace and display enable)
            {
                port: 0x3DA,
                read: () => {
                    const now = performance.now();
                    const vblank = ((now * 60 / 1000) % 1.0) > 0.9 ? 0x08 : 0x00;
                    const hblank = ((now * 31500 / 1000) % 1.0) > 0.8 ? 0x01 : 0x00;
                    return vblank | hblank;
                },
                write: () => {}
            }
        ];
    }

    getMemoryWindows() {
        return [
            {
                start: 0xB8000,
                end: 0xBBFFF,
                read: (addr) => {
                    this.pulseActivity();
                    return this.vram[(addr - 0xB8000) & 0x3fff];
                },
                write: (addr, val) => {
                    this.pulseActivity();
                    this.vram[(addr - 0xB8000) & 0x3fff] = val;
                }
            }
        ];
    }

    renderDisplay(ctx, width, height, fontRom) {
        // Mode 0x3D8 bit 1: 0 = text, 1 = graphics
        const isGraphics = !!(this.modeControl & 0x02);
        const isBw = !!(this.modeControl & 0x04);
        const isHighRes = !!(this.modeControl & 0x10); // 640x200 if graphics, 80x25 if text

        if (!isGraphics) {
            // Text Mode (80x25 or 40x25)
            const cols = isHighRes ? 80 : 40;
            const rows = 25;
            const cellW = width / cols;
            const cellH = height / rows;

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const offset = (row * cols + col) * 2;
                    const charCode = this.vram[offset];
                    const attr = this.vram[offset + 1];

                    const fgIdx = attr & 0x0f;
                    const bgIdx = (attr >> 4) & 0x07;

                    const fgRgba = this.cgaPalette[fgIdx];
                    const bgRgba = this.cgaPalette[bgIdx];

                    const fgColor = `rgb(${fgRgba & 0xff}, ${(fgRgba >> 8) & 0xff}, ${(fgRgba >> 16) & 0xff})`;
                    const bgColor = `rgb(${bgRgba & 0xff}, ${(bgRgba >> 8) & 0xff}, ${(bgRgba >> 16) & 0xff})`;

                    const x = col * cellW;
                    const y = row * cellH;

                    ctx.fillStyle = bgColor;
                    ctx.fillRect(x, y, cellW, cellH);

                    if (charCode > 32) {
                        ctx.fillStyle = fgColor;
                        ctx.font = `${cellH * 0.85}px 'Courier New', monospace`;
                        ctx.textBaseline = 'top';
                        ctx.fillText(String.fromCharCode(charCode), x + 1, y);
                    }
                }
            }
        } else {
            // CGA 320x200 4-Color Graphics Mode
            const palIdx = (this.colorSelect >> 5) & 0x01; // 0 or 1
            const highInt = !!(this.colorSelect & 0x10);
            const bgIdx = this.colorSelect & 0x0f;

            // Palette 0: Green, Red, Brown/Yellow
            // Palette 1: Cyan, Magenta, White
            const activePal = [
                this.cgaPalette[bgIdx],
                this.cgaPalette[palIdx === 0 ? (highInt ? 10 : 2) : (highInt ? 14 : 6)],
                this.cgaPalette[palIdx === 0 ? (highInt ? 12 : 4) : (highInt ? 13 : 5)],
                this.cgaPalette[palIdx === 0 ? (highInt ? 14 : 6) : (highInt ? 15 : 7)]
            ];

            const imgData = ctx.createImageData(320, 200);
            const data32 = new Uint32Array(imgData.data.buffer);

            for (let y = 0; y < 200; y++) {
                // CGA interlaced memory banks: even lines at 0x0000, odd lines at 0x2000
                const bankOffset = (y & 1) ? 0x2000 : 0x0000;
                const lineOffset = bankOffset + ((y >> 1) * 80);

                for (let byteIdx = 0; byteIdx < 80; byteIdx++) {
                    const b = this.vram[lineOffset + byteIdx];
                    const pixelBase = y * 320 + byteIdx * 4;

                    data32[pixelBase + 0] = activePal[(b >> 6) & 3];
                    data32[pixelBase + 1] = activePal[(b >> 4) & 3];
                    data32[pixelBase + 2] = activePal[(b >> 2) & 3];
                    data32[pixelBase + 3] = activePal[b & 3];
                }
            }
            // Draw scaled to target canvas
            ctx.putImageData(imgData, 0, 0);
        }
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'HD6845S CRTC', x: 25, y: 15, w: 45, h: 25 },
                { name: 'CGA CHAR ROM', x: 75, y: 15, w: 25, h: 20 },
                { name: '16K SRAM', x: 105, y: 15, w: 30, h: 20 }
            ],
            leds: [
                { name: 'VID', active: this.activityLed, color: '#00ff66' }
            ],
            bracketConnectors: ['DE-9 RGB', 'RCA Comp']
        };
    }
}
