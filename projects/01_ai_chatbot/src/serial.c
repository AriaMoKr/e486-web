#include "serial.h"
#include "protocol.h"
#include "aichat.h"
#include <pc.h>
#include <dos.h>
#include <stdio.h>

static uint16_t s_uart_base = COM1_BASE;
static bool s_initialized = false;

static uint16_t get_port_base(int port)
{
    switch (port) {
        case 1: return COM1_BASE;
        case 2: return COM2_BASE;
        case 3: return COM3_BASE;
        case 4: return COM4_BASE;
        default: return COM1_BASE;
    }
}

bool serial_init(int port, int baud)
{
    s_uart_base = get_port_base(port);

    if (baud <= 0) baud = 115200;
    uint32_t divisor = 115200UL / (uint32_t)baud;
    if (divisor == 0) divisor = 1;
    if (divisor > 65535) divisor = 65535;

    /* Disable all UART interrupts */
    outportb(s_uart_base + 1, 0x00);

    /* Set DLAB = 1 (Divisor Latch Access Bit) to configure baud rate */
    outportb(s_uart_base + 3, 0x80);

    /* Set baud divisor */
    outportb(s_uart_base + 0, (uint8_t)(divisor & 0xFF));
    outportb(s_uart_base + 1, (uint8_t)((divisor >> 8) & 0xFF));

    /* 8 bits, no parity, 1 stop bit, DLAB = 0 */
    outportb(s_uart_base + 3, 0x03);

    /* Enable and reset FIFO buffers (14-byte trigger) */
    outportb(s_uart_base + 2, 0xC7);

    /* Assert DTR, RTS, and OUT2 */
    outportb(s_uart_base + 4, 0x0B);

    /* Drain any leftover junk in RX register */
    int drain = 16;
    while ((inportb(s_uart_base + 5) & 0x01) && --drain >= 0) {
        inportb(s_uart_base + 0);
    }

    s_initialized = true;
    return true;
}

void serial_shutdown(void)
{
    if (!s_initialized) return;

    /* Disable interrupts and drop DTR / RTS */
    outportb(s_uart_base + 1, 0x00);
    outportb(s_uart_base + 4, 0x00);
    s_initialized = false;
}

bool serial_has_data(void)
{
    if (!s_initialized) return false;
    return (inportb(s_uart_base + 5) & 0x01) != 0;
}

int serial_read_byte(void)
{
    if (!s_initialized) return -1;
    if (inportb(s_uart_base + 5) & 0x01) {
        return inportb(s_uart_base + 0);
    }
    return -1;
}

bool serial_write_byte(uint8_t b)
{
    if (!s_initialized) return false;

    /* Wait for Transmitter Holding Register Empty (bit 5 of LSR) with timeout */
    uint32_t timeout = 50000;
    while (!(inportb(s_uart_base + 5) & 0x20)) {
        if (--timeout == 0) {
            return false; /* TX timeout */
        }
    }

    outportb(s_uart_base + 0, b);
    return true;
}

bool serial_write_str(const char *str)
{
    if (!str) return false;
    while (*str) {
        if (!serial_write_byte((uint8_t)*str++)) {
            return false;
        }
    }
    return true;
}

bool serial_write_buf(const uint8_t *buf, int len)
{
    if (!buf || len <= 0) return false;
    for (int i = 0; i < len; i++) {
        if (!serial_write_byte(buf[i])) {
            return false;
        }
    }
    return true;
}

void serial_flush_rx(void)
{
    if (!s_initialized) return;
    int limit = 256;
    while ((inportb(s_uart_base + 5) & 0x01) && --limit >= 0) {
        inportb(s_uart_base + 0);
    }
}

void serial_poll(void)
{
    if (!s_initialized) return;

    /* Process up to 64 bytes per poll iteration */
    int count = 64;
    while ((inportb(s_uart_base + 5) & 0x01) && --count >= 0) {
        uint8_t b = (uint8_t)inportb(s_uart_base + 0);
        protocol_feed_byte(b);
    }
}
