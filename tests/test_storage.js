/**
 * Automated Unit Tests for Multi-I/O Storage Controller (Floppy, IDE HDD, CD-ROM)
 */

import assert from 'node:assert/strict';
import { RetroBus } from '../js/retro_bus.js';
import { MultiIOCard } from '../js/cards/multio_card.js';

console.log('Running Storage & Disk Controller Tests...');

const bus = new RetroBus(16);
const mio = new MultiIOCard();
bus.installCard(3, mio);

// 1. Test Floppy Drive A: Mount & Eject
const floppyBuf = new ArrayBuffer(1474560);
const floppyView = new Uint8Array(floppyBuf);
floppyView[0] = 0xEB;
floppyView[510] = 0x55;
floppyView[511] = 0xAA;

mio.mountFloppy(0, floppyBuf, 'TEST_BOOT.IMG');
assert.equal(mio.drives.fddA.mounted, true, 'Drive A: should report mounted');
assert.equal(mio.drives.fddA.name, 'TEST_BOOT.IMG', 'Drive A: filename should match');

mio.ejectFloppy(0);
assert.equal(mio.drives.fddA.mounted, false, 'Drive A: should report unmounted after eject');

// 2. Test IDE Hard Disk C: Mount, Sector Write (0x30) & Sector Read (0x20)
const hddBuf = new ArrayBuffer(10 * 1024 * 1024); // 10 MB HDD
mio.mountHardDisk(0, hddBuf, 'TEST_HDD_10M.IMG');
assert.equal(mio.drives.hddC.mounted, true, 'Drive C: should be mounted');

// Select Drive 0, Head 0, Cylinder 0, Sector 1
bus.ioWrite(0x1F6, 0xA0); // Master drive, Head 0
bus.ioWrite(0x1F4, 0x00); // Cylinder Low = 0
bus.ioWrite(0x1F5, 0x00); // Cylinder High = 0
bus.ioWrite(0x1F3, 0x01); // Sector 1
bus.ioWrite(0x1F2, 0x01); // 1 sector
bus.ioWrite(0x1F7, 0x30); // Command 0x30: Write Sector

for (let i = 0; i < 512; i++) {
    bus.ioWrite(0x1F0, (i * 3) & 0xFF);
}
assert.equal(mio.drives.hddC.dirty, true, 'Drive C: should be marked dirty after sector write');

// Now Read back Sector 1 via Command 0x20
bus.ioWrite(0x1F3, 0x01);
bus.ioWrite(0x1F7, 0x20); // Command 0x20: Read Sector

for (let i = 0; i < 512; i++) {
    const b = bus.ioRead(0x1F0);
    assert.equal(b, (i * 3) & 0xFF, `Read byte ${i} from sector 1 should match written value`);
}

// 3. Test CD-ROM Drive E: Mount & Motorized Tray Eject
const isoBuf = new ArrayBuffer(65536);
mio.mountCdrom(isoBuf, 'GAMES_CD.ISO');
assert.equal(mio.drives.cdE.mounted, true, 'CD-ROM E: should be mounted');
assert.equal(mio.drives.cdE.trayOpen, false, 'CD-ROM tray should be closed');

mio.ejectCdrom();
assert.equal(mio.drives.cdE.trayOpen, true, 'CD-ROM tray should open on eject');
assert.equal(mio.drives.cdE.mounted, false, 'CD-ROM should unmount when tray opens');

console.log('✅ All Storage & Disk Controller tests passed!');
