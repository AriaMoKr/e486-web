/**
 * ISA POST Diagnostic Debug Card
 * Plugs into any 8-bit or 16-bit ISA slot. Captures port 0x80 BIOS Power-On Self-Test
 * hex codes and displays them on dual 7-segment LEDs with checkpoint explanations.
 */

import { AdapterCard } from './adapter_card.js';

export class PostDiagnosticCard extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'post_card',
            name: 'ISA Dual 7-Segment POST Diagnostic Card',
            shortName: 'POST Debug Card',
            slotType: 'ISA-8',
            category: 'Diagnostic',
            description: 'Hardware diagnostic card capturing Port 0x80 POST checkpoints on dual red 7-segment LEDs.',
            pcbColor: '#8a1c1c', // Diagnostic card red PCB
            accentColor: '#d4af37',
            jumpers: {
                portAddress: 0x80
            }
        }, config));

        this.currentCode = 0x00;
        this.history = [];
        this.postDescriptions = {
            0x00: 'System Reset / Initialization',
            0x01: 'Processor Register Test Passed',
            0x02: 'Verifying Real Mode / Flags',
            0x03: 'Power-On Delay & Clock Gen Check',
            0x04: 'Keyboard Controller Self-Test',
            0x05: 'Initializing 8254 Timer Channel 0',
            0x06: 'Initializing Dynamic RAM Refresh',
            0x07: 'Testing Base 64KB RAM',
            0x08: 'Base 64KB RAM Verified OK',
            0x0A: 'Initializing 8259 Interrupt Controller',
            0x10: 'Searching for Option ROMs',
            0x20: 'Initializing Video Display Adapter',
            0x28: 'Video RAM & Sync Verified OK',
            0x30: 'Keyboard Interconnect Verification',
            0x40: 'Testing Extended Memory above 1MB',
            0x50: 'Initializing IDE / Floppy Controllers',
            0x60: 'Reading Boot Sector from Disk',
            0xAA: 'System Boot OK - Transferring to OS',
            0xFF: 'POST Completed / OS Running'
        };
    }

    getIOPortHandlers() {
        return [
            {
                port: this.jumpers.portAddress,
                read: () => this.currentCode,
                write: (_, val) => {
                    this.currentCode = val & 0xff;
                    this.history.push({
                        code: this.currentCode,
                        hex: this.currentCode.toString(16).toUpperCase().padStart(2, '0'),
                        desc: this.postDescriptions[this.currentCode] || 'Subsystem Checkpoint',
                        time: performance.now()
                    });
                    if (this.history.length > 50) this.history.shift();
                    this.pulseActivity();
                }
            }
        ];
    }

    getHexCode() {
        return this.currentCode.toString(16).toUpperCase().padStart(2, '0');
    }

    getDescription() {
        return this.postDescriptions[this.currentCode] || `Hardware Checkpoint 0x${this.getHexCode()}`;
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'GAL22V10 PLD', x: 25, y: 15, w: 35, h: 25 },
                { name: `[ ${this.getHexCode()} ] 7-SEG`, x: 70, y: 15, w: 45, h: 30 }
            ],
            leds: [
                { name: 'RST', active: this.currentCode === 0, color: '#ff0000' },
                { name: 'CLK', active: true, color: '#00ff66' },
                { name: 'ACT', active: this.activityLed, color: '#ffcc00' }
            ],
            bracketConnectors: ['None (Internal Card)']
        };
    }
}
