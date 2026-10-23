/**
 * Novell NE2000 10BASE-T Ethernet Adapter Modular Card
 * Industry-standard 16-bit ISA Network Interface Card (NIC) based on the
 * National Semiconductor DP8390 controller with 16KB dual-port packet buffer.
 */

import { AdapterCard } from './adapter_card.js';

export class Ne2000Card extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'ne2000_card',
            name: 'Novell NE2000 Ethernet Adapter (10BASE-T)',
            shortName: 'NE2000 LAN',
            slotType: 'ISA-16',
            category: 'Network',
            description: '16-bit ISA Ethernet network interface card with DP8390 controller, 16KB SRAM packet buffer, and RJ45/BNC connectors.',
            pcbColor: '#1d4838', // Vintage solder-mask green
            accentColor: '#c8a432',
            jumpers: {
                baseAddress: 0x300, // 0x280, 0x300, 0x320, 0x340, 0x360
                irq: 9,             // IRQ 3, 5, 9 (2/9), 10, 11
                media: '10BASE-T'
            }
        }, config));

        // 16KB Onboard SRAM Buffer (pages 0x40 - 0x7F)
        this.mem = new Uint8Array(16384);
        this.mac = new Uint8Array([0x52, 0x54, 0x00, 0x12, 0x34, 0x56]); // QEMU/Realtek style MAC

        // DP8390 Registers
        this.cmd = 0x21;       // STP=1, STA=0, RD=4 (Abort/Complete)
        this.page = 0;         // Current register page (0, 1, 2)
        this.isr = 0x00;       // Interrupt Status Register
        this.imr = 0x00;       // Interrupt Mask Register
        this.dcr = 0x00;       // Data Configuration Register
        this.tcr = 0x00;       // Transmit Configuration Register
        this.rcr = 0x00;       // Receive Configuration Register
        this.tsr = 0x01;       // Transmit Status Register (PTX)
        this.rsr = 0x01;       // Receive Status Register (PRX)

        this.pstart = 0x40;    // Ring buffer start page
        this.pstop = 0x80;     // Ring buffer stop page
        this.bnry = 0x40;      // Boundary page pointer
        this.curr = 0x40;      // Current page pointer
        this.tpsr = 0x40;      // Transmit page start
        this.tbcr = 0;         // Transmit byte count

        this.rsar = 0;         // Remote start address (16-bit)
        this.rbcr = 0;         // Remote byte count (16-bit)

        this.multicast = new Uint8Array(8);

        // Packet statistics
        this.packetsTx = 0;
        this.packetsRx = 0;
        this.bytesTx = 0;
        this.bytesRx = 0;
        this.linkUp = true;
    }

    onReset() {
        super.onReset();
        this.cmd = 0x21; // Stop bit set
        this.isr = 0x00;
        this.imr = 0x00;
        this.dcr = 0x00;
        this.tcr = 0x00;
        this.rcr = 0x00;
        this.tsr = 0x01;
        this.rsr = 0x01;
        this.rsar = 0;
        this.rbcr = 0;
        this.pstart = 0x40;
        this.pstop = 0x80;
        this.bnry = 0x40;
        this.curr = 0x40;
    }

    updateIrq() {
        if (!this.bus) return;
        const pending = (this.isr & this.imr) !== 0;
        if (pending) {
            this.bus.raiseIRQ(this.jumpers.irq);
        } else {
            this.bus.lowerIRQ(this.jumpers.irq);
        }
    }

    getIRQLines() {
        return [this.jumpers.irq];
    }

    getIOPortHandlers() {
        const base = this.jumpers.baseAddress;
        const handlers = [];

        // DP8390 Registers (0x00 - 0x0F)
        for (let offset = 0; offset <= 0x0F; offset++) {
            handlers.push({
                port: base + offset,
                read: () => this.readNicRegister(offset),
                write: (_, val) => this.writeNicRegister(offset, val & 0xff)
            });
        }

        // NE2000 ASIC Remote DMA Data Port (0x10) - 8-bit & 16-bit
        handlers.push({
            port: base + 0x10,
            read: () => this.readDataPort(),
            write: (_, val) => this.writeDataPort(val)
        });

        // Reset Port (0x1F)
        handlers.push({
            port: base + 0x1F,
            read: () => {
                this.onReset();
                this.pulseActivity();
                return 0x00;
            },
            write: () => {
                this.onReset();
                this.pulseActivity();
            }
        });

        return handlers;
    }

    readNicRegister(offset) {
        if (offset === 0x00) {
            return this.cmd;
        }

        switch (this.page) {
            case 0: // Page 0: Operational Registers
                switch (offset) {
                    case 0x01: return 0x00;
                    case 0x02: return 0x00;
                    case 0x03: return this.bnry;
                    case 0x04: return this.tsr;
                    case 0x05: return 0x00; // NCR (Number of collisions)
                    case 0x06: return 0x00; // FIFO
                    case 0x07: return this.isr;
                    case 0x08: return this.rsar & 0xff;
                    case 0x09: return (this.rsar >> 8) & 0xff;
                    case 0x0A: return 0x00;
                    case 0x0B: return 0x00;
                    case 0x0C: return this.rsr;
                    case 0x0D: return 0x00;
                    case 0x0E: return 0x00;
                    case 0x0F: return 0x00;
                }
                break;

            case 1: // Page 1: Physical & Multicast Addresses
                if (offset >= 0x01 && offset <= 0x06) {
                    return this.mac[offset - 1];
                }
                if (offset === 0x07) {
                    return this.curr;
                }
                if (offset >= 0x08 && offset <= 0x0F) {
                    return this.multicast[offset - 0x08];
                }
                break;

            case 2: // Page 2: Diagnostic Registers
                switch (offset) {
                    case 0x01: return this.pstart;
                    case 0x02: return this.pstop;
                    case 0x04: return this.tpsr;
                    case 0x0C: return this.rcr;
                    case 0x0D: return this.tcr;
                    case 0x0E: return this.dcr;
                    case 0x0F: return this.imr;
                }
                break;
        }

        return 0x00;
    }

    writeNicRegister(offset, val) {
        if (offset === 0x00) {
            this.cmd = val;
            this.page = (val >> 6) & 0x03;

            // Check TXP (Transmit Packet) bit 2
            if (val & 0x04) {
                this.transmitPacket();
            }
            return;
        }

        switch (this.page) {
            case 0:
                switch (offset) {
                    case 0x01: this.pstart = val; break;
                    case 0x02: this.pstop = val; break;
                    case 0x03: this.bnry = val; break;
                    case 0x04: this.tpsr = val; break;
                    case 0x05: this.tbcr = (this.tbcr & 0xff00) | val; break;
                    case 0x06: this.tbcr = (this.tbcr & 0x00ff) | (val << 8); break;
                    case 0x07: // Acknowledge interrupts by writing 1s to ISR
                        this.isr &= ~val;
                        this.updateIrq();
                        break;
                    case 0x08: this.rsar = (this.rsar & 0xff00) | val; break;
                    case 0x09: this.rsar = (this.rsar & 0x00ff) | (val << 8); break;
                    case 0x0A: this.rbcr = (this.rbcr & 0xff00) | val; break;
                    case 0x0B: this.rbcr = (this.rbcr & 0x00ff) | (val << 8); break;
                    case 0x0C: this.rcr = val; break;
                    case 0x0D: this.tcr = val; break;
                    case 0x0E: this.dcr = val; break;
                    case 0x0F:
                        this.imr = val;
                        this.updateIrq();
                        break;
                }
                break;

            case 1:
                if (offset >= 0x01 && offset <= 0x06) {
                    this.mac[offset - 1] = val;
                } else if (offset === 0x07) {
                    this.curr = val;
                } else if (offset >= 0x08 && offset <= 0x0F) {
                    this.multicast[offset - 0x08] = val;
                }
                break;
        }
    }

    readDataPort() {
        this.pulseActivity();
        let val = 0;

        // Check if reading PROM (first 32 bytes)
        if (this.rsar < 32) {
            const promIdx = Math.floor(this.rsar / 2);
            if (promIdx < 6) {
                val = this.mac[promIdx];
            } else if (promIdx === 7) {
                val = 0x57; // Novell signature byte
            } else {
                val = 0x00;
            }
        } else {
            // Read from 16KB packet buffer
            const memOffset = (this.rsar - 0x4000) & 0x3FFF;
            val = this.mem[memOffset];
        }

        this.rsar = (this.rsar + 1) & 0xFFFF;
        if (this.rbcr > 0) {
            this.rbcr--;
            if (this.rbcr === 0) {
                this.isr |= 0x40; // RDC (Remote DMA Complete)
                this.updateIrq();
            }
        }
        return val;
    }

    writeDataPort(val) {
        this.pulseActivity();
        if (this.rsar >= 0x4000) {
            const memOffset = (this.rsar - 0x4000) & 0x3FFF;
            this.mem[memOffset] = val & 0xff;
        }

        this.rsar = (this.rsar + 1) & 0xFFFF;
        if (this.rbcr > 0) {
            this.rbcr--;
            if (this.rbcr === 0) {
                this.isr |= 0x40; // RDC
                this.updateIrq();
            }
        }
    }

    transmitPacket() {
        this.pulseActivity();
        const startAddr = (this.tpsr * 256 - 0x4000) & 0x3FFF;
        const len = Math.min(this.tbcr, 1536);

        if (len > 0) {
            const packet = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                packet[i] = this.mem[(startAddr + i) & 0x3FFF];
            }

            this.packetsTx++;
            this.bytesTx += len;

            // Handle potential loopback or ARP self-response
            if (this.tcr & 0x06) {
                this.receivePacket(packet);
            }
        }

        // Clear TXP bit in CMD
        this.cmd &= ~0x04;
        this.tsr = 0x01; // PTX (Packet Transmitted Successfully)
        this.isr |= 0x02; // PTX Interrupt
        this.updateIrq();
    }

    receivePacket(packet) {
        if (!packet || packet.length === 0) return;
        this.pulseActivity();

        const len = packet.length;
        const pagesNeeded = Math.ceil((len + 4) / 256);
        let nextPage = this.curr + pagesNeeded;
        if (nextPage >= this.pstop) {
            nextPage = this.pstart + (nextPage - this.pstop);
        }

        // DP8390 Packet Header: [status, next_page, len_lo, len_hi]
        const header = new Uint8Array([
            0x01,                   // Status: packet received intact
            nextPage,               // Next packet page pointer
            (len + 4) & 0xff,       // Total length low
            ((len + 4) >> 8) & 0xff // Total length high
        ]);

        let writeOffset = (this.curr * 256 - 0x4000) & 0x3FFF;
        for (let i = 0; i < 4; i++) {
            this.mem[writeOffset] = header[i];
            writeOffset = (writeOffset + 1) & 0x3FFF;
        }

        for (let i = 0; i < len; i++) {
            this.mem[writeOffset] = packet[i];
            writeOffset = (writeOffset + 1) & 0x3FFF;
        }

        this.curr = nextPage;
        this.rsr = 0x01;  // PRX (Packet Received Intact)
        this.isr |= 0x01; // PRX Interrupt
        this.packetsRx++;
        this.bytesRx += len;
        this.updateIrq();
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'DP8390CN NIC', x: 25, y: 15, w: 45, h: 28 },
                { name: '16KB SRAM', x: 80, y: 15, w: 30, h: 22 },
                { name: 'PE-68023 TRANS', x: 120, y: 15, w: 25, h: 20 },
                { name: '10BASE-T RJ45', x: 155, y: 12, w: 22, h: 26 }
            ],
            leds: [
                { name: 'LINK', active: this.linkUp, color: '#00ff66' },
                { name: 'ACT', active: this.activityLed, color: '#ffbb00' }
            ],
            bracketConnectors: ['RJ-45 10BASE-T', 'BNC 10BASE-2 Thinnet']
        };
    }
}
