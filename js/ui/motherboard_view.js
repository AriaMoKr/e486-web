/**
 * Interactive Socket 3 486 Motherboard View Controller
 * Renders the PCB layout, CPU socket, SIMM RAM banks, chipset, expansion slots 1-6,
 * visual adapter cards, jumper configurator, and live ISA/VLB bus activity LEDs.
 */

export class MotherboardView {
    constructor(app) {
        this.app = app;
        this.selectedSlot = 1;
        this.initEvents();
    }

    initEvents() {
        // PCB Theme Selector
        const pcbThemeSelect = document.getElementById('mb-pcb-theme');
        if (pcbThemeSelect) {
            pcbThemeSelect.addEventListener('change', (e) => {
                const board = document.getElementById('motherboard-pcb');
                if (board) {
                    board.className = 'motherboard-pcb theme-' + e.target.value;
                }
                if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
            });
        }

        // Motherboard Jumper toggles
        document.querySelectorAll('.mb-jumper-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('closed');
                this.app.audioEngine.playSwitchClick();
            });
        });
    }

    renderSlots() {
        const slotsContainer = document.getElementById('mb-expansion-slots');
        if (!slotsContainer) return;

        const slotMetadata = [
            { num: 1, type: 'VLB / ISA-16', label: 'SLOT 1 (VESA LOCAL BUS)' },
            { num: 2, type: 'ISA-16',       label: 'SLOT 2 (16-BIT ISA)' },
            { num: 3, type: 'ISA-16',       label: 'SLOT 3 (16-BIT ISA)' },
            { num: 4, type: 'ISA-16',       label: 'SLOT 4 (16-BIT ISA)' },
            { num: 5, type: 'ISA-8',        label: 'SLOT 5 (8-BIT ISA)' },
            { num: 6, type: 'ISA-16',       label: 'SLOT 6 (PROTOTYPE / CUSTOM)' }
        ];

        slotsContainer.innerHTML = '';

        for (const meta of slotMetadata) {
            const card = this.app.bus.getCard(meta.num);
            const slotEl = document.createElement('div');
            slotEl.className = `expansion-slot ${card ? 'occupied' : 'empty'} ${this.selectedSlot === meta.num ? 'selected' : ''} ${meta.num === 1 ? 'vlb-slot' : ''}`;
            slotEl.dataset.slot = meta.num;

            if (card) {
                const visual = card.getPcbVisualData();
                const chipsHtml = (visual.chips || []).map(c =>
                    `<span class="card-chip" title="${c.name}">${c.name}</span>`
                ).join('');
                const ledsHtml = (visual.leds || []).map(l =>
                    `<span class="card-led-badge"><span class="led ${l.active ? 'active' : ''}" style="--led-on:${l.color}"></span> ${l.name}</span>`
                ).join('');

                slotEl.innerHTML = `
                    <div class="slot-header">
                        <span class="slot-id">${meta.label}</span>
                        <span class="slot-bus-badge">${card.slotType}</span>
                    </div>
                    <div class="inserted-card-pcb" style="background: linear-gradient(90deg, ${visual.pcbColor}, #14281d);">
                        <div class="card-edge-bracket"></div>
                        <div class="card-body-content">
                            <div class="card-title-row">
                                <strong>${card.name}</strong>
                                <div class="card-leds">${ledsHtml}</div>
                            </div>
                            <div class="card-chips-row">${chipsHtml}</div>
                        </div>
                        <div class="gold-fingers"></div>
                    </div>
                `;
            } else {
                slotEl.innerHTML = `
                    <div class="slot-header">
                        <span class="slot-id">${meta.label}</span>
                        <span class="slot-bus-badge">${meta.type}</span>
                    </div>
                    <div class="empty-slot-socket">
                        <div class="pin-row-top"></div>
                        <span class="empty-slot-prompt">+ Click to Insert Adapter Card into Slot ${meta.num}</span>
                        <div class="pin-row-bottom"></div>
                    </div>
                `;
            }

            slotEl.addEventListener('click', () => {
                this.selectedSlot = meta.num;
                this.renderSlots();
                this.renderSlotInspector(meta.num);
            });

            slotsContainer.appendChild(slotEl);
        }

        this.renderSlotInspector(this.selectedSlot);
    }

    renderSlotInspector(slotNum) {
        const inspector = document.getElementById('mb-slot-inspector');
        if (!inspector) return;

        const card = this.app.bus.getCard(slotNum);

        if (card) {
            const ioPorts = (card.getIOPortHandlers() || []).map(h =>
                `0x${h.port.toString(16).toUpperCase().padStart(3, '0')}`
            ).join(', ') || 'None';

            const memWins = (card.getMemoryWindows() || []).map(w =>
                `0x${w.start.toString(16).toUpperCase()} - 0x${w.end.toString(16).toUpperCase()}`
            ).join(', ') || 'None';

            const irqs = (card.getIRQLines() || []).map(i => `IRQ ${i}`).join(', ') || 'None';
            const dmas = (card.getDMALines() || []).map(d => `DMA ${d}`).join(', ') || 'None';

            // Build jumper settings controls
            let jumpersHtml = '';
            const jumperKeys = Object.keys(card.jumpers || {});
            if (jumperKeys.length > 0) {
                jumpersHtml = `<div class="inspector-section-title">🔧 Hardware Jumpers & DIP Switches</div><div class="jumper-grid">`;
                for (const key of jumperKeys) {
                    const val = card.jumpers[key];
                    const dispVal = (typeof val === 'number' && key.toLowerCase().includes('addr') || key.toLowerCase().includes('port'))
                        ? '0x' + val.toString(16).toUpperCase()
                        : val;
                    jumpersHtml += `
                        <div class="jumper-item">
                            <label>${key}:</label>
                            <input type="text" class="jumper-input" data-key="${key}" value="${dispVal}">
                        </div>
                    `;
                }
                jumpersHtml += `</div><button id="btn-apply-jumpers" class="btn-accent" style="margin-top:8px; width:100%;">Apply Jumper Settings</button>`;
            }

            inspector.innerHTML = `
                <div class="inspector-header">
                    <span class="badge">SLOT ${slotNum}</span>
                    <h4>${card.name}</h4>
                </div>
                <p class="inspector-desc">${card.description}</p>
                <div class="inspector-specs">
                    <div><span>Category:</span> <b>${card.category}</b></div>
                    <div><span>Bus Interface:</span> <b>${card.slotType}</b></div>
                    <div><span>I/O Ports:</span> <b class="mono-code">${ioPorts}</b></div>
                    <div><span>Memory Map:</span> <b class="mono-code">${memWins}</b></div>
                    <div><span>Interrupts:</span> <b>${irqs}</b></div>
                    <div><span>DMA Channels:</span> <b>${dmas}</b></div>
                </div>
                ${jumpersHtml}
                <div class="inspector-actions" style="margin-top:14px; display:flex; gap:8px;">
                    <button id="btn-unplug-card" class="btn-danger" style="flex:1;">⏏️ Unplug Card from Slot ${slotNum}</button>
                </div>
            `;

            const btnUnplug = document.getElementById('btn-unplug-card');
            if (btnUnplug) {
                btnUnplug.addEventListener('click', () => {
                    this.app.bus.removeCard(slotNum);
                    this.app.audioEngine.playSwitchClick();
                    this.app.updateActiveVideoCard();
                    if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
                    this.renderSlots();
                });
            }

            const btnApply = document.getElementById('btn-apply-jumpers');
            if (btnApply) {
                btnApply.addEventListener('click', () => {
                    inspector.querySelectorAll('.jumper-input').forEach(inp => {
                        const k = inp.dataset.key;
                        let v = inp.value.trim();
                        if (v.startsWith('0x') || v.startsWith('0X')) {
                            v = parseInt(v, 16);
                        } else if (!isNaN(Number(v))) {
                            v = Number(v);
                        } else if (v === 'true' || v === 'false') {
                            v = (v === 'true');
                        }
                        card.jumpers[k] = v;
                    });
                    card.applyJumpers();
                    this.app.audioEngine.playSwitchClick();
                    if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
                    this.renderSlots();
                });
            }
        } else {
            // Slot is empty: show catalog of available modular cards to insert
            const catalog = this.app.getAvailableCardCatalog();
            const optionsHtml = catalog.map((c, idx) =>
                `<option value="${c.typeId}">${c.name} (${c.slotType} - ${c.category})</option>`
            ).join('');

            inspector.innerHTML = `
                <div class="inspector-header">
                    <span class="badge">SLOT ${slotNum} (EMPTY)</span>
                    <h4>Insert Expansion Card</h4>
                </div>
                <p class="inspector-desc">Select an adapter card from your parts bin or Custom Card Studio to install into Slot ${slotNum}:</p>
                <div style="margin: 12px 0;">
                    <label style="font-size:12px; color:#9aa5b4; display:block; margin-bottom:6px;">Available Adapter Modules:</label>
                    <select id="select-card-to-insert" class="retro-select" style="width:100%;">
                        ${optionsHtml}
                    </select>
                </div>
                <button id="btn-insert-card" class="btn-accent" style="width:100%; padding:10px;">🔌 Plug Card into Slot ${slotNum}</button>
            `;

            const btnInsert = document.getElementById('btn-insert-card');
            if (btnInsert) {
                btnInsert.addEventListener('click', () => {
                    const sel = document.getElementById('select-card-to-insert');
                    if (sel) {
                        this.app.installCardByType(slotNum, sel.value);
                        this.app.audioEngine.playSwitchClick();
                        this.renderSlots();
                    }
                });
            }
        }
    }

    updateLiveBusIndicators() {
        const act = this.app.bus.busActivity;

        // Bus control lines
        this.setLed('led-bus-memr', act.memr > 0);
        this.setLed('led-bus-memw', act.memw > 0);
        this.setLed('led-bus-ior', act.ior > 0);
        this.setLed('led-bus-iow', act.iow > 0);

        // Address & I/O hex readouts
        const addrEl = document.getElementById('mb-addr-bus-hex');
        if (addrEl) addrEl.textContent = '0x' + act.lastMemAddr.toString(16).toUpperCase().padStart(8, '0');

        const ioEl = document.getElementById('mb-io-bus-hex');
        if (ioEl) ioEl.textContent = '0x' + act.lastIoPort.toString(16).toUpperCase().padStart(4, '0');

        // POST 7-segment display
        const postEl = document.getElementById('mb-post-hex');
        if (postEl) {
            postEl.textContent = act.postCode.toString(16).toUpperCase().padStart(2, '0');
        }

        // IRQ 0-15 LEDs
        for (let i = 0; i < 16; i++) {
            this.setLed(`led-irq-${i}`, act.irqStates[i] > 0);
        }
    }

    setLed(id, active) {
        const el = document.getElementById(id);
        if (el) {
            if (active) el.classList.add('active');
            else el.classList.remove('active');
        }
    }
}
