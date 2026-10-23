#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <stdint.h>
#include <stdbool.h>

void protocol_init(void);
void protocol_feed_byte(uint8_t byte);
void protocol_send_ping(void);
void protocol_send_message(const char *text);
void protocol_send_model(const char *model);
void protocol_send_reset(void);
void protocol_send_sysprompt(const char *prompt);

#endif /* PROTOCOL_H */
