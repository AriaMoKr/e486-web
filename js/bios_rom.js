/**
 * IBM PC Compatible System BIOS & Video Option ROM Loader
 * Supports loading real x86 SeaBIOS (data/bios.bin at 0xE0000-0xFFFFF) and
 * Bochs/Plex86 VGA BIOS (data/vgabios.bin at 0xC0000), as well as a minimal
 * fallback IVT/Reset stub for unit tests.
 */

export class BiosRom {
    constructor(bus, cpu) {
        this.bus = bus;
        this.cpu = cpu;
        if (this.bus) this.bus.bios = this;
        this.biosData = null;
        this.vgaBiosData = null;
    }

    /**
     * Loads a binary ROM image into physical memory.
     * Matches tiny386 load_rom(phys_mem, file, addr, backward).
     */
    loadRomBuffer(buffer, addr, backward = 0) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const len = bytes.byteLength;
        const startAddr = backward ? ((addr - len) >>> 0) : (addr >>> 0);
        if (startAddr + len <= this.bus.ram.byteLength) {
            this.bus.ram.set(bytes, startAddr);
        }
        return len;
    }

    /**
     * Installs real SeaBIOS (bios.bin) at top of 1MB (0x100000 - size) and
     * VGA BIOS (vgabios.bin) at 0xC0000.
     */
    loadRealBios(biosBuffer, vgaBiosBuffer) {
        if (biosBuffer) {
            this.biosData = new Uint8Array(biosBuffer.slice ? biosBuffer.slice(0) : biosBuffer);
        }
        if (vgaBiosBuffer) {
            this.vgaBiosData = new Uint8Array(vgaBiosBuffer.slice ? vgaBiosBuffer.slice(0) : vgaBiosBuffer);
        }
        this.reinstallRealBios();
    }

    /**
     * Restores pristine BIOS and VGA BIOS images into RAM (used on initial boot and Cold Reset).
     */
    reinstallRealBios() {
        if (this.vgaBiosData) {
            this.loadRomBuffer(this.vgaBiosData, 0xc0000, 0);
        }
        if (this.biosData) {
            this.loadRomBuffer(this.biosData, 0x100000, 1);
        }
    }

    /**
     * Fallback synchronous ROM setup for standalone CPU unit tests.
     */
    install() {
        if (this.biosData) {
            this.reinstallRealBios();
            return;
        }
        this.setupIvt();
        this.setupBda();
        this.setupResetVector();
    }

    setupIvt() {
        const romSeg = 0xF000;
        const handlers = [
            { vec: 0x10, offset: 0x1000 },
            { vec: 0x11, offset: 0x1100 },
            { vec: 0x12, offset: 0x1200 },
            { vec: 0x13, offset: 0x1300 },
            { vec: 0x14, offset: 0x1400 },
            { vec: 0x15, offset: 0x1500 },
            { vec: 0x16, offset: 0x1600 },
            { vec: 0x17, offset: 0x1700 },
            { vec: 0x19, offset: 0x1900 },
            { vec: 0x1A, offset: 0x1A00 },
            { vec: 0x08, offset: 0x0800 },
            { vec: 0x09, offset: 0x0900 }
        ];

        for (const h of handlers) {
            const ivtAddr = h.vec * 4;
            this.bus.memWrite16(ivtAddr, h.offset);
            this.bus.memWrite16(ivtAddr + 2, romSeg);

            const romAddr = (romSeg << 4) + h.offset;
            this.bus.memWrite8(romAddr, 0xCF);
        }
    }

    setupBda() {
        this.bus.memWrite16(0x00413, 640);
        this.bus.memWrite16(0x00410, 0x4423);
        this.bus.memWrite8(0x00449, 0x03);
        this.bus.memWrite16(0x0044A, 80);
    }

    setupResetVector() {
        const resetAddr = 0xFFFF0;
        this.bus.memWrite8(resetAddr + 0, 0xEA);
        this.bus.memWrite8(resetAddr + 1, 0x5B);
        this.bus.memWrite8(resetAddr + 2, 0xE0);
        this.bus.memWrite8(resetAddr + 3, 0x00);
        this.bus.memWrite8(resetAddr + 4, 0xF0);

        this.bus.memWrite8(0xFFFFE, 0xFC);
        this.bus.memWrite8(0xFFFFF, 0x01);

        const entry = 0xFE05B;
        const initCode = [
            0xFA,
            0x31, 0xC0,
            0x8E, 0xD8,
            0x8E, 0xC0,
            0x8E, 0xD0,
            0xBC, 0x00, 0x7C,
            0xFB,
            0xCD, 0x19,
            0xF4,
            0xEB, 0xFD
        ];
        for (let i = 0; i < initCode.length; i++) {
            this.bus.memWrite8(entry + i, initCode[i]);
        }
    }
}
