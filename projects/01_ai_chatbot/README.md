# DOS AI Chatbot (Project 01)

An authentic, high-performance MS-DOS software suite connecting vintage 16/32-bit DOS environments to modern frontier AI models (Google Gemini, OpenAI GPT-4o, Anthropic Claude, Ollama, Groq).

---

## 🌟 Highlights & Features

1. **Classic 90s Norton / QuickC TUI (Text User Interface)**
   - High-performance direct video RAM rendering (`0xB8000`) for tear-free, instant 60 FPS graphics.
   - Dual-buffered 80×25 text mode with authentic CP437 double-line boxes and drop shadows.
   - **4 Selectable Retro Themes**:
     - *Norton Blue* (Classic Norton Commander / Turbo Pascal)
     - *Matrix Green* (Phosphor CRT Terminal)
     - *Amber CRT* (1980s Vintage Amber Display)
     - *Cyber Dark* (Sleek Modern Monochrome)
   - Real-time token streaming with live cursor animation.
   - Split-screen layout: Top title & connectivity status, 18-line scrollable chat history with scrollbar, status bar, and interactive prompt input.
   - Markdown rendering: automatic bold formatting, headers, list items, and framed code blocks.
   - Full command/prompt history (Up/Down arrow navigation).

2. **Authentic PC Speaker Sound**
   - Direct 8254 PIT (ports `0x42`/`0x43`) and port `0x61` frequency synthesis.
   - Distinct retro chimes: Startup fanfare, transmission whoosh, soft token typing ticks, completion tone, and error buzz.
   - Instant toggle with `[F5]`.

3. **Frontier AI Model Support**
   - **Google Gemini**: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 Flash.
   - **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo.
   - **Anthropic Claude**: Claude 3.5 Sonnet, Claude 3.5 Haiku.
   - **Ollama**: Local, private offline models (`llama3`, `mistral`, `phi3`, etc.).
   - **Groq / OpenRouter / vLLM / LM Studio**: Custom OpenAI-compatible endpoints.
   - **Offline Retro Persona**: Built-in 90s DOS AI assistant simulation if no API keys are configured, allowing immediate testing out of the box!

4. **Multi-Platform Deployment**
   - **DOSBox Staging**: Out-of-the-box launcher with `nullmodem` serial emulation over TCP.
   - **ESP32 486 Emulator (`e486`)**: Pre-installed on `data/c.img` in `C:\AICHAT\AICHAT.EXE` and executable via `aichat` command in FreeDOS.
   - **Physical Vintage PCs**: Communicates via standard RS-232 serial cable (COM1–COM4) to any Linux PC, Mac, Raspberry Pi, or ESP8266/ESP32 WiFi modem.

---

## 📁 Project Structure

```
projects/01_ai_chatbot/
├── bin/
│   ├── AICHAT.EXE         (Compiled 32-bit protected-mode DOS binary)
│   ├── CWSDPMI.EXE        (CWSDPMI DPMI server)
│   └── AICHAT.INI         (User configuration file)
├── gateway/
│   ├── ai_gateway.py      (Python bridge connecting DOS serial to modern LLMs)
│   └── .env.example       (API key template for Gemini / OpenAI / Anthropic)
├── include/
│   ├── aichat.h           (Main state and declarations)
│   ├── protocol.h         (Serial framing & streaming protocol)
│   ├── screen.h           (TUI drawing, themes, and windows)
│   ├── serial.h           (16550 UART driver)
│   └── sound.h            (PC Speaker audio engine)
├── src/
│   ├── main.c             (Application lifecycle & input loop)
│   ├── protocol.c         (Protocol parser & dispatcher)
│   ├── screen.c           (VGA text buffer & markdown rendering)
│   ├── serial.c           (Hardware UART registers)
│   └── sound.c            (8254 PIT frequency generation)
├── Makefile               (DJGPP cross-compilation script)
├── dosbox_chat.conf       (Preconfigured DOSBox configuration)
├── run_dosbox.sh          (Single-command launcher)
└── README.md              (This documentation)
```

---

## 🚀 Quick Start (Running in DOSBox)

1. **Run the one-step launcher**:
   ```bash
   cd /home/jandej/Private/e486/projects/01_ai_chatbot
   ./run_dosbox.sh
   ```
   *The launcher automatically compiles the DOS executable, starts the local AI Gateway in the background, and boots DOSBox connected to the AI bridge!*

2. **Configure API Keys (Optional)**:
   By default, the gateway operates in **Retro AI Simulation mode** so you can chat right away without keys.
   To connect to live frontier models:
   ```bash
   export GEMINI_API_KEY="your-gemini-key"
   # or
   export OPENAI_API_KEY="your-openai-key"
   ```
   Then relaunch `./run_dosbox.sh`.

---

## ⌨️ Controls & Shortcuts

| Key | Action |
| :--- | :--- |
| **`[F1]`** | Show Help & Commands dialog |
| **`[F2]`** | Model Selector (Gemini, GPT-4o, Claude, Ollama, Groq) |
| **`[F3]`** | Cycle Color Themes (Norton, Matrix, Amber, Dark) |
| **`[F4]`** | Clear screen & reset conversation context |
| **`[F5]`** | Toggle PC Speaker sound on/off |
| **`[PgUp]` / `[PgDn]`** | Scroll chat history up/down |
| **`[Up]` / `[Down]`** | Recall previous prompt history |
| **`[Enter]`** | Submit prompt to AI |
| **`[ESC]`** | Cancel active streaming generation / Quit |

### In-Chat Slash Commands
- `/model <name>`: Switch active LLM (e.g. `/model gemini-2.5-flash` or `/model gpt-4o`)
- `/clear`: Clear screen and reset conversation history on gateway
- `/sys <prompt>`: Change system persona (e.g. `/sys You are a sarcastic 1980s BBS sysop`)
- `/help`: Display in-game help menu
- `/quit` or `/exit`: Exit to DOS prompt

---

## 🔨 Building from Source

To rebuild `AICHAT.EXE`:
```bash
make clean
make
```
*(Uses the bundled DJGPP cross-compiler toolchain targeting 32-bit x86 DPMI)*.
