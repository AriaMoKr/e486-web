#include "aichat.h"
#include "screen.h"
#include "serial.h"
#include "sound.h"
#include "protocol.h"
#include <conio.h>
#include <dos.h>
#include <unistd.h>
#include <stdarg.h>

AppConfig g_config = {
    .com_port = DEFAULT_COM_PORT,
    .baud_rate = DEFAULT_BAUD,
    .theme = THEME_NORTON_BLUE,
    .sound_enabled = true,
    .token_tick = true,
    .model = "gemini-2.5-flash",
    .prompt_prefix = "[You] > ",
    .temperature = 0.7f,
    .max_tokens = 2048
};

bool g_running = true;
bool g_connected = false;
bool g_is_streaming = false;
uint32_t g_token_count = 0;

/* Command history */
#define CMD_HISTORY_CAP 32
static char s_history[CMD_HISTORY_CAP][MAX_INPUT_LEN];
static int s_history_count = 0;
static int s_history_idx = -1;

static char s_input[MAX_INPUT_LEN] = "";
static int  s_cursor = 0;

void aichat_set_status(const char *fmt, ...)
{
    char buf[128];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    screen_draw_statusbar(buf);
}

static void add_to_prompt_history(const char *cmd)
{
    if (!cmd || !cmd[0]) return;
    if (s_history_count > 0 && strcmp(s_history[s_history_count - 1], cmd) == 0) {
        return;
    }
    if (s_history_count < CMD_HISTORY_CAP) {
        strncpy(s_history[s_history_count++], cmd, MAX_INPUT_LEN - 1);
    } else {
        memmove(&s_history[0], &s_history[1], sizeof(s_history[0]) * (CMD_HISTORY_CAP - 1));
        strncpy(s_history[CMD_HISTORY_CAP - 1], cmd, MAX_INPUT_LEN - 1);
    }
    s_history_idx = -1;
}

static void load_config_ini(const char *path)
{
    FILE *f = fopen(path, "r");
    if (!f) return;

    char line[128];
    while (fgets(line, sizeof(line), f)) {
        char *eq = strchr(line, '=');
        if (!eq) continue;
        *eq = '\0';
        char *key = line;
        char *val = eq + 1;
        while (*val == ' ' || *val == '\t') val++;
        char *end = val + strlen(val) - 1;
        while (end >= val && (*end == '\r' || *end == '\n' || *end == ' ')) {
            *end-- = '\0';
        }

        if (strstr(key, "port")) {
            g_config.com_port = atoi(val);
        } else if (strstr(key, "baud")) {
            g_config.baud_rate = atoi(val);
        } else if (strstr(key, "theme")) {
            g_config.theme = (ThemeId)atoi(val);
        } else if (strstr(key, "sound")) {
            g_config.sound_enabled = (atoi(val) != 0);
        } else if (strstr(key, "model")) {
            strncpy(g_config.model, val, sizeof(g_config.model) - 1);
        }
    }
    fclose(f);
}

static void handle_user_command(const char *cmd)
{
    if (strncmp(cmd, "/help", 5) == 0) {
        screen_show_help_dialog();
    } else if (strncmp(cmd, "/model", 6) == 0) {
        const char *m = cmd + 6;
        while (*m == ' ') m++;
        if (*m) {
            strncpy(g_config.model, m, sizeof(g_config.model) - 1);
            protocol_send_model(g_config.model);
            aichat_set_status("Model set to %s", g_config.model);
            sound_click();
        } else {
            screen_show_model_dialog();
        }
    } else if (strncmp(cmd, "/clear", 6) == 0) {
        protocol_send_reset();
        screen_init();
        aichat_append_chat(MSG_SYSTEM, "Conversation context cleared.");
        sound_click();
    } else if (strncmp(cmd, "/sys", 4) == 0) {
        const char *prompt = cmd + 4;
        while (*prompt == ' ') prompt++;
        protocol_send_sysprompt(prompt);
        aichat_append_chat(MSG_SYSTEM, "System persona prompt updated.");
        sound_click();
    } else if (strncmp(cmd, "/quit", 5) == 0 || strncmp(cmd, "/exit", 5) == 0) {
        g_running = false;
    } else {
        aichat_append_chat(MSG_ERROR, "Unknown slash command. Type /help for assistance.");
        sound_error();
    }
}

static void submit_prompt(void)
{
    if (s_input[0] == '\0') return;

    add_to_prompt_history(s_input);

    if (s_input[0] == '/') {
        handle_user_command(s_input);
    } else {
        aichat_append_chat(MSG_USER, s_input);
        protocol_send_message(s_input);
        sound_send();
        aichat_set_status("Query sent to remote LLM. Awaiting response...");
    }

    s_input[0] = '\0';
    s_cursor = 0;
    screen_draw_input(s_input, s_cursor);
}

static void parse_args(int argc, char **argv)
{
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-p") == 0 && i + 1 < argc) {
            g_config.com_port = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-b") == 0 && i + 1 < argc) {
            g_config.baud_rate = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-m") == 0 && i + 1 < argc) {
            strncpy(g_config.model, argv[++i], sizeof(g_config.model) - 1);
        } else if (strcmp(argv[i], "-nosound") == 0) {
            g_config.sound_enabled = false;
        }
    }
}

int main(int argc, char **argv)
{
    load_config_ini("AICHAT.INI");
    parse_args(argc, argv);

    sound_init();
    serial_init(g_config.com_port, g_config.baud_rate);
    protocol_init();
    screen_init();

    sound_welcome();

    aichat_append_chat(MSG_SYSTEM, "Welcome to DOS AI Chatbot v1.0!");
    aichat_append_chat(MSG_SYSTEM, "Bridge connected via COM port. Type a prompt or press F1 for Help.");

    protocol_send_ping();
    protocol_send_model(g_config.model);

    screen_draw_input(s_input, s_cursor);

    uint32_t ping_counter = 0;

    while (g_running) {
        serial_poll();

        if (kbhit()) {
            int ch = getch();

            /* Extended key prefix (0 or 0xE0) */
            if (ch == 0 || ch == 0xE0) {
                int ext = getch();
                switch (ext) {
                    case 0x3B: /* F1 */
                        screen_show_help_dialog();
                        break;
                    case 0x3C: /* F2 */
                        screen_show_model_dialog();
                        break;
                    case 0x3D: /* F3 */
                        screen_show_theme_dialog();
                        break;
                    case 0x3E: /* F4 */
                        protocol_send_reset();
                        screen_init();
                        aichat_append_chat(MSG_SYSTEM, "Screen cleared and context reset.");
                        sound_click();
                        break;
                    case 0x3F: /* F5 */
                        g_config.sound_enabled = !g_config.sound_enabled;
                        aichat_set_status("PC Speaker Sound %s", g_config.sound_enabled ? "Enabled" : "Disabled");
                        if (g_config.sound_enabled) sound_welcome();
                        break;
                    case 0x48: /* Up Arrow - Previous prompt */
                        if (s_history_count > 0) {
                            if (s_history_idx == -1) s_history_idx = s_history_count - 1;
                            else if (s_history_idx > 0) s_history_idx--;
                            strncpy(s_input, s_history[s_history_idx], sizeof(s_input) - 1);
                            s_cursor = (int)strlen(s_input);
                            screen_draw_input(s_input, s_cursor);
                        }
                        break;
                    case 0x50: /* Down Arrow - Next prompt */
                        if (s_history_count > 0 && s_history_idx != -1) {
                            if (s_history_idx < s_history_count - 1) {
                                s_history_idx++;
                                strncpy(s_input, s_history[s_history_idx], sizeof(s_input) - 1);
                            } else {
                                s_history_idx = -1;
                                s_input[0] = '\0';
                            }
                            s_cursor = (int)strlen(s_input);
                            screen_draw_input(s_input, s_cursor);
                        }
                        break;
                    case 0x4B: /* Left Arrow */
                        if (s_cursor > 0) {
                            s_cursor--;
                            screen_draw_input(s_input, s_cursor);
                        }
                        break;
                    case 0x4D: /* Right Arrow */
                        if (s_cursor < (int)strlen(s_input)) {
                            s_cursor++;
                            screen_draw_input(s_input, s_cursor);
                        }
                        break;
                    case 0x47: /* Home */
                        s_cursor = 0;
                        screen_draw_input(s_input, s_cursor);
                        break;
                    case 0x4F: /* End */
                        s_cursor = (int)strlen(s_input);
                        screen_draw_input(s_input, s_cursor);
                        break;
                    case 0x53: /* Delete */
                        if (s_cursor < (int)strlen(s_input)) {
                            memmove(&s_input[s_cursor], &s_input[s_cursor + 1], strlen(s_input) - s_cursor);
                            screen_draw_input(s_input, s_cursor);
                        }
                        break;
                    case 0x49: /* Page Up */
                        screen_scroll_chat(5);
                        break;
                    case 0x51: /* Page Down */
                        screen_scroll_chat(-5);
                        break;
                }
            } else if (ch == 27) { /* ESC */
                if (g_is_streaming) {
                    /* Cancel streaming */
                    protocol_send_reset();
                    aichat_stream_end();
                    aichat_append_chat(MSG_SYSTEM, "Response cancelled by user.");
                } else {
                    /* Exit confirmation */
                    g_running = false;
                }
            } else if (ch == 13 || ch == 10) { /* Enter */
                submit_prompt();
            } else if (ch == 8) { /* Backspace */
                if (s_cursor > 0) {
                    memmove(&s_input[s_cursor - 1], &s_input[s_cursor], strlen(s_input) - s_cursor + 1);
                    s_cursor--;
                    screen_draw_input(s_input, s_cursor);
                }
            } else if (ch >= 32 && ch <= 126) { /* Printable ASCII */
                int len = (int)strlen(s_input);
                if (len < MAX_INPUT_LEN - 2) {
                    memmove(&s_input[s_cursor + 1], &s_input[s_cursor], len - s_cursor + 1);
                    s_input[s_cursor++] = (char)ch;
                    screen_draw_input(s_input, s_cursor);
                }
            }
        }

        /* Periodic ping every ~2000 loop iterations if disconnected */
        if (!g_connected && (++ping_counter % 2000 == 0)) {
            protocol_send_ping();
        }

        delay(5);
    }

    screen_shutdown();
    sound_shutdown();
    serial_shutdown();

    printf("\nThank you for using DOS AI Chatbot!\nGoodbye.\n");
    return 0;
}
