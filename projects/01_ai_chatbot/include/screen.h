#ifndef SCREEN_H
#define SCREEN_H

#include "aichat.h"

/* IBM CP437 Box Drawing Characters */
#define BOX_S_HORIZ     196  /* ─ */
#define BOX_S_VERT      179  /* │ */
#define BOX_S_TOPLEFT   218  /* ┌ */
#define BOX_S_TOPRIGHT  191  /* ┐ */
#define BOX_S_BOTLEFT   192  /* └ */
#define BOX_S_BOTRIGHT  217  /* ┘ */

#define BOX_D_HORIZ     205  /* ═ */
#define BOX_D_VERT      186  /* ║ */
#define BOX_D_TOPLEFT   201  /* ╔ */
#define BOX_D_TOPRIGHT  187  /* ╗ */
#define BOX_D_BOTLEFT   200  /* ╚ */
#define BOX_D_BOTRIGHT  188  /* ╝ */

#define BOX_T_LEFT      195  /* ├ */
#define BOX_T_RIGHT     180  /* ┤ */
#define BOX_DT_LEFT     204  /* ╠ */
#define BOX_DT_RIGHT    185  /* ╣ */

#define CH_BLOCK_FULL   219  /* █ */
#define CH_BLOCK_DARK   178  /* ▓ */
#define CH_BLOCK_MED    177  /* ▒ */
#define CH_BLOCK_LIGHT  176  /* ░ */
#define CH_RADIO_ON     7    /* • */
#define CH_RADIO_OFF    9    /* ○ / tab */
#define CH_TRI_RIGHT    16   /* ► */
#define CH_TRI_LEFT     17   /* ◄ */
#define CH_UP_ARROW     24   /* ↑ */
#define CH_DOWN_ARROW   25   /* ↓ */

/* VGA Text Colors (0..15) */
enum {
    C_BLACK = 0,
    C_BLUE = 1,
    C_GREEN = 2,
    C_CYAN = 3,
    C_RED = 4,
    C_MAGENTA = 5,
    C_BROWN = 6,
    C_LIGHTGRAY = 7,
    C_DARKGRAY = 8,
    C_LIGHTBLUE = 9,
    C_LIGHTGREEN = 10,
    C_LIGHTCYAN = 11,
    C_LIGHTRED = 12,
    C_LIGHTMAGENTA = 13,
    C_YELLOW = 14,
    C_WHITE = 15
};

#define MAKE_ATTR(fg, bg) (((bg) << 4) | ((fg) & 0x0F))

/* Theme color palette structure */
typedef struct {
    uint8_t topbar;         /* Top header title bar */
    uint8_t topbar_badge;   /* Badge in header */
    uint8_t chat_bg;        /* Chat background */
    uint8_t chat_border;    /* Chat frame border */
    uint8_t text_user;      /* User message text */
    uint8_t text_ai;        /* Assistant message text */
    uint8_t text_sys;       /* System notices */
    uint8_t text_err;       /* Errors */
    uint8_t text_code;      /* Code block highlight */
    uint8_t stat_bar;       /* Separator status bar */
    uint8_t stat_alert;     /* Status indicator while busy/streaming */
    uint8_t input_box;      /* Input prompt background & border */
    uint8_t input_text;     /* Input text color */
    uint8_t hotkey_bar;     /* Bottom function key bar */
    uint8_t hotkey_key;     /* Highlight for hotkey labels */
    uint8_t dialog_box;     /* Dialog background and text */
    uint8_t dialog_border;  /* Dialog frame border */
    uint8_t dialog_hi;      /* Dialog selected item / button */
} ThemePalette;

void screen_init(void);
void screen_shutdown(void);
void screen_set_theme(ThemeId theme_id);
void screen_redraw_all(void);

void screen_draw_topbar(void);
void screen_draw_chat_area(void);
void screen_draw_statusbar(const char *status);
void screen_draw_input(const char *input_buffer, int cursor_pos);
void screen_draw_hotkeys(void);

void screen_scroll_chat(int lines);
void screen_scroll_to_bottom(void);

void screen_show_help_dialog(void);
void screen_show_model_dialog(void);
void screen_show_theme_dialog(void);
void screen_show_about_dialog(void);

void screen_set_cursor(int row, int col);
void screen_show_cursor(bool show);

#endif /* SCREEN_H */
