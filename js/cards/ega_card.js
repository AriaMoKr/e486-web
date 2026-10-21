/**
 * IBM Enhanced Graphics Adapter (EGA) Modular Card
 * Features 256KB Planar Video RAM (4 x 64KB planes), 16 colors from 64-color palette,
 * 640x350 graphics, 320x200 16-color, and EGA CRTC/Sequencer registers.
 */

import { AdapterCard } from './adapter_card.js';

export class EgaCard extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'ega_card',
            name: 'IBM Enhanced Graphics Adapter (EGA)',
            shortName: 'EGA 256KB',
            slotType: 'ISA-8',
            category: 'Video',
            description: '1984 IBM EGA with 256KB 4-plane video RAM, 64-color palette, and 640x350 graphics.',
            pcbColor: '#174228',
            accentColor: '#c8a032',
            jumpers: {
                monitorType: 'Enhanced Color Display (ECD)',
                dipSwitches: 0b1001 // Primary EGA ECD
            }
        }, config));

        // 4 x 64KB Planes = 256KB VRAM
        this.planes = [
            new Uint8Array(65536),
            new Uint8Array(65536),
            new Uint8Array(65536),
            new Uint8Array(65536)
        ];
        this.latch = new Uint8Array(4);

        // EGA Registers
        this.seqIndex = 0;
        this.seqRegs = new Uint8Array(8); // Reg 2 = Map Mask
        this.seqRegs[2] = 0x0f; // Enable all planes for writing by default

        this.gcIndex = 0;
        this.gcRegs = new Uint8Array(16); // Reg 4 = Read Map Select, Reg 5 = Mode, Reg 8 = Bit Mask
        this.gcRegs[8] = 0xff; // Bit mask default

        this.crtcIndex = 0;
        this.crtcRegs = new Uint8Array(32);

        this.attrIndex = 0;
        this.attrFlipFlop = 0;
        this.attrRegs = new Uint8Array(32);
        // Default 16-color palette pointing to standard EGA colors
        for (let i = 0; i < 16; i++) {
            this.attrRegs[i] = i;
        }

        this.miscOutput = 0x23;

        // Full 64-color EGA Master Palette
        this.masterPalette64 = new Uint32Array(64);
        for (let i = 0; i < 64; i++) {
            const r = (((i >> 2) & 1) * 0xAA) + (((i >> 5) & 1) * 0x55);
            const g = (((i >> 1) & 1) * 0xAA) + (((i >> 4) & 1) * 0x55);
            const b = ((i & 1) * 0xAA) + (((i >> 3) & 1) * 0x55);
            this.masterPalette64[i] = 0xff000000 | (b << 16) | (g << 8) | r;
        }
    }

    getIOPortHandlers() {
        return [
            // Sequencer (0x3C4 / 0x3C5)
            { port: 0x3C4, read: () => this.seqIndex, write: (_, val) => { this.seqIndex = val & 0x07; } },
            { port: 0x3C5, read: () => this.seqRegs[this.seqIndex], write: (_, val) => { this.seqRegs[this.seqIndex] = val & 0xff; } },
            // Graphics Controller (0x3CE / 0x3CF)
            { port: 0x3CE, read: () => this.gcIndex, write: (_, val) => { this.gcIndex = val & 0x0f; } },
            { port: 0x3CF, read: () => this.gcRegs[this.gcIndex], write: (_, val) => { this.gcRegs[this.gcIndex] = val & 0xff; } },
            // Attribute Controller (0x3C0 / 0x3C1)
            {
                port: 0x3C0,
                read: () => this.attrRegs[this.attrIndex],
                write: (_, val) => {
                    if (this.attrFlipFlop === 0) {
                        this.attrIndex = val & 0x1f;
                        this.attrFlipFlop = 1;
                    } else {
                        this.attrRegs[this.attrIndex] = val & 0x3f;
                        this.attrFlipFlop = 0;
                    }
                }
            },
            { port: 0x3C1, read: () => this.attrRegs[this.attrIndex], write: () => {} },
            // CRTC (0x3D4 / 0x3D5)
            { port: 0x3D4, read: () => this.crtcIndex, write: (_, val) => { this.crtcIndex = val & 0x1f; } },
            { port: 0x3D5, read: () => this.crtcRegs[this.crtcIndex], write: (_, val) => { this.crtcRegs[this.crtcIndex] = val & 0xff; } },
            // Status Register & Reset Flip-Flop
            {
                port: 0x3DA,
                read: () => {
                    this.attrFlipFlop = 0; // Reading 0x3DA resets Attribute flip-flop to address state
                    const now = performance.now();
                    return (((now * 60 / 1000) % 1.0) > 0.9 ? 0x08 : 0x00) | (((now * 31500 / 1000) % 1.0) > 0.8 ? 0x01 : 0x00);
                },
                write: () => {}
            },
            // Misc Output
            { port: 0x3C2, read: () => this.miscOutput, write: (_, val) => { this.miscOutput = val & 0xff; } }
        ];
    }

    getMemoryWindows() {
        return [
            {
                start: 0xA0000,
                end: 0xBFFFF,
                read: (addr) => this.readVram(addr),
                write: (addr, val) => this.writeVram(addr, val)
            }
        ];
    }

    readVram(addr) {
        this.pulseActivity();
        const offset = (addr - 0xA0000) & 0xffff;
        // Load latches from all 4 planes
        for (let p = 0; p < 4; p++) {
            this.latch[p] = this.planes[p][offset];
        }
        // Read Map Select specifies which plane to return to CPU
        const readPlane = this.gcRegs[4] & 0x03;
        return this.latch[readPlane];
    }

    writeVram(addr, val) {
        this.pulseActivity();
        const offset = (addr - 0xA0000) & 0xffff;
        const mapMask = this.seqRegs[2] & 0x0f; // Write enable for each plane
        const bitMask = this.gcRegs[8];

        for (let p = 0; p < 4; p++) {
            if (mapMask & (1 << p)) {
                // Apply bit mask and write
                const prev = this.latch[p];
                this.planes[p][offset] = (val & bitMask) | (prev & ~bitMask);
            }
        }
    }

    renderDisplay(ctx, width, height) {
        // Render EGA 640x350 or 320x200
        const is350 = (this.crtcRegs[9] & 0x1f) >= 13;
        const renderW = is350 ? 640 : 320;
        const renderH = is350 ? 350 : 200;

        const imgData = ctx.createImageData(renderW, renderH);
        const data32 = new Uint32Array(imgData.data.buffer);
        const bytesPerRow = renderW / 8;

        for (let y = 0; y < renderH; y++) {
            const lineOffset = y * bytesPerRow;
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
                const off = lineOffset + xByte;
                const p0 = this.planes[0][off];
                const p1 = this.planes[1][off];
                const p2 = this.planes[2][off];
                const p3 = this.planes[3][off];

                const pixelBase = y * renderW + (xByte * 8);

                for (let bit = 0; bit < 8; bit++) {
                    const shift = 7 - bit;
                    const colorIndex =
                        (((p0 >> shift) & 1) << 0) |
                        (((p1 >> shift) & 1) << 1) |
                        (((p2 >> shift) & 1) << 2) |
                        (((p3 >> shift) & 1) << 3);

                    const paletteEntry = this.attrRegs[colorIndex & 0x0f];
                    data32[pixelBase + bit] = this.masterPalette64[paletteEntry & 0x3f];
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'EGA CRTC', x: 20, y: 15, w: 40, h: 25 },
                { name: 'EGA SEQ/GC', x: 65, y: 15, w: 40, h: 25 },
                { name: '256K VRAM', x: 110, y: 15, w: 45, h: 25 }
            ],
            leds: [
                { name: 'EGA ACT', active: this.activityLed, color: '#33ccff' }
            ],
            bracketConnectors: ['DE-9 RGB', 'RCA Jack 1', 'RCA Jack 2']
        };
    }
}
