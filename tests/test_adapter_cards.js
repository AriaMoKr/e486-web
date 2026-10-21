/**
 * Automated Unit Tests for Modular Adapter Cards (CGA, EGA, VGA, SoundBlaster 16, POST, Custom)
 */

import assert from 'node:assert/strict';
import { RetroBus } from '../js/retro_bus.js';
import { AdapterCard } from '../js/cards/adapter_card.js';
import { CgaCard } from '../js/cards/cga_card.js';
import { EgaCard } from '../js/cards/ega_card.js';
import { VgaCard } from '../js/cards/vga_card.js';
import { SoundBlasterCard } from '../js/cards/soundblaster_card.js';
import { PostDiagnosticCard } from '../js/cards/post_card.js';

console.log('Running Modular Adapter Card Tests...');

const bus = new RetroBus(16);

// 1. Test CGA Card Installation & VRAM Mapping at 0xB8000
const cga = new CgaCard();
bus.installCard(1, cga);
assert.equal(bus.getCard(1), cga, 'CGA card should be installed in Slot 1');

bus.memWrite8(0xB8000, 0x41); // 'A'
bus.memWrite8(0xB8001, 0x1F); // White on Blue
assert.equal(cga.vram[0], 0x41, 'Writing to 0xB8000 should update CGA VRAM');
assert.equal(bus.memRead8(0xB8001), 0x1F, 'Reading from 0xB8001 should return CGA attribute');

// Test CGA 6845 CRTC Registers (0x3D4 / 0x3D5)
bus.ioWrite(0x3D4, 0x0E); // Cursor Location High Register
bus.ioWrite(0x3D5, 0x12);
assert.equal(bus.ioRead(0x3D5), 0x12, 'CGA CRTC register 0x0E should store 0x12');

// 2. Test Swapping CGA for EGA Planar Card in Slot 1
const ega = new EgaCard();
bus.installCard(1, ega);
assert.equal(bus.getCard(1), ega, 'EGA card should replace CGA in Slot 1');

// Write to EGA Plane 2 only (Sequencer Map Mask Reg 2 = 0x04)
bus.ioWrite(0x3C4, 0x02);
bus.ioWrite(0x3C5, 0x04); // Plane 2 write enable
bus.memWrite8(0xA0000, 0xBE);
assert.equal(ega.planes[2][0], 0xBE, 'EGA Plane 2 should receive byte 0xBE');
assert.equal(ega.planes[0][0], 0x00, 'EGA Plane 0 should remain untouched');

// Read back from EGA Plane 2 via Graphics Controller Read Map Select (Reg 4 = 2)
bus.ioWrite(0x3CE, 0x04);
bus.ioWrite(0x3CF, 0x02);
assert.equal(bus.memRead8(0xA0000), 0xBE, 'Reading 0xA0000 with Read Map=2 should return 0xBE');

// 3. Test Swapping EGA for VGA Card & RAMDAC 256-color Palette (0x3C8 / 0x3C9)
const vga = new VgaCard();
bus.installCard(1, vga);
bus.ioWrite(0x3C8, 64); // Write DAC color index 64
bus.ioWrite(0x3C9, 63); // R = max (6-bit)
bus.ioWrite(0x3C9, 32); // G = mid
bus.ioWrite(0x3C9, 0);  // B = 0

bus.ioWrite(0x3C7, 64); // Read DAC color index 64
assert.equal(bus.ioRead(0x3C9), 63, 'VGA DAC R channel should read 63');
assert.equal(bus.ioRead(0x3C9), 32, 'VGA DAC G channel should read 32');

// 4. Test SoundBlaster 16 Card & Jumper Remapping (0x220 -> 0x240)
const sb16 = new SoundBlasterCard();
bus.installCard(2, sb16);

// Reset DSP at 0x226 (Write 1, then 0 -> Read 0xAA at 0x22A)
bus.ioWrite(0x226, 1);
bus.ioWrite(0x226, 0);
assert.equal(bus.ioRead(0x22A), 0xAA, 'SoundBlaster DSP reset should return 0xAA ready byte');

// Query DSP Version (0xE1 at 0x22C -> 4.05)
bus.ioWrite(0x22C, 0xE1);
assert.equal(bus.ioRead(0x22A), 0x04, 'SB16 DSP major version should be 4');
assert.equal(bus.ioRead(0x22A), 0x05, 'SB16 DSP minor version should be 5');

// Change SoundBlaster Base Address Jumper from 0x220 to 0x240 dynamically
sb16.jumpers.baseAddress = 0x240;
sb16.applyJumpers();
bus.ioWrite(0x246, 1);
bus.ioWrite(0x246, 0);
assert.equal(bus.ioRead(0x24A), 0xAA, 'SoundBlaster should respond at new jumper address 0x240');

// 5. Test POST Diagnostic Card (Port 0x80)
const post = new PostDiagnosticCard();
bus.installCard(4, post);
bus.ioWrite(0x80, 0x28);
assert.equal(post.getHexCode(), '28', 'POST card should display hex code 28');

// 6. Test User-Defined Custom Adapter Card in Slot 6
const customCard = new AdapterCard({
    name: 'User Custom GPIO Card',
    slotType: 'ISA-8',
    category: 'Custom'
});
customCard.latch = 0x00;
customCard.getIOPortHandlers = () => [
    {
        port: 0x300,
        read: () => customCard.latch,
        write: (_, val) => { customCard.latch = (val ^ 0xFF) & 0xFF; } // Invert bits on write
    }
];
bus.installCard(6, customCard);
bus.ioWrite(0x300, 0x0F);
assert.equal(bus.ioRead(0x300), 0xF0, 'Custom card on Slot 6 should process I/O port 0x300');

console.log('✅ All Modular Adapter Card tests passed!');
