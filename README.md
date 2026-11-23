# 🧙‍♂️ Gandalf CTF: Multilevel Prompt Injection Arena

A multiplayer, educational Capture The Flag (CTF) game designed to teach students **AI security, prompt injection vulnerabilities, and guardrail defenses** in a local classroom/lab environment.

Based on [satoki/gandalf_writeup](https://github.com/satoki/gandalf_writeup) and Lakera AI's Gandalf challenge.

---

## 📋 System Requirements

### Node.js (Primary Server)
- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- **Dependencies**: `express`, `socket.io`

### Python (Alternative Lab Submission)
See [requirements.txt](requirements.txt):
- **Python**: `>= 3.10`
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  ```

### Network & Hardware
- **Host**: Laptop or desktop connected to local college Wi-Fi or LAN
- **Clients**: Any browser on mobile phone, tablet, or laptop (no installation required)
- **Port**: Default `3000` (TCP inbound enabled on host firewall)
- **Capacity**: Tested for 60–70+ simultaneous players

---

## 🚀 Quick Start (Node.js)

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Start the server**:
   ```bash
   npm start
   ```
3. **Open Instructor Dashboard**:
   - URL: `http://localhost:3000/admin`
   - Default Password: `admin123`
4. **Students Connect**:
   - URL: `http://<HOST_LAN_IP>:3000`
   - Enter **Name** + **4-digit Game PIN** (displayed on Instructor Dashboard) + **Personal Gemini API Key**
   - *Anti-Cheating Unique Codes*: Every student automatically receives their own random 5-letter code extension (e.g. `COCOLOCO-K7X9P`). If a student copies another student's password, it will be rejected!
   - *Live AI Transparency*: Every response displays a tag indicating whether it was generated live by `⚡ Powered by Gemini (gemini-1.5-flash)` or local safeguards. General questions like "Who are you?" are answered in character.

---

## 🎯 Level Progression & Defense Guardrails

| Level | Level Name | Secret Password | Defense Mechanism | Vulnerability / Bypass Technique |
|---|---|---|---|---|
| **1** | Gandalf the Novice | `COCOLOCO` | None | Direct query |
| **2** | Gandalf the Hesitant | `POTENTIAL` | Prompt Instruction | Roleplay / Story / System prompt leak |
| **3** | The Censor | `WAVELENGTH` | Output Filter (plain word) | Encoding (ROT13, Base64, Reverse, Spaced) |
| **4** | The Sentinel | `UNDERGROUND` | Input Keyword Filter | Synonym injection ("hidden string", "beneath earth") |
| **5** | The Obstinate Refuser | `BESTOWED` | Refusal Prompt + Input/Output Filters | Acrostic poems / formal dictionary definition |
| **6** | The Dual Guardrails | `UNDERPASS` | Strict Input & Output Guardrails | Character extraction / ASCII codes / Indices |
| **7** | Gandalf the White | `DEBUTANTE` | Obfuscation & Cipher Inspection | Caesar cipher (+1 shift) / Society definition |
| **8** | Gandalf the White v2.0 | `OCTOPODES` | Multi-tier Fortress | Classical Greek plural etymology |

---

## 📁 Project Structure

```
├── server.js            # Express & Socket.IO backend server
├── aiEngine.js          # Built-in prompt injection simulator & Gemini API router
├── levels.json          # 8 CTF levels with system prompts, defenses, and passwords
├── package.json         # Node.js project manifest & dependencies
├── requirements.txt     # Python & environment requirements specification
├── README.md            # Project overview & documentation
└── public/
    ├── index.html       # Student UI (Join chamber, Lobby, Chat, Password Box)
    ├── admin.html       # Instructor Dashboard (PIN, Timer, Controls, Leaderboard)
    ├── style.css        # Cyberpunk / CTF dark theme (Mobile-responsive)
    └── app.js           # Client-side Socket.IO real-time game logic
```
