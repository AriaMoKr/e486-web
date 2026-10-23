#include "screen.h"
#include "sound.h"
#include "protocol.h"
#include <sys/movedata.h>
#include <dos.h>
#include <pc.h>
#include <conio.h>
#include <stdarg.h>

#define CHAT_TOP_ROW    1
#define CHAT_BOT_ROW    20
#define CHAT_LEFT_COL   0
#define CHAT_RIGHT_COL  79
#define CHAT_HEIGHT     (CHAT_BOT_ROW - CHAT_TOP_ROW + 1)
#define CHAT_WIDTH      (CHAT_RIGHT_COL - CHAT_LEFT_COL + 1)
#define CHAT_INNER_COLS 76

#define STATUS_ROW      21
#define INPUT_FRAME_ROW 22
#define INPUT_ROW       23
#define HOTKEYS_ROW     24

static uint16_t s_backbuf[SCREEN_ROWS][SCREEN_COLS];

/* Line entry in formatted history */
typedef struct {
    char text[MAX_LINE_COLS + 1];
    uint8_t attr;
} FormattedLine;

static FormattedLine s_lines[MAX_HISTORY_LEN];
static int s_total_lines = 0;
static int s_scroll_offset = 0; /* 0 means bottom, >0 scrolls up */

static const ThemePalette s_palettes[THEME_COUNT] = {
    /* Norton Blue */
    [THEME_NORTON_BLUE] = {
        .topbar = MAKE_ATTR(C_WHITE, C_CYAN),
        .topbar_badge = MAKE_ATTR(C_YELLOW, C_BLUE),
        .chat_bg = MAKE_ATTR(C_WHITE, C_BLUE),
        .chat_border = MAKE_ATTR(C_LIGHTCYAN, C_BLUE),
        .text_user = MAKE_ATTR(C_YELLOW, C_BLUE),
        .text_ai = MAKE_ATTR(C_WHITE, C_BLUE),
        .text_sys = MAKE_ATTR(C_LIGHTGREEN, C_BLUE),
        .text_err = MAKE_ATTR(C_LIGHTRED, C_BLUE),
        .text_code = MAKE_ATTR(C_LIGHTCYAN, C_BLACK),
        .stat_bar = MAKE_ATTR(C_BLACK, C_LIGHTGRAY),
        .stat_alert = MAKE_ATTR(C_WHITE, C_RED),
        .input_box = MAKE_ATTR(C_LIGHTCYAN, C_BLUE),
        .input_text = MAKE_ATTR(C_YELLOW, C_BLUE),
        .hotkey_bar = MAKE_ATTR(C_BLACK, C_LIGHTGRAY),
        .hotkey_key = MAKE_ATTR(C_WHITE, C_BLACK),
        .dialog_box = MAKE_ATTR(C_BLACK, C_LIGHTGRAY),
        .dialog_border = MAKE_ATTR(C_WHITE, C_LIGHTGRAY),
        .dialog_hi = MAKE_ATTR(C_YELLOW, C_BLUE)
    },
    /* Matrix Green */
    [THEME_MATRIX_GREEN] = {
        .topbar = MAKE_ATTR(C_BLACK, C_GREEN),
        .topbar_badge = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .chat_bg = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .chat_border = MAKE_ATTR(C_GREEN, C_BLACK),
        .text_user = MAKE_ATTR(C_WHITE, C_BLACK),
        .text_ai = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .text_sys = MAKE_ATTR(C_GREEN, C_BLACK),
        .text_err = MAKE_ATTR(C_LIGHTRED, C_BLACK),
        .text_code = MAKE_ATTR(C_LIGHTGREEN, C_DARKGRAY),
        .stat_bar = MAKE_ATTR(C_BLACK, C_GREEN),
        .stat_alert = MAKE_ATTR(C_WHITE, C_RED),
        .input_box = MAKE_ATTR(C_GREEN, C_BLACK),
        .input_text = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .hotkey_bar = MAKE_ATTR(C_BLACK, C_DARKGRAY),
        .hotkey_key = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .dialog_box = MAKE_ATTR(C_LIGHTGREEN, C_BLACK),
        .dialog_border = MAKE_ATTR(C_GREEN, C_BLACK),
        .dialog_hi = MAKE_ATTR(C_BLACK, C_LIGHTGREEN)
    },
    /* Amber CRT */
    [THEME_AMBER_CRT] = {
        .topbar = MAKE_ATTR(C_BLACK, C_BROWN),
        .topbar_badge = MAKE_ATTR(C_YELLOW, C_BLACK),
        .chat_bg = MAKE_ATTR(C_BROWN, C_BLACK),
        .chat_border = MAKE_ATTR(C_BROWN, C_BLACK),
        .text_user = MAKE_ATTR(C_WHITE, C_BLACK),
        .text_ai = MAKE_ATTR(C_YELLOW, C_BLACK),
        .text_sys = MAKE_ATTR(C_BROWN, C_BLACK),
        .text_err = MAKE_ATTR(C_LIGHTRED, C_BLACK),
        .text_code = MAKE_ATTR(C_YELLOW, C_DARKGRAY),
        .stat_bar = MAKE_ATTR(C_BLACK, C_BROWN),
        .stat_alert = MAKE_ATTR(C_WHITE, C_RED),
        .input_box = MAKE_ATTR(C_BROWN, C_BLACK),
        .input_text = MAKE_ATTR(C_YELLOW, C_BLACK),
        .hotkey_bar = MAKE_ATTR(C_BLACK, C_DARKGRAY),
        .hotkey_key = MAKE_ATTR(C_YELLOW, C_BLACK),
        .dialog_box = MAKE_ATTR(C_YELLOW, C_BLACK),
        .dialog_border = MAKE_ATTR(C_BROWN, C_BLACK),
        .dialog_hi = MAKE_ATTR(C_BLACK, C_YELLOW)
    },
    /* Cyber Dark */
    [THEME_CYBER_DARK] = {
        .topbar = MAKE_ATTR(C_WHITE, C_DARKGRAY),
        .topbar_badge = MAKE_ATTR(C_LIGHTCYAN, C_BLACK),
        .chat_bg = MAKE_ATTR(C_LIGHTGRAY, C_BLACK),
        .chat_border = MAKE_ATTR(C_DARKGRAY, C_BLACK),
        .text_user = MAKE_ATTR(C_YELLOW, C_BLACK),
        .text_ai = MAKE_ATTR(C_LIGHTCYAN, C_BLACK),
        .text_sys = MAKE_ATTR(C_LIGHTGRAY, C_BLACK),
        .text_err = MAKE_ATTR(C_LIGHTRED, C_BLACK),
        .text_code = MAKE_ATTR(C_WHITE, C_DARKGRAY),
        .stat_bar = MAKE_ATTR(C_BLACK, C_LIGHTGRAY),
        .stat_alert = MAKE_ATTR(C_WHITE, C_RED),
        .input_box = MAKE_ATTR(C_DARKGRAY, C_BLACK),
        .input_text = MAKE_ATTR(C_WHITE, C_BLACK),
        .hotkey_bar = MAKE_ATTR(C_BLACK, C_DARKGRAY),
        .hotkey_key = MAKE_ATTR(C_YELLOW, C_BLACK),
        .dialog_box = MAKE_ATTR(C_WHITE, C_DARKGRAY),
        .dialog_border = MAKE_ATTR(C_LIGHTCYAN, C_DARKGRAY),
        .dialog_hi = MAKE_ATTR(C_BLACK, C_LIGHTCYAN)
    }
};

static ThemePalette s_theme;
static char s_current_status[128] = "System Initialized. Type a prompt or press F1 for Help.";

static void flush_screen(void)
{
    /* Copy backbuffer to real VGA text video memory at 0xB8000 */
    dosmemput(s_backbuf, sizeof(s_backbuf), 0xB8000);
}

static void buf_set(int row, int col, char ch, uint8_t attr)
{
    if (row < 0 || row >= SCREEN_ROWS || col < 0 || col >= SCREEN_COLS) return;
    s_backbuf[row][col] = ((uint16_t)attr << 8) | (uint8_t)ch;
}

static void buf_puts(int row, int col, const char *str, uint8_t attr)
{
    if (row < 0 || row >= SCREEN_ROWS || col >= SCREEN_COLS || !str) return;
    int c = col;
    while (*str && c < SCREEN_COLS) {
        s_backbuf[row][c++] = ((uint16_t)attr << 8) | (uint8_t)*str++;
    }
}

static void buf_fill_rect(int r1, int c1, int r2, int c2, char ch, uint8_t attr)
{
    for (int r = r1; r <= r2 && r < SCREEN_ROWS; r++) {
        for (int c = c1; c <= c2 && c < SCREEN_COLS; c++) {
            s_backbuf[r][c] = ((uint16_t)attr << 8) | (uint8_t)ch;
        }
    }
}

static void buf_draw_box(int r1, int c1, int r2, int c2, uint8_t attr, bool double_border)
{
    char horiz = double_border ? (char)BOX_D_HORIZ : (char)BOX_S_HORIZ;
    char vert  = double_border ? (char)BOX_D_VERT  : (char)BOX_S_VERT;
    char topleft  = double_border ? (char)BOX_D_TOPLEFT  : (char)BOX_S_TOPLEFT;
    char topright = double_border ? (char)BOX_D_TOPRIGHT : (char)BOX_S_TOPRIGHT;
    char botleft  = double_border ? (char)BOX_D_BOTLEFT  : (char)BOX_S_BOTLEFT;
    char botright = double_border ? (char)BOX_D_BOTRIGHT : (char)BOX_S_BOTRIGHT;

    buf_set(r1, c1, topleft, attr);
    buf_set(r1, c2, topright, attr);
    buf_set(r2, c1, botleft, attr);
    buf_set(r2, c2, botright, attr);

    for (int c = c1 + 1; c < c2; c++) {
        buf_set(r1, c, horiz, attr);
        buf_set(r2, c, horiz, attr);
    }
    for (int r = r1 + 1; r < r2; r++) {
        buf_set(r, c1, vert, attr);
        buf_set(r, c2, vert, attr);
    }
}

void screen_set_cursor(int row, int col)
{
    union REGS r;
    r.h.ah = 0x02; /* Set cursor position */
    r.h.bh = 0x00; /* Page 0 */
    r.h.dh = (uint8_t)row;
    r.h.dl = (uint8_t)col;
    int86(0x10, &r, &r);
}

void screen_show_cursor(bool show)
{
    union REGS r;
    r.h.ah = 0x01; /* Set cursor type */
    if (show) {
        r.h.ch = 0x06; /* Normal underline cursor */
        r.h.cl = 0x07;
    } else {
        r.h.ch = 0x20; /* Hidden cursor */
        r.h.cl = 0x00;
    }
    int86(0x10, &r, &r);
}

void screen_set_theme(ThemeId theme_id)
{
    if (theme_id >= THEME_COUNT) theme_id = THEME_NORTON_BLUE;
    g_config.theme = theme_id;
    s_theme = s_palettes[theme_id];
    screen_redraw_all();
}

void screen_init(void)
{
    /* Set standard 80x25 16-color text mode (Mode 03h) */
    union REGS r;
    r.h.ah = 0x00;
    r.h.al = 0x03;
    int86(0x10, &r, &r);

    s_theme = s_palettes[g_config.theme];
    s_total_lines = 0;
    s_scroll_offset = 0;

    screen_redraw_all();
}

void screen_shutdown(void)
{
    /* Clear screen to standard white-on-black */
    buf_fill_rect(0, 0, SCREEN_ROWS - 1, SCREEN_COLS - 1, ' ', MAKE_ATTR(C_LIGHTGRAY, C_BLACK));
    flush_screen();
    screen_set_cursor(0, 0);
    screen_show_cursor(true);
}

void screen_draw_topbar(void)
{
    buf_fill_rect(0, 0, 0, SCREEN_COLS - 1, ' ', s_theme.topbar);
    buf_puts(0, 2, " " APP_TITLE " ", s_theme.topbar_badge);

    char conn_str[48];
    if (g_connected) {
        snprintf(conn_str, sizeof(conn_str), "[COM%d %d BAUD - ONLINE]", g_config.com_port, g_config.baud_rate);
        buf_puts(0, 24, conn_str, MAKE_ATTR(C_LIGHTGREEN, C_BLACK));
    } else {
        snprintf(conn_str, sizeof(conn_str), "[COM%d - CONNECTING...]", g_config.com_port);
        buf_puts(0, 24, conn_str, MAKE_ATTR(C_LIGHTRED, C_BLACK));
    }

    char model_str[80];
    snprintf(model_str, sizeof(model_str), "Model: [%s]", g_config.model[0] ? g_config.model : "DEFAULT");
    int m_col = SCREEN_COLS - (int)strlen(model_str) - 2;
    if (m_col < 40) m_col = 40;
    buf_puts(0, m_col, model_str, s_theme.topbar_badge);
}

void screen_draw_chat_area(void)
{
    /* Draw frame */
    buf_draw_box(CHAT_TOP_ROW, CHAT_LEFT_COL, CHAT_BOT_ROW, CHAT_RIGHT_COL, s_theme.chat_border, true);

    /* Fill interior background */
    buf_fill_rect(CHAT_TOP_ROW + 1, CHAT_LEFT_COL + 1, CHAT_BOT_ROW - 1, CHAT_RIGHT_COL - 1, ' ', s_theme.chat_bg);

    int visible_height = CHAT_BOT_ROW - CHAT_TOP_ROW - 1; /* 18 lines */

    /* Calculate start line in buffer based on scroll offset */
    int end_line = s_total_lines - s_scroll_offset;
    if (end_line > s_total_lines) end_line = s_total_lines;
    int start_line = end_line - visible_height;
    if (start_line < 0) start_line = 0;

    int screen_row = CHAT_TOP_ROW + 1;
    for (int i = start_line; i < end_line; i++) {
        buf_puts(screen_row, CHAT_LEFT_COL + 2, s_lines[i].text, s_lines[i].attr);
        screen_row++;
    }

    /* Scrollbar indicator on right border */
    buf_set(CHAT_TOP_ROW + 1, CHAT_RIGHT_COL, (char)CH_UP_ARROW, s_theme.chat_border);
    buf_set(CHAT_BOT_ROW - 1, CHAT_RIGHT_COL, (char)CH_DOWN_ARROW, s_theme.chat_border);

    for (int r = CHAT_TOP_ROW + 2; r < CHAT_BOT_ROW - 1; r++) {
        buf_set(r, CHAT_RIGHT_COL, (char)CH_BLOCK_LIGHT, s_theme.chat_border);
    }

    if (s_total_lines > visible_height) {
        int track_len = visible_height - 2;
        int thumb_pos = (start_line * track_len) / (s_total_lines - visible_height + 1);
        if (thumb_pos >= track_len) thumb_pos = track_len - 1;
        buf_set(CHAT_TOP_ROW + 2 + thumb_pos, CHAT_RIGHT_COL, (char)CH_BLOCK_FULL, MAKE_ATTR(C_WHITE, C_BLUE));
    }
}

void screen_draw_statusbar(const char *status)
{
    if (status) {
        strncpy(s_current_status, status, sizeof(s_current_status) - 1);
        s_current_status[sizeof(s_current_status) - 1] = '\0';
    }

    uint8_t attr = g_is_streaming ? s_theme.stat_alert : s_theme.stat_bar;
    buf_fill_rect(STATUS_ROW, 0, STATUS_ROW, SCREEN_COLS - 1, ' ', attr);

    char stat_text[256];
    if (g_is_streaming) {
        snprintf(stat_text, sizeof(stat_text), " %c %s (%lu tokens received) [ESC to cancel]",
                 CH_TRI_RIGHT, s_current_status, (unsigned long)g_token_count);
    } else {
        snprintf(stat_text, sizeof(stat_text), " Status: %s", s_current_status);
    }
    buf_puts(STATUS_ROW, 0, stat_text, attr);
}

void screen_draw_input(const char *input_buffer, int cursor_pos)
{
    /* Input border */
    buf_draw_box(INPUT_FRAME_ROW, 0, INPUT_ROW + 1, SCREEN_COLS - 1, s_theme.input_box, false);
    buf_puts(INPUT_FRAME_ROW, 3, "[ Prompt Input ]", s_theme.input_box);

    /* Input content */
    buf_fill_rect(INPUT_ROW, 1, INPUT_ROW, SCREEN_COLS - 2, ' ', s_theme.input_text);
    buf_puts(INPUT_ROW, 2, "> ", MAKE_ATTR(C_WHITE, C_BLUE));

    int max_disp = SCREEN_COLS - 7;
    int disp_start = 0;
    if (cursor_pos > max_disp) {
        disp_start = cursor_pos - max_disp;
    }

    if (input_buffer) {
        buf_puts(INPUT_ROW, 4, input_buffer + disp_start, s_theme.input_text);
    }

    flush_screen();

    /* Position actual hardware cursor inside prompt */
    int screen_cursor_col = 4 + (cursor_pos - disp_start);
    if (screen_cursor_col >= SCREEN_COLS - 2) screen_cursor_col = SCREEN_COLS - 2;
    screen_set_cursor(INPUT_ROW, screen_cursor_col);
    screen_show_cursor(true);
}

void screen_draw_hotkeys(void)
{
    buf_fill_rect(HOTKEYS_ROW, 0, HOTKEYS_ROW, SCREEN_COLS - 1, ' ', s_theme.hotkey_bar);

    struct { const char *key; const char *desc; } keys[] = {
        {"F1", "Help"},
        {"F2", "Model"},
        {"F3", "Theme"},
        {"F4", "Clear"},
        {"F5", "Sound"},
        {"PgUp/Dn", "Scroll"},
        {"ESC", "Exit"}
    };

    int col = 1;
    for (int i = 0; i < 7; i++) {
        buf_puts(HOTKEYS_ROW, col, keys[i].key, s_theme.hotkey_key);
        col += (int)strlen(keys[i].key);
        buf_set(HOTKEYS_ROW, col++, ' ', s_theme.hotkey_bar);
        buf_puts(HOTKEYS_ROW, col, keys[i].desc, s_theme.hotkey_bar);
        col += (int)strlen(keys[i].desc) + 2;
    }
}

void screen_redraw_all(void)
{
    screen_draw_topbar();
    screen_draw_chat_area();
    screen_draw_statusbar(s_current_status);
    screen_draw_hotkeys();
    flush_screen();
}

void screen_scroll_chat(int lines)
{
    s_scroll_offset += lines;
    int visible_height = CHAT_BOT_ROW - CHAT_TOP_ROW - 1;
    int max_offset = s_total_lines - visible_height;
    if (max_offset < 0) max_offset = 0;

    if (s_scroll_offset < 0) s_scroll_offset = 0;
    if (s_scroll_offset > max_offset) s_scroll_offset = max_offset;

    screen_draw_chat_area();
    flush_screen();
}

void screen_scroll_to_bottom(void)
{
    s_scroll_offset = 0;
    screen_draw_chat_area();
    flush_screen();
}

static void add_single_line(const char *text, uint8_t attr)
{
    if (s_total_lines >= MAX_HISTORY_LEN) {
        /* Shift older lines up */
        memmove(&s_lines[0], &s_lines[1], sizeof(FormattedLine) * (MAX_HISTORY_LEN - 1));
        s_total_lines = MAX_HISTORY_LEN - 1;
    }

    strncpy(s_lines[s_total_lines].text, text, MAX_LINE_COLS);
    s_lines[s_total_lines].text[MAX_LINE_COLS] = '\0';
    s_lines[s_total_lines].attr = attr;
    s_total_lines++;
}

void aichat_append_chat(SenderType sender, const char *text)
{
    if (!text) return;

    uint8_t tag_attr = s_theme.text_sys;
    uint8_t body_attr = s_theme.text_sys;
    const char *tag_str = "[Sys] ";

    switch (sender) {
        case MSG_USER:
            tag_attr = s_theme.text_user;
            body_attr = s_theme.text_user;
            tag_str = "[You] ";
            break;
        case MSG_ASSISTANT:
            tag_attr = MAKE_ATTR(C_LIGHTCYAN, C_BLUE);
            body_attr = s_theme.text_ai;
            tag_str = "[AI]  ";
            break;
        case MSG_ERROR:
            tag_attr = s_theme.text_err;
            body_attr = s_theme.text_err;
            tag_str = "[Err] ";
            break;
        case MSG_STATUS:
        case MSG_SYSTEM:
        default:
            tag_attr = s_theme.text_sys;
            body_attr = s_theme.text_sys;
            tag_str = "[Sys] ";
            break;
    }
    (void)tag_attr;

    /* Format with prefix and word wrap */
    char line_buf[MAX_LINE_COLS + 1];
    snprintf(line_buf, sizeof(line_buf), "%s", tag_str);
    int line_len = (int)strlen(line_buf);

    const char *p = text;
    while (*p) {
        /* Collect next word or segment */
        int word_len = 0;
        while (p[word_len] && p[word_len] != ' ' && p[word_len] != '\n') {
            word_len++;
        }

        if (p[word_len] == '\n') {
            /* Flush current line */
            if (line_len + word_len >= CHAT_INNER_COLS) {
                line_buf[line_len] = '\0';
                add_single_line(line_buf, body_attr);
                line_len = 0;
            }
            memcpy(line_buf + line_len, p, word_len);
            line_len += word_len;
            line_buf[line_len] = '\0';
            add_single_line(line_buf, body_attr);
            line_len = 0;
            p += word_len + 1;
            continue;
        }

        if (line_len + word_len + 1 > CHAT_INNER_COLS) {
            line_buf[line_len] = '\0';
            add_single_line(line_buf, body_attr);
            strcpy(line_buf, "      "); /* Indent continuation */
            line_len = 6;
        }

        if (line_len > 0 && line_buf[line_len - 1] != ' ') {
            line_buf[line_len++] = ' ';
        }
        memcpy(line_buf + line_len, p, word_len);
        line_len += word_len;
        p += word_len;

        while (*p == ' ') p++;
    }

    if (line_len > 0) {
        line_buf[line_len] = '\0';
        add_single_line(line_buf, body_attr);
    }

    screen_scroll_to_bottom();
}

static char s_stream_cur_line[MAX_LINE_COLS + 1];
static int  s_stream_line_len = 0;
static bool s_is_in_code_block = false;

void aichat_stream_start(void)
{
    g_is_streaming = true;
    g_token_count = 0;
    s_stream_line_len = 0;
    s_stream_cur_line[0] = '\0';
    s_is_in_code_block = false;

    /* Add initial header line for Assistant turn */
    add_single_line("[AI]  ", MAKE_ATTR(C_LIGHTCYAN, C_BLUE));
    screen_scroll_to_bottom();
    screen_draw_statusbar("Streaming response from remote LLM...");
}

void aichat_append_token(const char *token)
{
    if (!token || !token[0]) return;
    g_token_count++;

    const char *p = token;
    while (*p) {
        if (*p == '\n') {
            s_stream_cur_line[s_stream_line_len] = '\0';
            uint8_t attr = s_is_in_code_block ? s_theme.text_code : s_theme.text_ai;
            add_single_line(s_stream_cur_line, attr);
            s_stream_line_len = 0;
            s_stream_cur_line[0] = '\0';
            p++;
            continue;
        }

        /* Check code block fence ``` */
        if (s_stream_line_len == 0 && strncmp(p, "```", 3) == 0) {
            s_is_in_code_block = !s_is_in_code_block;
        }

        if (s_stream_line_len >= CHAT_INNER_COLS - 2) {
            s_stream_cur_line[s_stream_line_len] = '\0';
            uint8_t attr = s_is_in_code_block ? s_theme.text_code : s_theme.text_ai;
            add_single_line(s_stream_cur_line, attr);
            s_stream_line_len = 0;
            s_stream_cur_line[0] = '\0';
        }

        s_stream_cur_line[s_stream_line_len++] = *p++;
    }

    /* Live update last line */
    if (s_stream_line_len > 0) {
        s_stream_cur_line[s_stream_line_len] = '\0';
        uint8_t attr = s_is_in_code_block ? s_theme.text_code : s_theme.text_ai;
        if (s_total_lines > 0) {
            strncpy(s_lines[s_total_lines - 1].text, s_stream_cur_line, MAX_LINE_COLS);
            s_lines[s_total_lines - 1].attr = attr;
        }
    }

    screen_draw_chat_area();
    screen_draw_statusbar(NULL);
    flush_screen();
}

void aichat_stream_end(void)
{
    g_is_streaming = false;
    if (s_stream_line_len > 0) {
        s_stream_cur_line[s_stream_line_len] = '\0';
        uint8_t attr = s_is_in_code_block ? s_theme.text_code : s_theme.text_ai;
        add_single_line(s_stream_cur_line, attr);
        s_stream_line_len = 0;
        s_stream_cur_line[0] = '\0';
    }

    aichat_set_status("Ready. Response finished (%lu tokens).", (unsigned long)g_token_count);
    screen_draw_chat_area();
    flush_screen();
}

/* Modal Dialog box utility */
static void draw_modal_dialog(int width, int height, const char *title)
{
    int r1 = (SCREEN_ROWS - height) / 2;
    int c1 = (SCREEN_COLS - width) / 2;
    int r2 = r1 + height - 1;
    int c2 = c1 + width - 1;

    /* Drop shadow on right and bottom */
    for (int r = r1 + 1; r <= r2 + 1 && r < SCREEN_ROWS; r++) {
        for (int c = c1 + 2; c <= c2 + 2 && c < SCREEN_COLS; c++) {
            if (r > r2 || c > c2) {
                uint16_t cur = s_backbuf[r][c];
                uint8_t ch = (uint8_t)(cur & 0xFF);
                s_backbuf[r][c] = ((uint16_t)MAKE_ATTR(C_BLACK, C_BLACK) << 8) | ch;
            }
        }
    }

    /* Fill interior */
    buf_fill_rect(r1, c1, r2, c2, ' ', s_theme.dialog_box);
    buf_draw_box(r1, c1, r2, c2, s_theme.dialog_border, true);

    /* Title header */
    if (title) {
        char t_buf[64];
        snprintf(t_buf, sizeof(t_buf), " %s ", title);
        int t_col = c1 + (width - (int)strlen(t_buf)) / 2;
        buf_puts(r1, t_col, t_buf, s_theme.dialog_hi);
    }
}

void screen_show_help_dialog(void)
{
    draw_modal_dialog(58, 16, "HELP & COMMANDS");
    int r1 = (SCREEN_ROWS - 16) / 2;
    int c1 = (SCREEN_COLS - 58) / 2;

    const char *help_lines[] = {
        "Keyboard Shortcuts:",
        "  F1       - Show this help dialog",
        "  F2       - Choose remote LLM model",
        "  F3       - Switch color theme (Norton, Matrix, Amber, Dark)",
        "  F4       - Clear chat screen & reset conversation",
        "  F5       - Toggle PC Speaker sound on/off",
        "  PgUp/Dn  - Scroll chat history up/down",
        "  Up/Down  - Recall previous prompt history",
        "  ESC      - Quit application",
        "",
        "In-Chat Slash Commands:",
        "  /model <name>  - Switch LLM (gemini-2.5-flash, gpt-4o, etc)",
        "  /clear         - Reset conversation context",
        "  /sys <prompt>  - Set custom system persona",
        "",
        "         Press any key to close this dialog"
    };

    for (int i = 0; i < 15; i++) {
        uint8_t attr = (i == 0 || i == 10) ? s_theme.dialog_hi : s_theme.dialog_box;
        buf_puts(r1 + 1 + i, c1 + 2, help_lines[i], attr);
    }
    flush_screen();
    screen_show_cursor(false);
    getch();
    screen_redraw_all();
}

void screen_show_model_dialog(void)
{
    draw_modal_dialog(52, 14, "SELECT REMOTE LLM MODEL");
    int r1 = (SCREEN_ROWS - 14) / 2;
    int c1 = (SCREEN_COLS - 52) / 2;

    const char *models[] = {
        "1. Google Gemini 2.5 Flash   (Fast & Smart)",
        "2. Google Gemini 2.5 Pro     (Deep Reasoning)",
        "3. OpenAI GPT-4o             (Flagship Multimodal)",
        "4. OpenAI GPT-4o-mini        (Lightweight & Fast)",
        "5. Anthropic Claude 3.5      (Sonnet)",
        "6. Ollama Local LLM          (Offline / Private)",
        "7. Groq Llama-3-70B          (Ultra-low latency)"
    };

    const char *model_ids[] = {
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gpt-4o",
        "gpt-4o-mini",
        "claude-3-5-sonnet",
        "ollama:llama3",
        "groq:llama3-70b"
    };

    for (int i = 0; i < 7; i++) {
        buf_puts(r1 + 2 + i, c1 + 4, models[i], s_theme.dialog_box);
    }

    buf_puts(r1 + 11, c1 + 6, "Press 1-7 to select, or ESC to cancel", s_theme.dialog_hi);
    flush_screen();
    screen_show_cursor(false);

    int ch = getch();
    if (ch >= '1' && ch <= '7') {
        int idx = ch - '1';
        strncpy(g_config.model, model_ids[idx], sizeof(g_config.model) - 1);
        protocol_send_model(g_config.model);
        aichat_set_status("Selected Model: %s", g_config.model);
        sound_click();
    }

    screen_redraw_all();
}

void screen_show_theme_dialog(void)
{
    g_config.theme = (g_config.theme + 1) % THEME_COUNT;
    screen_set_theme(g_config.theme);
    sound_click();
}
