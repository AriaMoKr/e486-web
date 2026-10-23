#ifndef AICHAT_H
#define AICHAT_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#define APP_TITLE       "DOS AI CHATBOT v1.0"
#define APP_SUBTITLE    "Modern Remote LLM Interface for MS-DOS"
#define APP_AUTHOR      "Retro Computing Lab"
#define APP_YEAR        "2026"

#define MAX_INPUT_LEN   512
#define MAX_HISTORY_LEN 1000
#define MAX_LINE_COLS   80
#define SCREEN_ROWS     25
#define SCREEN_COLS     80

#define DEFAULT_COM_PORT 1       /* COM1 (0x3F8) */
#define DEFAULT_BAUD     115200

/* Color themes */
typedef enum {
    THEME_NORTON_BLUE = 0,
    THEME_MATRIX_GREEN = 1,
    THEME_AMBER_CRT = 2,
    THEME_CYBER_DARK = 3,
    THEME_COUNT = 4
} ThemeId;

/* Chat message sender */
typedef enum {
    MSG_USER,
    MSG_ASSISTANT,
    MSG_SYSTEM,
    MSG_ERROR,
    MSG_STATUS
} SenderType;

/* Application configuration */
typedef struct {
    int com_port;           /* 1..4 */
    int baud_rate;          /* 9600, 19200, 38400, 57600, 115200 */
    ThemeId theme;          /* Current theme */
    bool sound_enabled;     /* PC speaker sound effects */
    bool token_tick;        /* Sound tick on each received token */
    char model[64];         /* Active LLM name */
    char prompt_prefix[32]; /* Default "[You] > " */
    float temperature;      /* Sampling temperature */
    int max_tokens;         /* Response limit */
} AppConfig;

/* Global state */
extern AppConfig g_config;
extern bool g_running;
extern bool g_connected;
extern bool g_is_streaming;
extern uint32_t g_token_count;

void aichat_set_status(const char *fmt, ...);
void aichat_append_chat(SenderType sender, const char *text);
void aichat_append_token(const char *token);
void aichat_stream_start(void);
void aichat_stream_end(void);
void aichat_send_user_message(const char *msg);
void aichat_send_command(const char *cmd, const char *args);

#endif /* AICHAT_H */
