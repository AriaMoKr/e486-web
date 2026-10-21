/**
 * Internal PC Speaker Sound Module
 * Connects to Intel 8254 PIT Channel 2 and Port 0x61 to synthesize vintage
 * PC speaker square-wave beeps, chirps, and PWM audio directly in Web Audio.
 */

import { AdapterCard } from './adapter_card.js';

export class PcSpeakerCard extends AdapterCard {
    constructor(config = {}) {
        super(Object.assign({
            id: 'pcspeaker_card',
            name: 'IBM PC Internal Speaker Subsystem',
            shortName: 'PC Speaker',
            slotType: 'ISA-8',
            category: 'Audio',
            description: 'Internal piezoelectric speaker modulated by PIT Channel 2 and Port 0x61.',
            pcbColor: '#1e3820',
            accentColor: '#b89020',
            jumpers: {
                volume: 80,
                filterCutoff: 3200 // Low-pass filter for vintage conical speaker tone
            }
        }, config));

        this.audioCtx = null;
        this.masterGain = null;
        this.oscillator = null;
        this.gainNode = null;
        this.filterNode = null;
        this.isPlaying = false;
        this.currentFreq = 440;
    }

    initAudio(audioCtx, masterGainNode) {
        this.audioCtx = audioCtx;
        this.masterGain = masterGainNode;

        this.filterNode = this.audioCtx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = this.jumpers.filterCutoff;

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0;

        this.filterNode.connect(this.gainNode);
        this.gainNode.connect(this.masterGain);

        this.oscillator = this.audioCtx.createOscillator();
        this.oscillator.type = 'square';
        this.oscillator.frequency.value = 440;
        this.oscillator.connect(this.filterNode);
        this.oscillator.start();
    }

    tick(cycles) {
        if (!this.bus || !this.audioCtx || this.audioCtx.state === 'suspended') return;

        const port61 = this.bus.pit.port61Val;
        const gate = !!(port61 & 0x01); // PIT Channel 2 Gate
        const speakerOut = !!(port61 & 0x02); // Direct speaker data bit

        if (gate && speakerOut) {
            const reload = this.bus.pit.channels[2].reload || 1;
            // Frequency = 1193182 / reload
            const freq = Math.max(20, Math.min(20000, 1193182 / reload));

            if (!this.isPlaying || Math.abs(this.currentFreq - freq) > 2) {
                this.currentFreq = freq;
                this.oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
                this.gainNode.gain.setValueAtTime((this.jumpers.volume / 100) * 0.12, this.audioCtx.currentTime);
                this.isPlaying = true;
                this.pulseActivity();
            }
        } else if (this.isPlaying) {
            this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
            this.isPlaying = false;
        }
    }

    getPcbVisualData() {
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: 'PIEZO BUZZER', x: 30, y: 15, w: 35, h: 35 }
            ],
            leds: [
                { name: 'SPK', active: this.activityLed, color: '#ff3300' }
            ],
            bracketConnectors: ['Header Pins']
        };
    }
}
