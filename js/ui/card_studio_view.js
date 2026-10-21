/**
 * Custom Card Studio View Controller
 * Provides an in-browser IDE, starter templates, live I/O port test harness,
 * and hot-plug capability so users can design and install their own ISA/VLB adapter cards.
 */

import { AdapterCard } from '../cards/adapter_card.js';

export class CardStudioView {
    constructor(app) {
        this.app = app;
        this.activePreviewCard = null;
        this.customCardsList = [];

        this.templates = {
            gpio_led: {
                name: '8-Bit GPIO & LED Register Card',
                code: `// Custom 8-Bit GPIO & Visual LED Bar Adapter Card
return {
    name: "Custom 8-Bit GPIO LED Card",
    shortName: "GPIO-8 LED",
    slotType: "ISA-8",
    category: "Custom I/O",
    pcbColor: "#1b4d3e",
    description: "Maps I/O port 0x300 to an 8-bit latch driving 8 diagnostic LEDs.",
    state: {
        latch: 0xAA,
        readCount: 0
    },
    getIOPortHandlers() {
        return [
            {
                port: 0x300,
                read: () => {
                    this.state.readCount++;
                    this.pulseActivity();
                    return this.state.latch;
                },
                write: (port, val) => {
                    this.state.latch = val & 0xFF;
                    this.pulseActivity();
                }
            },
            {
                port: 0x301,
                read: () => this.state.readCount & 0xFF,
                write: () => { this.state.readCount = 0; }
            }
        ];
    },
    getPcbVisualData() {
        const leds = [];
        for (let b = 7; b >= 0; b--) {
            leds.push({
                name: "D" + b,
                active: ((this.state.latch >> b) & 1) !== 0,
                color: b >= 4 ? "#00ff66" : "#ffaa00"
            });
        }
        return {
            pcbColor: this.pcbColor,
            chips: [
                { name: "74LS374 LATCH", x: 20, y: 15, w: 40, h: 25 },
                { name: "74LS245 BUS", x: 65, y: 15, w: 35, h: 25 }
            ],
            leds: leds
        };
    }
};`
            },

            ems_frame: {
                name: 'Expanded Memory (EMS 4.0) 64KB Page Frame Card',
                code: `// LIM EMS 4.0 Expanded Memory Adapter (2MB onboard RAM with 64KB Page Frame at 0xD0000)
const emsRam = new Uint8Array(2 * 1024 * 1024); // 2 MB Expanded RAM
return {
    name: "LIM EMS 4.0 Memory Expansion Card (2MB)",
    shortName: "EMS 2MB RAM",
    slotType: "ISA-16",
    category: "Memory",
    pcbColor: "#2e3d52",
    description: "Provides four 16KB bank-switched EMS pages at 0xD0000-0xDFFFF controlled via ports 0x260-0x263.",
    state: {
        pageMap: [0, 1, 2, 3] // 4 banks of 16KB
    },
    getIOPortHandlers() {
        return [0, 1, 2, 3].map(bank => ({
            port: 0x260 + bank,
            read: () => this.state.pageMap[bank],
            write: (port, val) => {
                this.state.pageMap[bank] = val & 0x7F;
                this.pulseActivity();
            }
        }));
    },
    getMemoryWindows() {
        return [
            {
                start: 0xD0000,
                end: 0xDFFFF,
                read: (addr) => {
                    this.pulseActivity();
                    const offset = addr - 0xD0000;
                    const bank = (offset >> 14) & 3;
                    const pageOffset = offset & 0x3FFF;
                    const physAddr = (this.state.pageMap[bank] * 16384) + pageOffset;
                    return emsRam[physAddr];
                },
                write: (addr, val) => {
                    this.pulseActivity();
                    const offset = addr - 0xD0000;
                    const bank = (offset >> 14) & 3;
                    const pageOffset = offset & 0x3FFF;
                    const physAddr = (this.state.pageMap[bank] * 16384) + pageOffset;
                    emsRam[physAddr] = val & 0xFF;
                }
            }
        ];
    }
};`
            },

            irq_timer: {
                name: 'Programmable Hardware Interrupt Generator Card',
                code: `// Hardware Watchdog & Periodic IRQ 10 Generator Card
return {
    name: "Custom IRQ 10 Hardware Timer Card",
    shortName: "IRQ10 TIMER",
    slotType: "ISA-16",
    category: "Custom Timer",
    pcbColor: "#4a2c52",
    description: "Fires IRQ 10 when triggered via Port 0x310 or periodic cycle countdown.",
    state: {
        enabled: false,
        counter: 0,
        reload: 10000,
        irqFiredCount: 0
    },
    getIRQLines() {
        return [10];
    },
    getIOPortHandlers() {
        return [
            {
                port: 0x310,
                read: () => (this.state.enabled ? 0x01 : 0x00),
                write: (port, val) => {
                    this.state.enabled = !!(val & 0x01);
                    if (val & 0x80) {
                        // Immediate software-triggered hardware IRQ 10
                        if (this.bus) this.bus.raiseIRQ(10);
                        this.state.irqFiredCount++;
                    }
                    this.pulseActivity();
                }
            },
            {
                port: 0x311,
                read: () => this.state.irqFiredCount & 0xFF,
                write: () => {
                    if (this.bus) this.bus.lowerIRQ(10);
                }
            }
        ];
    },
    tick(cycles) {
        if (!this.state.enabled) return;
        this.state.counter -= cycles;
        if (this.state.counter <= 0) {
            this.state.counter = this.state.reload;
            if (this.bus) this.bus.raiseIRQ(10);
            this.state.irqFiredCount++;
            this.pulseActivity();
        }
    }
};`
            },

            covox_dac: {
                name: 'Covox Speech Thing 8-Bit Audio DAC Card',
                code: `// Covox Speech Thing R-2R Resistor Ladder 8-Bit DAC on Port 0x378
return {
    name: "Covox Speech Thing 8-Bit DAC",
    shortName: "COVOX DAC",
    slotType: "ISA-8",
    category: "Audio",
    pcbColor: "#52381e",
    description: "Classic R-2R resistor ladder 8-bit digital-to-analog audio converter on port 0x378.",
    state: {
        lastSample: 0x80
    },
    getIOPortHandlers() {
        return [
            {
                port: 0x378,
                read: () => this.state.lastSample,
                write: (port, val) => {
                    this.state.lastSample = val & 0xFF;
                    this.pulseActivity();
                }
            }
        ];
    }
};`
            }
        };

        this.initEvents();
        this.loadTemplate('gpio_led');
    }

    initEvents() {
        const selTemplate = document.getElementById('studio-template-select');
        if (selTemplate) {
            selTemplate.addEventListener('change', (e) => {
                this.loadTemplate(e.target.value);
            });
        }

        const btnCompile = document.getElementById('btn-studio-compile');
        if (btnCompile) {
            btnCompile.addEventListener('click', () => {
                this.compileCardPreview();
            });
        }

        const btnInstall = document.getElementById('btn-studio-install');
        if (btnInstall) {
            btnInstall.addEventListener('click', () => {
                this.compileAndHotPlug();
            });
        }

        // Test harness Read / Write buttons
        const btnTestRead = document.getElementById('btn-harness-read');
        if (btnTestRead) {
            btnTestRead.addEventListener('click', () => this.runHarnessRead());
        }

        const btnTestWrite = document.getElementById('btn-harness-write');
        if (btnTestWrite) {
            btnTestWrite.addEventListener('click', () => this.runHarnessWrite());
        }
    }

    loadTemplate(templateKey) {
        const tpl = this.templates[templateKey];
        if (!tpl) return;
        const editor = document.getElementById('studio-code-editor');
        if (editor) {
            editor.value = tpl.code;
            this.compileCardPreview();
        }
    }

    buildCardFromCode(codeStr) {
        const factoryFn = new Function(codeStr);
        const spec = factoryFn();

        if (!spec || typeof spec !== 'object') {
            throw new Error('Card definition must return a configuration object.');
        }

        const card = new AdapterCard({
            id: 'custom_' + Math.random().toString(36).substring(2, 7),
            name: spec.name || 'User Custom Adapter Card',
            shortName: spec.shortName || 'CUSTOM CARD',
            slotType: spec.slotType || 'ISA-16',
            category: spec.category || 'Custom',
            pcbColor: spec.pcbColor || '#1b4d3e',
            description: spec.description || 'User-authored custom adapter card.',
            jumpers: spec.jumpers || {}
        });

        card.state = spec.state || {};
        if (spec.getIOPortHandlers) card.getIOPortHandlers = spec.getIOPortHandlers.bind(card);
        if (spec.getMemoryWindows) card.getMemoryWindows = spec.getMemoryWindows.bind(card);
        if (spec.getIRQLines) card.getIRQLines = spec.getIRQLines.bind(card);
        if (spec.getDMALines) card.getDMALines = spec.getDMALines.bind(card);
        if (spec.tick) card.tick = spec.tick.bind(card);
        if (spec.getPcbVisualData) card.getPcbVisualData = spec.getPcbVisualData.bind(card);

        return card;
    }

    compileCardPreview() {
        const editor = document.getElementById('studio-code-editor');
        const statusEl = document.getElementById('studio-compile-status');
        if (!editor) return null;

        try {
            const card = this.buildCardFromCode(editor.value);
            this.activePreviewCard = card;

            if (statusEl) {
                statusEl.textContent = `✅ Compiled "${card.name}" (${card.slotType}) successfully.`;
                statusEl.style.color = '#00ff66';
            }

            this.renderPreviewLeds();
            return card;
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = `❌ Syntax / Build Error: ${err.message}`;
                statusEl.style.color = '#ff4444';
            }
            return null;
        }
    }

    compileAndHotPlug() {
        const card = this.compileCardPreview();
        if (!card) return;

        const slotSelect = document.getElementById('studio-target-slot');
        const slotNum = slotSelect ? parseInt(slotSelect.value, 10) : 6;

        // Register in custom catalog & hot-plug into bus
        this.app.registerCustomCard(card);
        this.app.bus.installCard(slotNum, card);
        this.app.audioEngine.playSwitchClick();
        this.app.motherboardView.selectedSlot = slotNum;
        this.app.motherboardView.renderSlots();

        const statusEl = document.getElementById('studio-compile-status');
        if (statusEl) {
            statusEl.textContent = `🔌 Hot-plugged "${card.name}" into Motherboard Slot ${slotNum}!`;
        }
    }

    runHarnessRead() {
        if (!this.activePreviewCard) this.compileCardPreview();
        if (!this.activePreviewCard) return;

        const portInput = document.getElementById('harness-port-input');
        const port = parseInt(portInput ? portInput.value : '0x300', 16);

        const handlers = this.activePreviewCard.getIOPortHandlers() || [];
        const handler = handlers.find(h => h.port === port);
        const logEl = document.getElementById('harness-log-output');

        if (handler && handler.read) {
            const val = handler.read(port) & 0xFF;
            if (logEl) {
                logEl.textContent = `IN 0x${port.toString(16).toUpperCase()} => 0x${val.toString(16).toUpperCase().padStart(2, '0')} (${val} dec, 0b${val.toString(2).padStart(8, '0')})`;
            }
        } else {
            if (logEl) {
                logEl.textContent = `IN 0x${port.toString(16).toUpperCase()} => 0xFF (Unmapped on this card)`;
            }
        }
        this.renderPreviewLeds();
    }

    runHarnessWrite() {
        if (!this.activePreviewCard) this.compileCardPreview();
        if (!this.activePreviewCard) return;

        const portInput = document.getElementById('harness-port-input');
        const valInput = document.getElementById('harness-val-input');
        const port = parseInt(portInput ? portInput.value : '0x300', 16);
        const val = parseInt(valInput ? valInput.value : '0x55', 16) & 0xFF;

        const handlers = this.activePreviewCard.getIOPortHandlers() || [];
        const handler = handlers.find(h => h.port === port);
        const logEl = document.getElementById('harness-log-output');

        if (handler && handler.write) {
            handler.write(port, val);
            // Also forward to live bus if card is installed
            if (this.activePreviewCard.bus) {
                this.activePreviewCard.bus.ioWrite(port, val, 1);
            }
            if (logEl) {
                logEl.textContent = `OUT 0x${port.toString(16).toUpperCase()}, 0x${val.toString(16).toUpperCase().padStart(2, '0')} => Written OK`;
            }
        } else {
            if (logEl) {
                logEl.textContent = `OUT 0x${port.toString(16).toUpperCase()} => Port not handled by card`;
            }
        }
        this.renderPreviewLeds();
    }

    renderPreviewLeds() {
        const container = document.getElementById('harness-visual-leds');
        if (!container || !this.activePreviewCard) return;

        const visual = this.activePreviewCard.getPcbVisualData();
        const leds = visual.leds || [];
        container.innerHTML = leds.map(l => `
            <div class="harness-led-box">
                <span class="led ${l.active ? 'active' : ''}" style="--led-on:${l.color}"></span>
                <span>${l.name}</span>
            </div>
        `).join('');
    }
}
