/**
 * Storage Bay & Disk Manager View Controller
 * Manages 3.5" and 5.25" Floppy Drives, IDE Hard Disks C: and D:, and ATAPI CD-ROM E:,
 * including drag-and-drop mounting, ejecting, bundled disk library, blank image creation, and disk export.
 */

export class StorageView {
    constructor(app) {
        this.app = app;
        this.bundledDisks = [
            { name: 'FreeDOS 1.3 Boot Disk (1.44MB)', path: 'data/dos.img', filename: 'DOS13_BOOT.IMG', type: 'fdd' },
            { name: 'Commander Keen 4 (1.44MB)', path: 'extra_disks/KEEN4.img', filename: 'KEEN4.IMG', type: 'fdd' },
            { name: 'Wolfenstein 3D (1.44MB)', path: 'extra_disks/WOLF3D.img', filename: 'WOLF3D.IMG', type: 'fdd' },
            { name: 'Duke Nukem II (1.44MB)', path: 'extra_disks/DUKE2.img', filename: 'DUKE2.IMG', type: 'fdd' },
            { name: 'DOOM Shareware Disk 1 (1.44MB)', path: 'extra_disks/DOOM_DSK1.img', filename: 'DOOM_DSK1.IMG', type: 'fdd' },
            { name: 'DOOM Shareware Disk 2 (1.44MB)', path: 'extra_disks/DOOM_DSK2.img', filename: 'DOOM_DSK2.IMG', type: 'fdd' },
            { name: 'x86 System Boot Disk (1.44MB)', path: 'extra_disks/x86BOOT.img', filename: 'X86BOOT.IMG', type: 'fdd' },
            { name: 'FreeDOS Package Disk 1 (1.44MB)', path: 'extra_disks/x86DSK01.img', filename: 'X86DSK01.IMG', type: 'fdd' }
        ];

        this.initEvents();
        this.renderBundledLibrary();
        this.discoverExtraDisks();
        this.restoreCachedLibraryDisks();
        this.refreshDriveStatus();
    }

    getStorageCard() {
        return this.app.getStorageCard();
    }

    initEvents() {
        // File input listeners for mounting local images
        this.setupFileMount('file-mount-fdd-a', (buf, name) => {
            const card = this.getStorageCard();
            if (card) {
                card.mountFloppy(0, buf, name);
                this.persistMountedDrive('fddA', buf, name);
                this.app.audioEngine.playFloppySeekSound();
                this.refreshDriveStatus();
            }
        });

        this.setupFileMount('file-mount-fdd-b', (buf, name) => {
            const card = this.getStorageCard();
            if (card) {
                card.mountFloppy(1, buf, name);
                this.persistMountedDrive('fddB', buf, name);
                this.app.audioEngine.playFloppySeekSound();
                this.refreshDriveStatus();
            }
        });

        this.setupFileMount('file-mount-hdd-c', (buf, name) => {
            const card = this.getStorageCard();
            if (card) {
                card.mountHardDisk(0, buf, name);
                this.persistMountedDrive('hddC', buf, name);
                this.app.audioEngine.playSwitchClick();
                this.refreshDriveStatus();
            }
        });

        this.setupFileMount('file-mount-cd-e', (buf, name) => {
            const card = this.getStorageCard();
            if (card) {
                card.mountCdrom(buf, name);
                this.app.audioEngine.playSwitchClick();
                this.refreshDriveStatus();
            }
        });

        // Multi-file upload into the 1-Click Disk Library (cached in browser)
        const addLibInput = document.getElementById('file-add-library-disks');
        if (addLibInput) {
            addLibInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                for (const file of files) {
                    const buf = await file.arrayBuffer();
                    const filename = file.name.toUpperCase();
                    const cacheKey = `user_fdd:${filename}`;
                    if (this.app.storageCache) {
                        await this.app.storageCache.putImage(cacheKey, buf, {
                            isUserLibraryDisk: true,
                            name: `${file.name} (Cached)`,
                            filename
                        });
                    }
                    const existingIdx = this.bundledDisks.findIndex(d => d.cacheKey === cacheKey);
                    const entry = {
                        name: `${file.name} (Cached)`,
                        filename,
                        cacheKey,
                        buffer: buf,
                        isUserCached: true,
                        type: 'fdd'
                    };
                    if (existingIdx >= 0) {
                        this.bundledDisks[existingIdx] = entry;
                    } else {
                        this.bundledDisks.push(entry);
                    }
                }
                addLibInput.value = '';
                this.renderBundledLibrary();
                this.app.audioEngine.playFloppySeekSound();
            });
        }

        // Clear Browser Cache button
        const btnClearCache = document.getElementById('btn-clear-browser-cache');
        if (btnClearCache) {
            btnClearCache.addEventListener('click', async () => {
                if (this.app.storageCache) {
                    await this.app.storageCache.clearAll();
                }
                window.location.reload();
            });
        }

        // Eject buttons
        const btnEjectA = document.getElementById('btn-eject-fdd-a');
        if (btnEjectA) {
            btnEjectA.addEventListener('click', () => {
                const card = this.getStorageCard();
                if (card) card.ejectFloppy(0);
                if (this.app.storageCache) this.app.storageCache.deleteImage('drive:fddA');
                if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
                this.app.audioEngine.playSwitchClick();
                this.refreshDriveStatus();
            });
        }

        const btnEjectB = document.getElementById('btn-eject-fdd-b');
        if (btnEjectB) {
            btnEjectB.addEventListener('click', () => {
                const card = this.getStorageCard();
                if (card) card.ejectFloppy(1);
                if (this.app.storageCache) this.app.storageCache.deleteImage('drive:fddB');
                if (this.app.saveSetupToLocalStorage) this.app.saveSetupToLocalStorage();
                this.app.audioEngine.playSwitchClick();
                this.refreshDriveStatus();
            });
        }

        const btnEjectCd = document.getElementById('btn-eject-cd-e');
        if (btnEjectCd) {
            btnEjectCd.addEventListener('click', () => {
                const card = this.getStorageCard();
                if (card) card.ejectCdrom();
                this.app.audioEngine.playSwitchClick();
                this.refreshDriveStatus();
            });
        }

        // Create Blank Floppy / Hard Drive buttons
        const btnCreateFdd = document.getElementById('btn-create-blank-fdd');
        if (btnCreateFdd) {
            btnCreateFdd.addEventListener('click', () => {
                this.createBlankFloppy(0, 'BLANK_144M.IMG');
            });
        }

        const btnCreateHdd = document.getElementById('btn-create-blank-hdd');
        if (btnCreateHdd) {
            btnCreateHdd.addEventListener('click', () => {
                const sizeSelect = document.getElementById('select-blank-hdd-size');
                const sizeMb = sizeSelect ? parseInt(sizeSelect.value, 10) : 20;
                this.createBlankHardDisk(0, sizeMb, `HDD_${sizeMb}MB.IMG`);
            });
        }

        // Export / Download Disk buttons
        const btnExportA = document.getElementById('btn-export-fdd-a');
        if (btnExportA) {
            btnExportA.addEventListener('click', () => {
                const card = this.getStorageCard();
                if (card && card.drives.fddA.data) {
                    this.downloadDiskImage(card.drives.fddA.data, card.drives.fddA.name || 'floppy_a.img');
                }
            });
        }

        const btnExportC = document.getElementById('btn-export-hdd-c');
        if (btnExportC) {
            btnExportC.addEventListener('click', () => {
                const card = this.getStorageCard();
                if (card && card.drives.hddC.data) {
                    this.downloadDiskImage(card.drives.hddC.data, card.drives.hddC.name || 'hdd_c.img');
                }
            });
        }
    }

    setupFileMount(inputId, callback) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                callback(ev.target.result, file.name);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async discoverExtraDisks() {
        const dirs = ['extra_disks/', '../extra_disks/'];
        for (const dirUrl of dirs) {
            try {
                const resp = await fetch(dirUrl);
                if (!resp.ok) continue;
                const html = await resp.text();
                const matches = [...html.matchAll(/href=["']([^"']+\.(?:img|ima|flp|dsk))["']/gi)];
                let added = false;
                for (const m of matches) {
                    const file = decodeURIComponent(m[1].split('/').pop());
                    const relPath = `extra_disks/${file}`;
                    const exists = this.bundledDisks.some(
                        d => d.path.toLowerCase() === relPath.toLowerCase() ||
                             (d.filename && d.filename.toLowerCase() === file.toLowerCase())
                    );
                    if (!exists) {
                        this.bundledDisks.push({
                            name: `${file} (extra_disks)`,
                            path: relPath,
                            filename: file.toUpperCase(),
                            type: 'fdd'
                        });
                        added = true;
                    }
                }
                if (added) {
                    this.renderBundledLibrary();
                }
                break;
            } catch (_) {
                // Ignore if directory listing is disabled
            }
        }
    }

    async restoreCachedLibraryDisks() {
        if (!this.app.storageCache) return;
        const cachedList = await this.app.storageCache.listCachedUserDisks();
        if (!cachedList || cachedList.length === 0) return;

        let added = false;
        for (const item of cachedList) {
            if (!this.bundledDisks.some(d => d.cacheKey === item.key)) {
                this.bundledDisks.push({
                    name: item.name,
                    filename: item.filename,
                    cacheKey: item.key,
                    isUserCached: true,
                    type: 'fdd'
                });
                added = true;
            }
        }
        if (added) {
            this.renderBundledLibrary();
        }
    }

    persistMountedDrive(driveKey, buf, filename) {
        if (this.app.storageCache && buf) {
            this.app.storageCache.putImage(`drive:${driveKey}`, buf, { filename });
        }
        if (this.app.saveSetupToLocalStorage) {
            this.app.saveSetupToLocalStorage();
        }
    }

    renderBundledLibrary() {
        const listEl = document.getElementById('bundled-disk-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        for (const item of this.bundledDisks) {
            const row = document.createElement('div');
            row.className = 'bundled-disk-item';
            row.innerHTML = `
                <div class="bundled-disk-info">
                    <span class="disk-icon">💾</span>
                    <span>${item.name}</span>
                </div>
                <div class="bundled-disk-actions">
                    <button class="btn-small btn-mount-a">Mount A:</button>
                    <button class="btn-small btn-mount-b">Mount B:</button>
                    <button class="btn-small btn-mount-boot">Mount & Boot</button>
                </div>
            `;

            row.querySelector('.btn-mount-a').addEventListener('click', () => {
                this.loadBundledDisk(item, false, 0);
            });
            row.querySelector('.btn-mount-b').addEventListener('click', () => {
                this.loadBundledDisk(item, false, 1);
            });
            row.querySelector('.btn-mount-boot').addEventListener('click', () => {
                this.loadBundledDisk(item, true, 0);
            });

            listEl.appendChild(row);
        }
    }

    async loadBundledDisk(item, rebootAfter, driveIdx = 0) {
        const card = this.getStorageCard();
        if (!card) return;

        const diskLabel = item.filename || item.name;
        const driveKey = driveIdx === 0 ? 'fddA' : 'fddB';
        let loadedBuf = null;

        if (item.buffer) {
            loadedBuf = item.buffer;
        } else if (item.cacheKey && this.app.storageCache) {
            loadedBuf = await this.app.storageCache.getImage(item.cacheKey);
        } else if (item.path) {
            const assetKey = `asset:${item.path}`;
            if (this.app.storageCache) {
                loadedBuf = await this.app.storageCache.getImage(assetKey);
            }
            if (!loadedBuf) {
                try {
                    let resp = await fetch(item.path);
                    if (!resp.ok) {
                        resp = await fetch('../' + item.path);
                    }
                    if (resp.ok) {
                        loadedBuf = await resp.arrayBuffer();
                        if (this.app.storageCache) {
                            await this.app.storageCache.putImage(assetKey, loadedBuf, { filename: diskLabel });
                        }
                    }
                } catch (_) {
                    // Fallback below
                }
            }
        }

        if (loadedBuf) {
            card.mountFloppy(driveIdx, loadedBuf, diskLabel);
            this.persistMountedDrive(driveKey, loadedBuf, diskLabel);
        } else {
            this.createSyntheticBootFloppy(driveIdx, diskLabel);
        }

        this.app.audioEngine.playFloppySeekSound();
        this.refreshDriveStatus();

        if (rebootAfter) {
            this.app.rebootSystem();
            this.app.switchTab('tab-monitor');
        }
    }

    createBlankFloppy(driveIdx, filename) {
        const card = this.getStorageCard();
        if (!card) return;

        // Standard 1.44MB FAT12 Floppy (2880 sectors * 512 bytes = 1,474,560 bytes)
        const buf = new ArrayBuffer(1474560);
        const view = new Uint8Array(buf);
        const dv = new DataView(buf);

        // Write FAT12 Boot Sector Header & Boot Signature (0x55 0xAA)
        view[0] = 0xEB; view[1] = 0x3C; view[2] = 0x90; // JMP SHORT 0x3E + NOP
        const oem = "MSDOS5.0";
        for (let i = 0; i < 8; i++) view[3 + i] = oem.charCodeAt(i);
        view[11] = 0x00; view[12] = 0x02; // 512 bytes/sector
        view[13] = 0x01; // 1 sector/cluster
        view[14] = 0x01; view[15] = 0x00; // 1 reserved sector
        view[16] = 0x02; // 2 FATs
        view[17] = 0xE0; view[18] = 0x00; // 224 root dir entries
        view[19] = 0x40; view[20] = 0x0B; // 2880 total sectors
        view[21] = 0xF0; // Media descriptor (1.44M)
        view[22] = 0x09; view[23] = 0x00; // 9 sectors/FAT
        view[24] = 0x12; view[25] = 0x00; // 18 sectors/track
        view[26] = 0x02; view[27] = 0x00; // 2 heads
        view[38] = 0x29; // Extended boot signature
        dv.setUint32(39, 0x19931440, true);
        "BLANK_144M ".split('').forEach((c, i) => { view[43 + i] = c.charCodeAt(0); });
        "FAT12   ".split('').forEach((c, i) => { view[54 + i] = c.charCodeAt(0); });
        // Boot code at 0x3E: INT 18h (boot next device if no OS installed)
        view[0x3E] = 0xCD; view[0x3F] = 0x18; view[0x40] = 0xF4; view[0x41] = 0xEB; view[0x42] = 0xFD;
        view[510] = 0x55; view[511] = 0xAA;

        // Initialize FAT1 (sector 1) and FAT2 (sector 10) media descriptor bytes
        view[512] = 0xF0; view[513] = 0xFF; view[514] = 0xFF;
        view[10 * 512] = 0xF0; view[10 * 512 + 1] = 0xFF; view[10 * 512 + 2] = 0xFF;

        card.mountFloppy(driveIdx, buf, filename);
        this.persistMountedDrive(driveIdx === 0 ? 'fddA' : 'fddB', buf, filename);
        this.app.audioEngine.playFloppySeekSound();
        this.refreshDriveStatus();
    }

    createSyntheticBootFloppy(driveIdx, label) {
        this.createBlankFloppy(driveIdx, label);
    }

    createBlankHardDisk(driveIdx, sizeMb, filename, persist = true) {
        const card = this.getStorageCard();
        if (!card) return;

        const byteSize = sizeMb * 1024 * 1024;
        const buf = new ArrayBuffer(byteSize);
        const view = new Uint8Array(buf);
        const dv = new DataView(buf);

        const heads = 16;
        const spt = 63;
        const totalSectors = Math.floor(byteSize / 512);
        const cylinders = Math.max(2, Math.floor(totalSectors / (heads * spt)));
        const startLba = 63;
        const partSectors = cylinders * heads * spt - startLba;

        // MBR at LBA 0: boot code executes INT 18h if booted directly
        view[0] = 0xCD; view[1] = 0x18; view[2] = 0xF4; view[3] = 0xEB; view[4] = 0xFD;

        // Partition 1 entry at 0x1BE
        const p = 0x1BE;
        view[p + 0] = 0x00;
        view[p + 1] = 1;
        view[p + 2] = 1;
        view[p + 3] = 0;
        view[p + 4] = partSectors < 65536 ? 0x04 : 0x06; // FAT16
        const endCyl = cylinders - 1;
        view[p + 5] = heads - 1;
        view[p + 6] = (spt & 0x3f) | (((endCyl >> 8) & 3) << 6);
        view[p + 7] = endCyl & 0xff;
        dv.setUint32(p + 8, startLba, true);
        dv.setUint32(p + 12, partSectors, true);
        view[510] = 0x55;
        view[511] = 0xAA;

        // FAT16 Volume Boot Record at LBA 63
        const vbr = startLba * 512;
        view[vbr + 0] = 0xEB; view[vbr + 1] = 0x3C; view[vbr + 2] = 0x90;
        "MSDOS5.0".split('').forEach((c, i) => { view[vbr + 3 + i] = c.charCodeAt(0); });
        dv.setUint16(vbr + 11, 512, true);
        const spc = partSectors > 131072 ? 8 : 4;
        view[vbr + 13] = spc;
        dv.setUint16(vbr + 14, 1, true);
        view[vbr + 16] = 2;
        dv.setUint16(vbr + 17, 512, true);
        if (partSectors < 65536) {
            dv.setUint16(vbr + 19, partSectors, true);
            dv.setUint32(vbr + 32, 0, true);
        } else {
            dv.setUint16(vbr + 19, 0, true);
            dv.setUint32(vbr + 32, partSectors, true);
        }
        view[vbr + 21] = 0xF8;
        const clusters = Math.floor(partSectors / spc);
        const spf = Math.max(16, Math.ceil((clusters * 2 + 4) / 512));
        dv.setUint16(vbr + 22, spf, true);
        dv.setUint16(vbr + 24, spt, true);
        dv.setUint16(vbr + 26, heads, true);
        dv.setUint32(vbr + 28, startLba, true);
        view[vbr + 36] = 0x80;
        view[vbr + 38] = 0x29;
        dv.setUint32(vbr + 39, 0x19930486, true);
        "RETRO486_HD".split('').forEach((c, i) => { view[vbr + 43 + i] = c.charCodeAt(0); });
        "FAT16   ".split('').forEach((c, i) => { view[vbr + 54 + i] = c.charCodeAt(0); });
        view[vbr + 62] = 0xCD; view[vbr + 63] = 0x18;
        view[vbr + 510] = 0x55; view[vbr + 511] = 0xAA;

        // FAT1 & FAT2 media descriptor bytes
        const fat1 = (startLba + 1) * 512;
        const fat2 = (startLba + 1 + spf) * 512;
        view[fat1 + 0] = 0xF8; view[fat1 + 1] = 0xFF; view[fat1 + 2] = 0xFF; view[fat1 + 3] = 0xFF;
        view[fat2 + 0] = 0xF8; view[fat2 + 1] = 0xFF; view[fat2 + 2] = 0xFF; view[fat2 + 3] = 0xFF;

        // Volume label in Root Directory
        const rootOff = (startLba + 1 + 2 * spf) * 512;
        "RETRO486_HD".split('').forEach((c, i) => { view[rootOff + i] = c.charCodeAt(0); });
        view[rootOff + 11] = 0x08;

        card.mountHardDisk(driveIdx, buf, filename);
        if (persist) {
            this.persistMountedDrive(driveIdx === 0 ? 'hddC' : 'hddD', buf, filename);
        }
        this.app.audioEngine.playSwitchClick();
        this.refreshDriveStatus();
    }

    downloadDiskImage(uint8Data, filename) {
        const blob = new Blob([uint8Data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    refreshDriveStatus() {
        const card = this.getStorageCard();
        if (!card) return;

        const st = card.getDriveStatus();

        // Update Storage Tab Labels
        const setEl = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setEl('status-fdd-a', st.fddA.mounted ? `${st.fddA.name} ${st.fddA.dirty ? '(Modified)' : ''}` : '[Empty / Ejected]');
        setEl('status-fdd-b', st.fddB.mounted ? st.fddB.name : '[Empty / Ejected]');
        setEl('status-hdd-c', st.hddC.mounted ? `${st.hddC.name} (${st.hddC.sizeMb} MB)` : '[Unmounted]');
        setEl('status-cd-e', st.cdE.trayOpen ? '[Tray Open]' : (st.cdE.mounted ? st.cdE.name : '[No Disc]'));

        // Update Monitor Bezel Bar Labels
        setEl('bezel-floppy-name', st.fddA.mounted ? st.fddA.name : '[None]');
        setEl('bezel-hdd-name', st.hddC.mounted ? st.hddC.name : '[None]');

        // Visual drive slot classes
        const bayA = document.getElementById('drive-bay-fdd-a');
        if (bayA) bayA.classList.toggle('disk-inserted', st.fddA.mounted);

        const bayB = document.getElementById('drive-bay-fdd-b');
        if (bayB) bayB.classList.toggle('disk-inserted', st.fddB.mounted);

        const bayCd = document.getElementById('drive-bay-cd-e');
        if (bayCd) {
            bayCd.classList.toggle('tray-open', st.cdE.trayOpen);
            bayCd.classList.toggle('disk-inserted', st.cdE.mounted);
        }
    }
}
