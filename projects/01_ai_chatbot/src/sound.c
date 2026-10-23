#include "sound.h"
#include "aichat.h"
#include <pc.h>
#include <dos.h>
#include <unistd.h>

#define PIT_FREQ 1193182UL

void sound_init(void)
{
    /* Ensure speaker is turned off initially */
    sound_shutdown();
}

void sound_shutdown(void)
{
    unsigned char val = inportb(0x61);
    outportb(0x61, val & ~0x03);
}

void sound_play_tone(uint16_t freq_hz, uint16_t duration_ms)
{
    if (!g_config.sound_enabled) return;
    if (freq_hz == 0 || freq_hz > 20000) {
        if (duration_ms > 0) delay(duration_ms);
        return;
    }

    uint32_t divisor = PIT_FREQ / freq_hz;
    if (divisor > 65535) divisor = 65535;

    /* Set 8254 PIT channel 2 to Mode 3 (Square Wave) */
    outportb(0x43, 0xB6);
    outportb(0x42, (uint8_t)(divisor & 0xFF));
    outportb(0x42, (uint8_t)((divisor >> 8) & 0xFF));

    /* Turn on PC speaker */
    unsigned char val = inportb(0x61);
    outportb(0x61, val | 0x03);

    delay(duration_ms);

    /* Turn off PC speaker */
    val = inportb(0x61);
    outportb(0x61, val & ~0x03);
}

void sound_welcome(void)
{
    if (!g_config.sound_enabled) return;
    sound_play_tone(523, 60);  /* C5 */
    sound_play_tone(659, 60);  /* E5 */
    sound_play_tone(784, 60);  /* G5 */
    sound_play_tone(1046, 120);/* C6 */
}

void sound_send(void)
{
    if (!g_config.sound_enabled) return;
    sound_play_tone(440, 30);  /* A4 */
    sound_play_tone(880, 40);  /* A5 */
}

void sound_token_tick(void)
{
    if (!g_config.sound_enabled || !g_config.token_tick) return;
    /* Soft click sound */
    sound_play_tone(1800, 3);
}

void sound_done(void)
{
    if (!g_config.sound_enabled) return;
    sound_play_tone(880, 50);  /* A5 */
    delay(20);
    sound_play_tone(1175, 80); /* D6 */
}

void sound_error(void)
{
    if (!g_config.sound_enabled) return;
    sound_play_tone(220, 150); /* A3 buzz */
    delay(40);
    sound_play_tone(180, 200);
}

void sound_click(void)
{
    if (!g_config.sound_enabled) return;
    sound_play_tone(1200, 5);
}
