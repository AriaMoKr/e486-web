/**
 * Automated Unit Tests for Intel 80486DX CPU & RetroBus
 */

import assert from 'node:assert/strict';
import { RetroBus } from '../js/retro_bus.js';
import { Cpu486 } from '../js/cpu_486.js';
import { BiosRom } from '../js/bios_rom.js';

console.log('Running CPU 486 & System Bus Tests...');

const bus = new RetroBus(16);
const cpu = new Cpu486(bus);
const bios = new BiosRom(bus, cpu);
bios.install();

// 1. Verify Reset State & BIOS Vector
assert.equal(cpu.segments[cpu.CS], 0xF000, 'CS should initialize to 0xF000');
assert.equal(cpu.eip, 0xFFF0, 'EIP should initialize to 0xFFF0');
assert.equal(bus.memRead8(0xFFFFE), 0xFC, 'IBM PC/AT 486 system model byte should be 0xFC');

// 2. Verify A20 Gate Masking
bus.a20Enabled = true;
bus.memWrite8(0x000000, 0x11);
bus.memWrite8(0x100000, 0x22);
assert.equal(bus.memRead8(0x100000), 0x22, 'With A20 enabled, 1MB should read distinct memory');

bus.a20Enabled = false;
assert.equal(bus.memRead8(0x100000), 0x11, 'With A20 disabled, 0x100000 should wrap to 0x000000');
bus.a20Enabled = true;

// 3. Test 486 BSWAP instruction (0x66 0x0F 0xC8 = BSWAP EAX)
cpu.setSegment(cpu.CS, 0x0000);
cpu.eip = 0x1000;
cpu.regs[0] = 0x12345678; // EAX
bus.memWrite8(0x1000, 0x0F);
bus.memWrite8(0x1001, 0xC8); // BSWAP EAX
cpu.step();
assert.equal(cpu.regs[0] >>> 0, 0x78563412, 'BSWAP EAX should reverse byte order of 32-bit register');

// 4. Test 486 CPUID instruction (0x0F 0xA2)
cpu.eip = 0x1010;
cpu.regs[0] = 0; // Function 0: Vendor String
bus.memWrite8(0x1010, 0x0F);
bus.memWrite8(0x1011, 0xA2);
cpu.step();
assert.equal(cpu.regs[3], 0x756e6547, 'CPUID EBX should contain "Genu"');
assert.equal(cpu.regs[2], 0x49656e69, 'CPUID EDX should contain "ineI"');
assert.equal(cpu.regs[1], 0x6c65746e, 'CPUID ECX should contain "ntel"');

// 5. Test 486 XADD instruction (0x0F 0xC0 = XADD r/m8, r8)
cpu.eip = 0x1020;
cpu.regs8[0] = 10; // AL = 10
cpu.regs8[4] = 25; // CL = 25
bus.memWrite8(0x1020, 0x0F);
bus.memWrite8(0x1021, 0xC0);
bus.memWrite8(0x1022, 0xC8); // ModRM: reg=CL(1), rm=AL(0)
cpu.step();
assert.equal(cpu.regs8[0], 35, 'XADD AL, CL should store sum (35) in destination AL');
assert.equal(cpu.regs8[4], 10, 'XADD AL, CL should store original AL (10) in source CL');

// 6. Test Port I/O OUT & IN (Port 0x80 POST Diagnostic Port)
cpu.eip = 0x1030;
cpu.regs8[0] = 0x5A; // AL = 0x5A
bus.memWrite8(0x1030, 0xE6); // OUT 0x80, AL
bus.memWrite8(0x1031, 0x80);
cpu.step();
assert.equal(bus.busActivity.postCode, 0x5A, 'OUT 0x80, AL should update motherboard POST code');

// 7. Test Dual 8259 PIC Hardware Interrupt Routing
cpu.IF = true;
bus.raiseIRQ(5); // SoundBlaster IRQ 5 -> Vector 0x08 + 5 = 0x0D
const pendingVec = bus.getPendingInterrupt();
assert.equal(pendingVec, 0x0D, 'IRQ 5 should map to interrupt vector 0x0D');

console.log('✅ All CPU 486 & RetroBus tests passed!');
