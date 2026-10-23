#ifndef SERIAL_H
#define SERIAL_H

#include <stdint.h>
#include <stdbool.h>

#define COM1_BASE 0x3F8
#define COM2_BASE 0x2F8
#define COM3_BASE 0x3E8
#define COM4_BASE 0x2E8

#define UART_RX_BUFFER_SIZE 4096

bool serial_init(int port, int baud);
void serial_shutdown(void);
void serial_poll(void);
bool serial_write_byte(uint8_t b);
bool serial_write_str(const char *str);
bool serial_write_buf(const uint8_t *buf, int len);
int  serial_read_byte(void);
bool serial_has_data(void);
void serial_flush_rx(void);

#endif /* SERIAL_H */
