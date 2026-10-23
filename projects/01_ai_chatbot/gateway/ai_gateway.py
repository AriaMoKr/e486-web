#!/usr/bin/env python3
"""
DOS AI Chatbot - Remote LLM Gateway Bridge
=========================================
Bridges MS-DOS serial communication (COM1/nullmodem/TCP) to modern remote LLMs:
- Google Gemini (Gemini 2.5 Flash, 2.5 Pro, 1.5 Flash)
- OpenAI (GPT-4o, GPT-4o-mini, GPT-3.5-turbo)
- Anthropic Claude (Claude 3.5 Sonnet, Claude 3.5 Haiku)
- Ollama (Local offline models: llama3, mistral, phi3, qwen)
- Groq / OpenRouter / Custom OpenAI-compatible endpoints
- Built-in Retro DOS Persona (runs offline with zero API keys required)
"""

import sys
import os
import time
import json
import socket
import argparse
import threading
import urllib.request
import urllib.error

# Default configuration
DEFAULT_TCP_HOST = "127.0.0.1"
DEFAULT_TCP_PORT = 5000
DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful, knowledgeable AI assistant running on a retro MS-DOS PC in the 1990s. "
    "Keep answers concise, engaging, and clear. Format output using clean text suitable for "
    "an 80x25 character screen. Use short code snippets when requested."
)

class LLMBridge:
    def __init__(self, args):
        self.args = args
        self.active_model = args.model
        self.system_prompt = args.system_prompt
        self.conversation_history = []
        self.gemini_key = args.gemini_key or os.environ.get("GEMINI_API_KEY", "")
        self.openai_key = args.openai_key or os.environ.get("OPENAI_API_KEY", "")
        self.anthropic_key = args.anthropic_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.ollama_url = args.ollama_url or os.environ.get("OLLAMA_URL", "http://localhost:11434")
        self.openai_base = args.openai_base or os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

    def reset_history(self):
        self.conversation_history = []

    def set_system_prompt(self, prompt):
        self.system_prompt = prompt

    def stream_query(self, user_msg, send_fn):
        """Dispatches query to appropriate backend and yields tokens via send_fn."""
        self.conversation_history.append({"role": "user", "content": user_msg})
        model = self.active_model.lower()

        # Check for Gemini
        if "gemini" in model:
            if self.gemini_key:
                self._stream_gemini(user_msg, send_fn)
            else:
                self._stream_mock(user_msg, send_fn, note="Gemini API key not set. Using Retro Simulation.")

        # Check for Ollama
        elif model.startswith("ollama:") or model in ("llama3", "mistral", "phi3", "qwen"):
            actual_model = model.replace("ollama:", "")
            self._stream_ollama(actual_model, send_fn)

        # Check for Anthropic Claude
        elif "claude" in model:
            if self.anthropic_key:
                self._stream_anthropic(send_fn)
            else:
                self._stream_mock(user_msg, send_fn, note="Anthropic API key not set. Using Retro Simulation.")

        # Check for OpenAI or OpenAI-compatible
        elif any(k in model for k in ("gpt", "groq", "deepseek", "openai")):
            if self.openai_key or "localhost" in self.openai_base:
                self._stream_openai_compatible(send_fn)
            else:
                self._stream_mock(user_msg, send_fn, note="OpenAI API key not set. Using Retro Simulation.")

        # Default fallback
        else:
            if self.gemini_key:
                self._stream_gemini(user_msg, send_fn)
            elif self.openai_key:
                self._stream_openai_compatible(send_fn)
            else:
                self._stream_mock(user_msg, send_fn)

    def _stream_gemini(self, user_msg, send_fn):
        """Google Gemini API via streaming SSE REST."""
        send_fn("STAT:Connecting to Google Gemini API...\n")
        model = self.active_model
        if ":" in model:
            model = model.split(":", 1)[1]
        if not model.startswith("gemini"):
            model = "gemini-2.5-flash"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={self.gemini_key}"
        
        # Build contents from history
        contents = []
        for turn in self.conversation_history[-10:]:
            role = "user" if turn["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": turn["content"]}]
            })

        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": self.system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        full_response = []
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_json = line_str[6:].strip()
                        if not data_json:
                            continue
                        try:
                            obj = json.loads(data_json)
                            candidates = obj.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for p in parts:
                                    text = p.get("text", "")
                                    if text:
                                        full_response.append(text)
                                        send_fn(f"TOK:{text}\n")
                        except Exception:
                            pass
            send_fn("DONE\n")
            self.conversation_history.append({"role": "assistant", "content": "".join(full_response)})
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            send_fn(f"ERR:Gemini HTTP {e.code}: {err_body[:100]}\n")
            send_fn("DONE\n")
        except Exception as e:
            send_fn(f"ERR:Gemini error: {str(e)[:100]}\n")
            send_fn("DONE\n")

    def _stream_openai_compatible(self, send_fn):
        """OpenAI-compatible streaming API."""
        send_fn("STAT:Connecting to OpenAI-compatible endpoint...\n")
        url = f"{self.openai_base.rstrip('/')}/chat/completions"
        
        messages = [{"role": "system", "content": self.system_prompt}]
        for turn in self.conversation_history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

        payload = {
            "model": self.active_model,
            "messages": messages,
            "stream": True,
            "temperature": 0.7
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.openai_key}"
            }
        )

        full_response = []
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        data_val = line_str[6:].strip()
                        if data_val == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_val)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_response.append(content)
                                send_fn(f"TOK:{content}\n")
                        except Exception:
                            pass
            send_fn("DONE\n")
            self.conversation_history.append({"role": "assistant", "content": "".join(full_response)})
        except Exception as e:
            send_fn(f"ERR:OpenAI error: {str(e)[:100]}\n")
            send_fn("DONE\n")

    def _stream_anthropic(self, send_fn):
        """Anthropic Claude streaming API."""
        send_fn("STAT:Connecting to Anthropic Claude...\n")
        url = "https://api.anthropic.com/v1/messages"
        
        messages = []
        for turn in self.conversation_history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

        payload = {
            "model": "claude-3-5-sonnet-20241022",
            "system": self.system_prompt,
            "messages": messages,
            "stream": True,
            "max_tokens": 1024
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.anthropic_key,
                "anthropic-version": "2023-06-01"
            }
        )

        full_response = []
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        chunk = json.loads(line_str[6:])
                        if chunk.get("type") == "content_block_delta":
                            text = chunk.get("delta", {}).get("text", "")
                            if text:
                                full_response.append(text)
                                send_fn(f"TOK:{text}\n")
            send_fn("DONE\n")
            self.conversation_history.append({"role": "assistant", "content": "".join(full_response)})
        except Exception as e:
            send_fn(f"ERR:Anthropic error: {str(e)[:100]}\n")
            send_fn("DONE\n")

    def _stream_ollama(self, model_name, send_fn):
        """Ollama local model streaming."""
        send_fn(f"STAT:Querying local Ollama model ({model_name})...\n")
        url = f"{self.ollama_url.rstrip('/')}/api/chat"
        
        messages = [{"role": "system", "content": self.system_prompt}]
        for turn in self.conversation_history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

        payload = {
            "model": model_name or "llama3",
            "messages": messages,
            "stream": True
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        full_response = []
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    if line:
                        chunk = json.loads(line.decode("utf-8"))
                        msg = chunk.get("message", {})
                        content = msg.get("content", "")
                        if content:
                            full_response.append(content)
                            send_fn(f"TOK:{content}\n")
            send_fn("DONE\n")
            self.conversation_history.append({"role": "assistant", "content": "".join(full_response)})
        except Exception as e:
            send_fn(f"ERR:Ollama error: {str(e)[:100]}\n")
            send_fn("DONE\n")

    def _stream_mock(self, user_msg, send_fn, note=None):
        """Built-in Retro DOS AI Persona simulation for testing without API keys."""
        send_fn("STAT:Processing on Local Retro Engine...\n")
        time.sleep(0.1)

        sim_intro = ""
        if note:
            sim_intro = f"[{note}]\n\n"

        prompt_lower = user_msg.lower()
        if "hello" in prompt_lower or "hi" in prompt_lower:
            reply = (
                f"{sim_intro}Greetings, DOS traveler! Welcome to 1994 computing with 2026 intelligence. "
                "I am your retro AI companion running through a high-speed serial gateway. "
                "How may I assist you with your 486 system today?"
            )
        elif "doom" in prompt_lower:
            reply = (
                f"{sim_intro}Ah, DOOM! Id Software's masterpiece released in December 1993. "
                "Running in 320x200 Mode 13h via the DOS/4GW protected-mode extender. "
                "Remember: IDDQD for Degreelessness Mode, IDKFA for Very Happy Ammo, and watch out for the Cyberdemon!"
            )
        elif "c" in prompt_lower or "code" in prompt_lower or "c++" in prompt_lower:
            reply = (
                f"{sim_intro}Here is a classic C snippet for direct video memory in DOS:\n"
                "```c\n"
                "/* Write directly to VGA text buffer */\n"
                "unsigned short *vram = (unsigned short *)0xB8000;\n"
                "vram[0] = (0x1F << 8) | 'A'; /* White on Blue 'A' */\n"
                "```\n"
                "Compiled with DJGPP GCC 32-bit DPMI or Turbo C++ 3.0!"
            )
        else:
            reply = (
                f"{sim_intro}Regarding \"{user_msg}\":\n\n"
                "From a DOS perspective, information is stored in 640KB conventional memory, "
                "buffered through our 16550 UART FIFO, and streamed in real-time across the serial bus! "
                "Configure GEMINI_API_KEY or OPENAI_API_KEY in your environment to connect directly to frontier LLMs."
            )

        # Stream out in realistic retro typing chunks
        words = reply.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            send_fn(f"TOK:{chunk}\n")
            time.sleep(0.02)

        send_fn("DONE\n")
        self.conversation_history.append({"role": "assistant", "content": reply})


def handle_client_connection(sock, bridge):
    """Handles an incoming connection from DOSBox nullmodem or network."""
    print("[Gateway] Client connected!")
    
    def send_to_client(data):
        try:
            sock.sendall(data.encode("utf-8"))
        except Exception as e:
            print(f"[Gateway] Send error: {e}")

    # Send initial greeting
    send_to_client("PONG\n")
    send_to_client(f"MODEL:{bridge.active_model}\n")

    buf = ""
    while True:
        try:
            data = sock.recv(1024)
            if not data:
                break
            buf += data.decode("utf-8", errors="replace")
            
            while "\n" in buf or "\x03" in buf:
                # Find delimiter
                idx_n = buf.find("\n")
                idx_etx = buf.find("\x03")
                if idx_n != -1 and (idx_etx == -1 or idx_n < idx_etx):
                    delim_idx = idx_n
                else:
                    delim_idx = idx_etx

                line = buf[:delim_idx].strip("\r\n\x02\x03 ")
                buf = buf[delim_idx + 1:]

                if not line:
                    continue

                print(f"[DOS -> Gateway] {line}")

                if line == "PING":
                    send_to_client("PONG\n")
                elif line.startswith("MSG:"):
                    user_msg = line[4:].strip()
                    bridge.stream_query(user_msg, send_to_client)
                elif line.startswith("CMD:MODEL "):
                    new_model = line[10:].strip()
                    bridge.active_model = new_model
                    print(f"[Gateway] Active model changed to: {new_model}")
                    send_to_client(f"MODEL:{new_model}\n")
                elif line == "CMD:RESET":
                    bridge.reset_history()
                    print("[Gateway] Conversation history cleared.")
                    send_to_client("STAT:History reset\n")
                elif line.startswith("CMD:SYS "):
                    new_sys = line[8:].strip()
                    bridge.set_system_prompt(new_sys)
                    print(f"[Gateway] System persona updated: {new_sys[:50]}...")
                    send_to_client("STAT:System persona updated\n")
        except Exception as e:
            print(f"[Gateway] Connection exception: {e}")
            break

    print("[Gateway] Client disconnected.")
    try:
        sock.close()
    except Exception:
        pass


def run_tcp_server(bridge, host, port):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen(1)
    print(f"=======================================================")
    print(f" DOS AI Gateway Server listening on {host}:{port}")
    print(f" Default Model: {bridge.active_model}")
    print(f" Ready for DOSBox 'serial1=nullmodem port:{port}'")
    print(f"=======================================================")

    while True:
        try:
            client_sock, client_addr = server.accept()
            print(f"[Gateway] Accepted connection from {client_addr}")
            t = threading.Thread(target=handle_client_connection, args=(client_sock, bridge), daemon=True)
            t.start()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            break
        except Exception as e:
            print(f"[Gateway] Accept error: {e}")


def main():
    parser = argparse.ArgumentParser(description="DOS AI Chatbot Gateway Bridge")
    parser.add_argument("--host", default=DEFAULT_TCP_HOST, help="TCP listen host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_TCP_PORT, help="TCP listen port (default: 5000)")
    parser.add_argument("--model", default="gemini-2.5-flash", help="Default LLM model name")
    parser.add_argument("--gemini-key", default=None, help="Google Gemini API key")
    parser.add_argument("--openai-key", default=None, help="OpenAI API key")
    parser.add_argument("--anthropic-key", default=None, help="Anthropic API key")
    parser.add_argument("--ollama-url", default=None, help="Ollama server URL")
    parser.add_argument("--openai-base", default=None, help="Custom OpenAI-compatible base URL")
    parser.add_argument("--system-prompt", default=DEFAULT_SYSTEM_PROMPT, help="Default system prompt")

    args = parser.parse_args()
    bridge = LLMBridge(args)
    run_tcp_server(bridge, args.host, args.port)


if __name__ == "__main__":
    main()
