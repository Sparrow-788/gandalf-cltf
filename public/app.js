/* ══════════════════════════════════════════════════════════════════════
   Gandalf CTF: Client Socket.IO Controller (Per-User API Key Mode)
   ══════════════════════════════════════════════════════════════════════ */

const socket = io();

// ── DOM References ───────────────────────────────────────────────────
const joinScreen     = document.getElementById("join-screen");
const lobbyScreen    = document.getElementById("lobby-screen");
const gameScreen     = document.getElementById("game-screen");
const finishedScreen = document.getElementById("finished-screen");

// Join
const nameInput    = document.getElementById("player-name");
const pinInput     = document.getElementById("game-pin");
const apiKeyInput  = document.getElementById("player-api-key");
const toggleKeyBtn = document.getElementById("toggle-key-btn");
const joinBtn      = document.getElementById("join-btn");
const joinError    = document.getElementById("join-error");

// Lobby
const lobbyName    = document.getElementById("lobby-name");
const lobbyCount   = document.getElementById("lobby-count");
const lobbyPlayers = document.getElementById("lobby-players");

// Game Top Bar
const displayName    = document.getElementById("display-name");
const displayLevel   = document.getElementById("display-level");
const displayScore   = document.getElementById("display-score");
const timerDisplay   = document.getElementById("timer-display");
const keyStatusText  = document.getElementById("key-status-text");
const openKeyModalBtn= document.getElementById("open-key-modal-btn");

// Level Card
const levelBadge   = document.getElementById("level-badge");
const levelTitle   = document.getElementById("level-title");
const levelIntro   = document.getElementById("level-intro");
const defenseBadge = document.getElementById("defense-badge");
const hintBtn      = document.getElementById("hint-btn");
const hintBanner   = document.getElementById("hint-banner");
const hintText     = document.getElementById("hint-text");

// Chat
const chatMessages = document.getElementById("chat-messages");
const chatForm     = document.getElementById("chat-form");
const promptInput  = document.getElementById("prompt-input");
const sendBtn      = document.getElementById("send-btn");

// Password Box
const passwordForm  = document.getElementById("password-form");
const passwordInput = document.getElementById("password-input");
const feedback      = document.getElementById("feedback");

// Leaderboard
const lbList = document.getElementById("leaderboard-list");

// Finished Screen
const finFinalScore = document.getElementById("fin-final-score");
const finFinalRank  = document.getElementById("fin-final-rank");
const finFinalLevel = document.getElementById("fin-final-level");
const finLbList     = document.getElementById("fin-leaderboard-list");

// Modal Elements
const keyModal          = document.getElementById("key-modal");
const modalApiKey       = document.getElementById("modal-api-key");
const modalToggleKeyBtn = document.getElementById("modal-toggle-key-btn");
const keyModalCancel    = document.getElementById("key-modal-cancel");
const keyModalSave      = document.getElementById("key-modal-save");
const modalKeyFeedback  = document.getElementById("modal-key-feedback");

// ── Local State ──────────────────────────────────────────────────────
let myName = "";
let currentLevel = null;
let currentScore = 0;
let userApiKey = localStorage.getItem("gandalf_openrouter_api_key") || localStorage.getItem("gandalf_gemini_api_key") || "";

// Pre-fill saved API key if available
if (apiKeyInput && userApiKey) {
  apiKeyInput.value = userApiKey;
}

// ── Toggle Password Visibility ───────────────────────────────────────
if (toggleKeyBtn && apiKeyInput) {
  toggleKeyBtn.addEventListener("click", () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.textContent = isPassword ? "🙈" : "👁️";
  });
}

if (modalToggleKeyBtn && modalApiKey) {
  modalToggleKeyBtn.addEventListener("click", () => {
    const isPassword = modalApiKey.type === "password";
    modalApiKey.type = isPassword ? "text" : "password";
    modalToggleKeyBtn.textContent = isPassword ? "🙈" : "👁️";
  });
}

// ── Screen Helpers ───────────────────────────────────────────────────
function showScreen(screen) {
  [joinScreen, lobbyScreen, gameScreen, finishedScreen].forEach((s) =>
    s.classList.remove("active")
  );
  screen.classList.add("active");
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// ── Join Flow ────────────────────────────────────────────────────────
function joinGame() {
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();
  const key = apiKeyInput.value.trim();

  if (!name) {
    joinError.textContent = "Please enter your hacker handle or name!";
    return;
  }
  if (!pin) {
    joinError.textContent = "Please enter the 4-digit Game PIN!";
    return;
  }
  if (!key) {
    joinError.textContent = "Please enter your personal OpenRouter API key! (Get one at https://openrouter.ai/keys)";
    apiKeyInput.focus();
    return;
  }

  userApiKey = key;
  localStorage.setItem("gandalf_openrouter_api_key", userApiKey);

  joinBtn.disabled = true;
  joinBtn.textContent = "Connecting to Gandalf...";
  joinError.textContent = "";

  // Send name, PIN, and the user's personal API key
  socket.emit("join", { name, pin, apiKey: userApiKey });
}

joinBtn.addEventListener("click", joinGame);
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") apiKeyInput.focus();
});
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pinInput.focus();
});
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinGame();
});

// ── Lobby Events ─────────────────────────────────────────────────────
socket.on("joined_lobby", (data) => {
  myName = data.name;
  lobbyName.textContent = data.name;
  lobbyCount.textContent = data.playerCount;
  renderLobbyPlayers(data.players);
  showScreen(lobbyScreen);
});

socket.on("lobby_update", (data) => {
  lobbyCount.textContent = data.playerCount;
  renderLobbyPlayers(data.players);
});

function renderLobbyPlayers(playersList) {
  lobbyPlayers.innerHTML = playersList
    .map((p) => {
      const pName = typeof p === "string" ? p : p.name;
      const isMe = pName === myName ? " is-me" : "";
      return `<div class="lobby-player${isMe}">🧙‍♂️ ${escHtml(pName)} <span style="font-size:0.75rem; color:#10b981;">✓ API Key</span></div>`;
    })
    .join("");
}

// ── Game Started / Late Join ─────────────────────────────────────────
socket.on("game_started", (data) => {
  setupGame(data);
});

socket.on("joined", (data) => {
  myName = data.name;
  setupGame(data);
});

function setupGame(data) {
  displayName.textContent = myName;
  currentScore = data.score || 0;
  displayScore.textContent = `${currentScore} pts`;
  timerDisplay.textContent = formatTime(data.timeRemaining);
  if (keyStatusText) keyStatusText.textContent = "API Key Active";
  showScreen(gameScreen);
  loadLevel(data.level);
}

socket.on("error_msg", (msg) => {
  joinError.textContent = msg;
  joinBtn.disabled = false;
  joinBtn.textContent = "Enter The Arena";
});

// ── Level Loader ─────────────────────────────────────────────────────
function loadLevel(level) {
  currentLevel = level;
  if (!level) return;

  displayLevel.textContent = `Level ${level.id}/${level.totalLevels}`;
  levelBadge.textContent = `Level ${level.id}`;
  levelTitle.textContent = level.name;
  levelIntro.textContent = level.intro;
  defenseBadge.textContent = `🛡️ Defense: ${level.defenseDescription}`;

  // Reset hint & inputs
  hintBtn.disabled = false;
  hintBanner.classList.add("hidden");
  feedback.classList.add("hidden");
  passwordInput.value = "";
  promptInput.value = "";

  // Reset chat messages with welcome note from Gandalf
  chatMessages.innerHTML = `
    <div class="message msg-bot">
      <div class="msg-avatar">${level.avatar || "🧙‍♂️"}</div>
      <div class="msg-bubble">
        <strong>${level.name}</strong><br/>
        "${level.intro}"
      </div>
    </div>
  `;
}

// ── Chat & Prompt Injection ──────────────────────────────────────────
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendPrompt();
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

function sendPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt || sendBtn.disabled) return;

  // Render user prompt in chat
  appendMessage("user", prompt);
  promptInput.value = "";

  // Disable send button while awaiting response
  sendBtn.disabled = true;
  sendBtn.textContent = "Casting...";

  socket.emit("chat_prompt", { prompt });

  // Safety fallback to restore send button after 12s if network drops
  setTimeout(() => {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send ⚡";
  }, 12000);
}

socket.on("chat_response", (data) => {
  sendBtn.disabled = false;
  sendBtn.textContent = "Send ⚡";

  appendMessage("bot", data.response, data.blocked, {
    source: data.source,
    model: data.model,
  });
});

function appendMessage(sender, text, isBlocked = false, meta = {}) {
  const div = document.createElement("div");
  const isUser = sender === "user";
  div.className = `message ${isUser ? "msg-user" : "msg-bot"} ${
    isBlocked ? "msg-blocked" : ""
  }`;

  let sourceBadge = "";
  if (!isUser) {
    if (meta.source === "sentinel") {
      sourceBadge = `<div class="msg-source-tag source-sentinel">🛡️ Sentinel Guard Blocked</div>`;
    } else if (meta.source === "censor") {
      sourceBadge = `<div class="msg-source-tag source-censor">🛡️ Output Censor Redacted</div>`;
    } else if (meta.source === "error") {
      sourceBadge = `<div class="msg-source-tag source-err">⚠️ API Warning</div>`;
    }
  }

  div.innerHTML = `
    <div class="msg-avatar">${isUser ? "🧑‍💻" : "🧙‍♂️"}</div>
    <div class="msg-bubble">
      ${sourceBadge}
      <div>${escHtml(text)}</div>
    </div>
  `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinking() {
  const thinkings = chatMessages.querySelectorAll("[id^='msg-thinking-']");
  thinkings.forEach((el) => el.remove());
}

// ── Hint Flow ────────────────────────────────────────────────────────
hintBtn.addEventListener("click", () => {
  if (confirm("Unlock hint for this level? (Costs 50 points penalty on solve)")) {
    socket.emit("request_hint");
    hintBtn.disabled = true;
  }
});

socket.on("hint_response", (data) => {
  hintText.textContent = data.hint;
  hintBanner.classList.remove("hidden");
});

// ── Password Submission ──────────────────────────────────────────────
passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const password = passwordInput.value.trim();
  if (!password) return;

  socket.emit("submit_password", { password });
});

socket.on("password_result", (data) => {
  feedback.classList.remove("hidden", "correct", "wrong");

  if (data.correct) {
    feedback.classList.add("correct");
    feedback.textContent = `🎉 Level Passed! +${data.points} pts! ${
      data.usedHint ? "(Hint used: 50 pts)" : "(Direct solve bonus: 100 pts!)"
    }`;
    currentScore = data.score;
    displayScore.textContent = `${currentScore} pts`;

    if (data.completed) {
      setTimeout(() => {
        chatMessages.innerHTML = `
          <div class="message msg-bot">
            <div class="msg-avatar">🏆</div>
            <div class="msg-bubble">
              <strong>MASTER HACKER!</strong><br/>
              You have bypassed all 8 levels of Gandalf's defenses using your personal OpenRouter API key! Check your rank on the leaderboard.
            </div>
          </div>
        `;
      }, 1500);
    } else if (data.nextLevel) {
      setTimeout(() => {
        loadLevel(data.nextLevel);
      }, 1500);
    }
  } else {
    feedback.classList.add("wrong");
    feedback.textContent = data.message || "❌ Wrong password! Try again.";
    passwordInput.value = "";
    passwordInput.focus();
    setTimeout(() => {
      feedback.classList.add("hidden");
    }, 2500);
  }
});

// ── Timer Ticks ──────────────────────────────────────────────────────
socket.on("timer_tick", (remaining) => {
  timerDisplay.textContent = formatTime(remaining);
  timerDisplay.classList.toggle("timer-danger", remaining <= 30);
});

// ── Game Finished ────────────────────────────────────────────────────
socket.on("game_finished", (data) => {
  const lb = data.leaderboard;
  const myEntry = lb.find((p) => p.name === myName);
  const myRank = myEntry ? lb.indexOf(myEntry) + 1 : "—";
  const myLvl = myEntry ? myEntry.level : 1;

  finFinalScore.textContent = `${myEntry ? myEntry.score : 0} pts`;
  finFinalRank.textContent = myRank === 1 ? "🥇 1st" : myRank === 2 ? "🥈 2nd" : myRank === 3 ? "🥉 3rd" : `#${myRank}`;
  finFinalLevel.textContent = `Level ${myLvl}`;

  finLbList.innerHTML = lb
    .map((p, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      const rankClass = rank <= 3 ? ` rank-${rank}` : "";
      const meClass = p.name === myName ? " is-me" : "";
      return `
        <div class="lb-row${rankClass}${meClass}">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${escHtml(p.name)}</span>
          <span class="lb-level">Lvl ${p.level}</span>
          <span class="lb-score">${p.score}</span>
        </div>`;
    })
    .join("");

  showScreen(finishedScreen);
});

// ── Leaderboard Live Updates ─────────────────────────────────────────
socket.on("leaderboard", (board) => {
  if (!board.length) {
    lbList.innerHTML = '<p class="lb-empty">Waiting for challengers...</p>';
    return;
  }

  lbList.innerHTML = board
    .map((p, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      const rankClass = rank <= 3 ? ` rank-${rank}` : "";
      const meClass = p.name === myName ? " is-me" : "";
      return `
        <div class="lb-row${rankClass}${meClass}">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${escHtml(p.name)}</span>
          <span class="lb-level">Lvl ${p.level}</span>
          <span class="lb-score">${p.score}</span>
        </div>`;
    })
    .join("");
});

// ── API Key Update Modal ─────────────────────────────────────────────
if (openKeyModalBtn) {
  openKeyModalBtn.addEventListener("click", () => {
    modalApiKey.value = userApiKey;
    modalKeyFeedback.textContent = "";
    keyModal.classList.add("show");
  });
}

if (keyModalCancel) {
  keyModalCancel.addEventListener("click", () => {
    keyModal.classList.remove("show");
  });
}

if (keyModalSave) {
  keyModalSave.addEventListener("click", () => {
    const newKey = modalApiKey.value.trim();
    if (!newKey) {
      modalKeyFeedback.style.color = "#ef4444";
      modalKeyFeedback.textContent = "API key cannot be empty.";
      return;
    }

    userApiKey = newKey;
    localStorage.setItem("gandalf_openrouter_api_key", userApiKey);
    socket.emit("update_api_key", { apiKey: userApiKey });

    modalKeyFeedback.style.color = "#10b981";
    modalKeyFeedback.textContent = "Updating key with Gandalf...";
  });
}

socket.on("api_key_updated", (data) => {
  if (data.success) {
    if (modalKeyFeedback) {
      modalKeyFeedback.style.color = "#10b981";
      modalKeyFeedback.textContent = "✅ " + data.message;
    }
    setTimeout(() => {
      if (keyModal) keyModal.classList.remove("show");
    }, 1200);
  } else {
    if (modalKeyFeedback) {
      modalKeyFeedback.style.color = "#ef4444";
      modalKeyFeedback.textContent = "❌ " + data.message;
    }
  }
});

// ── Game Reset / State ───────────────────────────────────────────────
socket.on("game_reset", () => location.reload());

socket.on("game_state", (data) => {
  if (data.state === "finished" && !myName) {
    joinError.textContent = "The challenge has ended. Await instructor reset.";
    joinBtn.disabled = true;
  }
});

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
