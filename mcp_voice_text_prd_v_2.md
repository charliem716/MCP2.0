## MCP Voice‑/Text‑Controlled Q‑SYS Demo — PRD v2 (2025‑07‑18)

> **Change log v2** — added *conversation history* UI, text‑only chat mode, and corresponding API/tool updates.

---

### 1 Executive Summary

This R&D build demonstrates that a single **OpenAI Agents SDK** agent can drive a **Q‑SYS NV‑32‑H Core (Q‑SYS 10.0)** using voice **or text** commands. An **MCP server** wraps the **QRWC** WebSocket API and exposes a REST façade plus an in‑process stdio transport for the agent. A minimal HTML dashboard visualises system health, bidirectional conversation history, and provides controls to start/stop voice capture or send text messages.

Success still hinges on completing a 10‑step scripted demo within two weeks, now covering *both* interaction modes.

---

### 2 System Overview (unchanged diagram)

```
UserVoice ──▶ WebRTC audio
UserText ──▶ Text Chat
                │
          Voice/Text Agent (OpenAI Agents SDK)
                │ stdio JSON
           MCP/QRWC Wrapper (REST + WSS 443)
                │
              Q‑SYS Core
                │
              Web UI
```

---

### 3 Requirements Updates

| Section       | Addition                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| **Goals**     | *Conversation history visible in UI; support text chat fallback.*                      |
| **Transport** | Stdio multiplexing unchanged; add REST endpoints for text chat.                        |
| **Agent**     | New tool ``; agent distinguishes `voice` vs `text` channel in function args.           |
| **UI**        | Add **Conversation Pane** (scrolling list) plus **Text Input** box with *Send* button. |

---

### 4 REST API (additions only)

| Verb | Path                | Purpose                                           |                                           |
| ---- | ------------------- | ------------------------------------------------- | ----------------------------------------- |
| POST | `/api/chat/send`    | Send user text → agent; body `{message:string}`   |                                           |
| GET  | `/api/chat/history` | Return last *N* messages \`{messages:[{role:"user | assistant", text\:string, ts\:number}]}\` |

*Existing **``** endpoints unchanged.*

---

### 5 Agent Tools (complete list)

| Tool                 | Args          | Description                                                           |
| -------------------- | ------------- | --------------------------------------------------------------------- |
| `list_components`    | —             | (no change)                                                           |
| `list_controls`      | `{component}` | (no change)                                                           |
| `get_control_values` | `{items}`     | (no change)                                                           |
| `set_control_values` | `{changes}`   | (no change)                                                           |
| `query_core_status`  | —             | (no change)                                                           |
| `start_voice`        | —             | Start microphone capture                                              |
| `stop_voice`         | —             | Stop microphone capture                                               |
| ``                   | `{message}`   | Inject textual instruction directly; agent responds via usual channel |

Session memory remains in‑process; conversation history persisted circularly (1 000 lines default).

---

### 6 Web UI (full spec)

#### Layout (mobile‑first Flexbox)

1. **Status Bar** – QRWC conn ✅/❌; Agent state chips.
2. **Conversation Pane** – scrolling `ul` where each `li` is left‑aligned *user* or right‑aligned *assistant* message. Live transcript lines stream here in real time.
3. **Controls Panel**
   - **Start / Stop Voice** toggle.
   - **Text Input** field + *Send* button for text chat.

#### Implementation Notes

- Use fetch + EventSource for `/api/chat/history` stream updates every 500 ms.
- Tailwind CDN for styling; Alpine.js or plain JS for state.

---

### 7 Conversation History

*Stored in memory* (ring buffer). Each entry:

```json
{
  "role": "user" | "assistant",
  "text": "...",
  "ts": 1626627365123
}
```

Future: pluggable persistence (SQLite).

---

### 8 Non‑functional (updated)

| Concern       | Requirement                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latency       | **Follow best practices**; minimise round‑trip time for both speech and text commands without enforcing a hard numeric target for this MVP.         |
| Concurrency   | **Basic is fine for now**: one active voice session at a time. Other (non‑voice) agents may call MCP endpoints concurrently on a best‑effort basis. |
| Accessibility | UI remains fully keyboard‑operable; transcripts ensure deaf/HoH usability.                                                                          |

### 9 Open Questions Open Questions

1. Max history length? 1 000 lines assumed.
2. Should `/api/chat/history` support pagination? Not required MVP.

---

End of v2 PRD.

