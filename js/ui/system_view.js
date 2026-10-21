/**
 * System Specs & Hardware Diagnostics View Controller
 * Provides CPU speed throttling, single-step execution, live 32-bit register dump,
 * and an interactive physical memory hex inspector.
 */

export class SystemView {
    constructor(app) {
        this.app = app;
        this.hexBaseAddress = 0xB8000; // Default to CGA/Text Video RAM
        this.initEvents();
    }

    initEvents() {
        // CPU Clock Speed Selector
        const selSpeed = document.getElementById('sys-cpu-speed');
        if (selSpeed) {
            selSpeed.addEventListener('change', (e) => {
                this.app.cyclesPerFrame = parseInt(e.target.value, 10);
                if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
            });
        }

        // Pause / Resume / Single-Step buttons
        const btnPause = document.getElementById('btn-sys-pause');
        if (btnPause) {
            btnPause.addEventListener('click', () => {
                this.app.paused = !this.app.paused;
                btnPause.textContent = this.app.paused ? '▶️ Resume CPU' : '⏸️ Pause CPU';
                this.updateDiagnostics();
            });
        }

        const btnStep = document.getElementById('btn-sys-step');
        if (btnStep) {
            btnStep.addEventListener('click', () => {
                this.app.paused = true;
                const pauseBtn = document.getElementById('btn-sys-pause');
                if (pauseBtn) pauseBtn.textContent = '▶️ Resume CPU';
                this.app.cpu.step();
                this.updateDiagnostics();
                this.renderMemoryDump();
            });
        }

        // Memory Hex Inspector quick jump buttons
        document.querySelectorAll('.btn-mem-jump').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hexBaseAddress = parseInt(btn.dataset.addr, 16);
                this.renderMemoryDump();
            });
        });
    }

    updateDiagnostics() {
        const dump = this.app.cpu.getRegistersDump();

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setEl('reg-eax', dump.eax);
        setEl('reg-ebx', dump.ebx);
        setEl('reg-ecx', dump.ecx);
        setEl('reg-edx', dump.edx);
        setEl('reg-esi', dump.esi);
        setEl('reg-edi', dump.edi);
        setEl('reg-esp', dump.esp);
        setEl('reg-ebp', dump.ebp);
        setEl('reg-eip', dump.eip);
        setEl('reg-cs', dump.cs);
        setEl('reg-ds', dump.ds);
        setEl('reg-ss', dump.ss);
        setEl('reg-es', dump.es);
        setEl('reg-eflags', dump.flags);
        setEl('sys-mips-val', dump.mips + ' MIPS');
        setEl('sys-inst-count', dump.instructions.toLocaleString());
    }

    renderMemoryDump() {
        const outEl = document.getElementById('sys-memory-hex-dump');
        if (!outEl) return;

        let lines = [];
        for (let row = 0; row < 12; row++) {
            const addr = (this.hexBaseAddress + row * 16) >>> 0;
            const addrHex = addr.toString(16).toUpperCase().padStart(8, '0');
            let hexCols = [];
            let asciiCols = '';

            for (let col = 0; col < 16; col++) {
                const b = this.app.bus.memRead8(addr + col);
                hexCols.push(b.toString(16).toUpperCase().padStart(2, '0'));
                asciiCols += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            }

            lines.push(`${addrHex}  ${hexCols.slice(0, 8).join(' ')}  ${hexCols.slice(8).join(' ')}  |${asciiCols}|`);
        }

        outEl.textContent = lines.join('\n');
    }
}
