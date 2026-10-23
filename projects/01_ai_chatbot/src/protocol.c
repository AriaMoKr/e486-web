#include "protocol.h"
#include "serial.h"
#include "aichat.h"
#include "sound.h"
#include <stdio.h>
#include <string.h>

#define PROTO_BUF_SIZE 2048

static char s_rx_buf[PROTO_BUF_SIZE];
static int  s_rx_len = 0;
static bool s_in_packet = false;

void protocol_init(void)
{
    s_rx_len = 0;
    s_in_packet = false;
}

static void handle_incoming_frame(const char *frame)
{
    if (!frame || !frame[0]) return;

    /* PONG */
    if (strncmp(frame, "PONG", 4) == 0) {
        g_connected = true;
        aichat_set_status("Online - Connected to Gateway");
        return;
    }

    /* TOK:<token text> */
    if (strncmp(frame, "TOK:", 4) == 0) {
        const char *token = frame + 4;
        if (!g_is_streaming) {
            aichat_stream_start();
        }
        aichat_append_token(token);
        sound_token_tick();
        return;
    }

    /* DONE */
    if (strncmp(frame, "DONE", 4) == 0) {
        aichat_stream_end();
        sound_done();
        return;
    }

    /* ERR:<error message> */
    if (strncmp(frame, "ERR:", 4) == 0) {
        const char *err = frame + 4;
        aichat_append_chat(MSG_ERROR, err);
        aichat_set_status("Error: %s", err);
        sound_error();
        if (g_is_streaming) {
            aichat_stream_end();
        }
        return;
    }

    /* STAT:<status info> */
    if (strncmp(frame, "STAT:", 5) == 0) {
        const char *st = frame + 5;
        aichat_set_status("%s", st);
        return;
    }

    /* MODEL:<active model> */
    if (strncmp(frame, "MODEL:", 6) == 0) {
        const char *m = frame + 6;
        strncpy(g_config.model, m, sizeof(g_config.model) - 1);
        g_config.model[sizeof(g_config.model) - 1] = '\0';
        aichat_set_status("Active Model: %s", g_config.model);
        return;
    }

    /* Generic message if no prefix matched */
    if (g_is_streaming) {
        aichat_append_token(frame);
    }
}

void protocol_feed_byte(uint8_t byte)
{
    /* Handle STX (\x02) start of frame */
    if (byte == 0x02) {
        s_rx_len = 0;
        s_in_packet = true;
        return;
    }

    /* Handle ETX (\x03) end of frame */
    if (byte == 0x03) {
        if (s_in_packet) {
            s_rx_buf[s_rx_len] = '\0';
            handle_incoming_frame(s_rx_buf);
            s_rx_len = 0;
            s_in_packet = false;
        }
        return;
    }

    /* Also handle standard newline framing \n or \r\n */
    if (byte == '\n' || byte == '\r') {
        if (s_rx_len > 0) {
            s_rx_buf[s_rx_len] = '\0';
            handle_incoming_frame(s_rx_buf);
            s_rx_len = 0;
            s_in_packet = false;
        }
        return;
    }

    /* Append to buffer if within limits */
    if (s_rx_len < (PROTO_BUF_SIZE - 1)) {
        s_rx_buf[s_rx_len++] = (char)byte;
    }
}

void protocol_send_ping(void)
{
    serial_write_str("\x02PING\x03\n");
}

void protocol_send_message(const char *text)
{
    if (!text || !text[0]) return;
    serial_write_str("\x02MSG:");
    serial_write_str(text);
    serial_write_str("\x03\n");
}

void protocol_send_model(const char *model)
{
    if (!model || !model[0]) return;
    serial_write_str("\x02CMD:MODEL ");
    serial_write_str(model);
    serial_write_str("\x03\n");
}

void protocol_send_reset(void)
{
    serial_write_str("\x02CMD:RESET\x03\n");
}

void protocol_send_sysprompt(const char *prompt)
{
    if (!prompt) return;
    serial_write_str("\x02CMD:SYS ");
    serial_write_str(prompt);
    serial_write_str("\x03\n");
}
