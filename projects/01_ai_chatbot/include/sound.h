#ifndef SOUND_H
#define SOUND_H

#include <stdint.h>
#include <stdbool.h>

void sound_init(void);
void sound_shutdown(void);
void sound_play_tone(uint16_t freq_hz, uint16_t duration_ms);
void sound_welcome(void);
void sound_send(void);
void sound_token_tick(void);
void sound_done(void);
void sound_error(void);
void sound_click(void);

#endif /* SOUND_H */
