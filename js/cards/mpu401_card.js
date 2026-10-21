/**
 * Roland MPU-401 MIDI Interface Modular Card
 * Implements MPU-401 in UART mode at base 0x330/0x331 with IRQ 9,
 * interfacing directly with Web MIDI API or browser software synthesizers.
 */

import { AdapterCard } from './adapter_card.js';

export class Mpu401Card extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'mpu401_card',
            name: 'Roland MPU-401 MIDI Interface',
            shortName: 'MPU-401 MIDI',
            slotType: 'ISA-8',
            category: 'Audio',
            description: 'Industry-standard Roland MPU-401 MIDI interface for Roland MT-32 and General MIDI sound modules.',
            pcbColor: '#1e3852',
            accentColor: '#d4af37',
            jumpers: {
                baseAddress: 0x330,
                irq: 9
            }
        }, config));

        this.uartMode = false;
        this.inputQueue = [];
        this.midiAccess = null;
        this.selectedMidiOutput = null;

        // Try initializing Web MIDI API if available in browser
        if (typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then((access) => {
                this.midiAccess = access;
                const outputs = Array.from(access.outputs.values());
                if (outputs.length > 0) {
                    this.selectedMidiOutput = outputs[0];
                }
            }).catch(() => {});
        }
    }

    getIOPortHandlers() {
        const base = this.jumpers.baseAddress;
        return [
            // MPU-401 Data Port (0x330)
            {
                port: base,
                read: () => {
                    this.pulseActivity();
                    return this.inputQueue.length > 0 ? this.inputQueue.shift() : 0xFE; // Active Sensing
                },
                write: (_, val) => {
                    this.pulseActivity();
                    this.sendMidiByte(val & 0xff);
                }
            },
            // MPU-401 Status / Command Port (0x331)
            {
                port: base + 1,
                read: () => {
                    // Bit 7: Output ready (0 = ready, 1 = busy)
                    // Bit 6: Input ready (0 = data waiting, 1 = no data)
                    const outReady = 0x00;
                    const inReady = this.inputQueue.length > 0 ? 0x00 : 0x40;
                    return outReady | inReady;
                },
                write: (_, val) => {
                    this.pulseActivity();
                    if (val === 0x3F) {
                        // Put in UART mode
                        this.uartMode = true;
                        this.inputQueue.push(0xFE); // ACK
                        if (this.bus) this.bus.raiseIRQ(this.jumpers.irq);
                    } else if (val === 0xFF) {
                        // Reset
                        this.uartMode = false;
                        this.inputQueue.push(0xFE); // ACK
                    }
                }
            }
        ];
    }

    sendMidiByte(b) {
        if (this.selectedMidiOutput) {
            try {
                this.selectedMidiOutput.send([b]);
            } catch (e) {}
        }
    }

    getIRQLines() {
        return [this.jumpers.irq];
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'ROLAND HD6801', x: 25, y: 15, w: 45, h: 25 },
                { name: 'MPU LOGIC', x: 75, y: 15, w: 30, h: 20 }
            ],
            leds: [
                { name: 'MIDI OUT', active: this.activityLed, color: '#33ccff' }
            ],
            bracketConnectors: ['DIN-5 MIDI IN', 'DIN-5 MIDI OUT']
        };
    }
}
