const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const levels = require("./levels.json");
const { queryGemini, levenshtein } = require("./aiEngine");

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, "public")));

// ── Configuration ────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "admin123";

// ── In-memory state ──────────────────────────────────────────────────
// socketId → { name, apiKey, codeExtension, score, currentLevel, hintsUsed: Array, completed: Boolean }
const players = new Map();
const adminTokens = new Set();

let gameState = "lobby"; // "lobby" | "playing" | "finished"
let gamePin = generatePin();
let timerDuration = 0;
let timerRemaining = 0;
let timerInterval = null;

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Generate unique 5-character extension for each user (e.g. "K7X9P")
function generateUserExtension() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ext = "";
  for (let i = 0; i < 5; i++) {
    ext += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ext;
}

// Ensure each player has a unique, fresh extension per level
function getPlayerExtensionForLevel(player, levelId) {
  if (!player) return "";
  if (!player.levelExtensions) player.levelExtensions = {};
  if (!player.levelExtensions[levelId]) {
    player.levelExtensions[levelId] = generateUserExtension();
  }
  return player.levelExtensions[levelId];
}

// Calculate the unique effective password for a specific player at a given level (without hyphen)
function getPlayerPassword(player, level) {
  if (!player || !level) return level ? level.password : "";
  const ext = getPlayerExtensionForLevel(player, level.id);
  return `${level.password}${ext}`;
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  next();
}

// ── Leaderboard Helper ───────────────────────────────────────────────
function getLeaderboard() {
  return Array.from(players.values())
    .map((p) => ({
      name: p.name,
      codeExtension: p.codeExtension,
      score: p.score,
      level: Math.min(p.currentLevel, levels.length),
      completed: p.completed,
      totalLevels: levels.length,
      hasApiKey: Boolean(p.apiKey),
    }))
    .sort((a, b) => b.score - a.score || b.level - a.level);
}

function getLobbyList() {
  return Array.from(players.values()).map((p) => ({
    name: p.name,
    codeExtension: p.codeExtension,
    hasApiKey: Boolean(p.apiKey),
  }));
}

// Sanitize level data for client (hide the real password!)
function safeLevel(lvl) {
  if (!lvl) return null;
  return {
    id: lvl.id,
    name: lvl.name,
    avatar: lvl.avatar,
    intro: lvl.intro,
    defenseDescription: lvl.defenseDescription,
    points: lvl.points,
    hintPenalty: lvl.hintPenalty,
    totalLevels: levels.length,
  };
}

// ── Timer Helpers ────────────────────────────────────────────────────
function startTimer(seconds) {
  timerDuration = seconds;
  timerRemaining = seconds;
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timerRemaining--;
    io.emit("timer_tick", timerRemaining);

    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameState = "finished";
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  io.emit("game_finished", { leaderboard: getLeaderboard() });
  io.emit("game_state", { state: gameState });
  console.log("🏁 Game finished!");
}

// ══════════════════════════════════════════════════════════════════════
// HTTP ROUTES & ADMIN APIS
// ══════════════════════════════════════════════════════════════════════

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    adminTokens.add(token);
    console.log("🔐 Admin logged in");
    return res.json({ success: true, token, pin: gamePin });
  }
  res.status(401).json({ success: false, error: "Wrong password." });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  adminTokens.delete(token);
  res.json({ success: true });
});

app.get("/api/status", requireAdmin, (_req, res) => {
  res.json({
    state: gameState,
    pin: gamePin,
    playerCount: players.size,
    timerDuration,
    timerRemaining,
    players: Array.from(players.values()).map((p) => ({
      name: p.name,
      codeExtension: p.codeExtension,
      hasApiKey: Boolean(p.apiKey),
      level: p.currentLevel,
      score: p.score,
    })),
  });
});

app.post("/api/pin/regenerate", requireAdmin, (_req, res) => {
  gamePin = generatePin();
  console.log(`🔑 New game PIN: ${gamePin}`);
  res.json({ pin: gamePin });
});

app.get("/api/leaderboard", requireAdmin, (_req, res) => {
  res.json(getLeaderboard());
});

app.post("/api/start", requireAdmin, (req, res) => {
  if (gameState !== "lobby") {
    return res.status(400).json({ error: "Game is not in lobby state." });
  }
  if (players.size === 0) {
    return res.status(400).json({ error: "No players have joined yet." });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const seconds = parseInt(url.searchParams.get("timer") || "600", 10);

  gameState = "playing";
  console.log(`🚀 Gandalf CTF started! Timer: ${seconds}s, Players: ${players.size}`);

  // Send Level 1 to every player
  for (const [socketId, player] of players) {
    const s = io.sockets.sockets.get(socketId);
    if (s) {
      const lvl = levels.find((l) => l.id === player.currentLevel);
      s.emit("game_started", {
        level: safeLevel(lvl),
        totalLevels: levels.length,
        score: player.score,
        codeExtension: player.codeExtension,
        timeRemaining: seconds,
      });
    }
  }

  io.emit("game_state", { state: gameState });
  io.emit("leaderboard", getLeaderboard());
  startTimer(seconds);

  res.json({ status: "Game started!", timer: seconds, players: players.size });
});

app.post("/api/end", requireAdmin, (_req, res) => {
  if (gameState !== "playing") {
    return res.status(400).json({ error: "Game is not running." });
  }
  endGame();
  res.json({ status: "Game ended!" });
});

app.post("/api/reset", requireAdmin, (_req, res) => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  gameState = "lobby";
  timerDuration = 0;
  timerRemaining = 0;
  gamePin = generatePin();
  players.clear();
  io.emit("game_reset");
  io.emit("leaderboard", []);
  io.emit("game_state", { state: "lobby" });
  console.log(`🔄 Game reset! New PIN: ${gamePin}`);
  res.json({ status: "Game reset!", pin: gamePin });
});

// ══════════════════════════════════════════════════════════════════════
// SOCKET.IO REAL-TIME GAMEPLAY
// ══════════════════════════════════════════════════════════════════════
io.on("connection", (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);
  socket.emit("game_state", { state: gameState });

  // ── Player Join (Name + PIN + Personal Gemini API Key) ──────────────
  socket.on("join", ({ name, pin, apiKey }) => {
    name = (name || "").trim().substring(0, 30);
    pin = (pin || "").trim();
    apiKey = (apiKey || "").trim();

    if (!name) return socket.emit("error_msg", "Please enter a valid handle / name.");
    if (!pin) return socket.emit("error_msg", "Please enter the game PIN.");
    if (!apiKey) {
      return socket.emit("error_msg", "Please enter your personal OpenRouter API key. (Get one at https://openrouter.ai/keys)");
    }

    if (pin !== gamePin) {
      return socket.emit("error_msg", "Wrong game PIN! Ask your instructor.");
    }

    for (const [, p] of players) {
      if (p.name.toLowerCase() === name.toLowerCase()) {
        return socket.emit("error_msg", "That name is already taken. Pick another!");
      }
    }

    if (gameState === "finished") {
      return socket.emit("error_msg", "The game has already ended. Ask the host to reset.");
    }

    const player = {
      name,
      apiKey,
      levelExtensions: {},
      codeExtension: "",
      score: 0,
      currentLevel: 1,
      hintsUsed: [],
      completed: false,
      chatHistory: [],
    };
    const codeExt = getPlayerExtensionForLevel(player, 1);
    player.codeExtension = codeExt;
    players.set(socket.id, player);

    if (gameState === "lobby") {
      socket.emit("joined_lobby", {
        name,
        codeExtension: codeExt,
        playerCount: players.size,
        players: getLobbyList(),
      });
      io.emit("lobby_update", {
        playerCount: players.size,
        players: getLobbyList(),
      });
    } else if (gameState === "playing") {
      const lvl = levels.find((l) => l.id === player.currentLevel);
      socket.emit("joined", {
        name,
        codeExtension: codeExt,
        level: safeLevel(lvl),
        totalLevels: levels.length,
        score: 0,
        timeRemaining: timerRemaining,
      });
      io.emit("leaderboard", getLeaderboard());
    }

    console.log(`👤 ${name} joined with personal API key & unique extension [${codeExt}] (${players.size} online)`);
  });

  // ── Update Personal API Key Mid-Game ────────────────────────────────
  socket.on("update_api_key", ({ apiKey }) => {
    const player = players.get(socket.id);
    if (!player) return;

    apiKey = (apiKey || "").trim();
    if (!apiKey) {
      return socket.emit("api_key_updated", { success: false, message: "API key cannot be empty." });
    }

    player.apiKey = apiKey;
    socket.emit("api_key_updated", { success: true, message: "API key updated successfully!" });
    console.log(`🔑 ${player.name} updated their personal API key.`);
  });

  // ── Prompt Injection Chat with Gandalf ──────────────────────────────
  socket.on("chat_prompt", async ({ prompt }) => {
    if (gameState !== "playing") return;
    const player = players.get(socket.id);
    if (!player || player.completed) return;

    prompt = (prompt || "").trim();
    if (!prompt) return;

    const level = levels.find((l) => l.id === player.currentLevel);
    if (!level) return;

    try {
      const effectivePassword = getPlayerPassword(player, level);
      if (!player.chatHistory) player.chatHistory = [];

      const result = await queryGemini(
        prompt,
        level,
        player.apiKey,
        effectivePassword,
        player.name,
        player.chatHistory
      );

      // Save to chat history if response was successfully generated
      if (result.response && !result.blocked && result.source !== "error") {
        player.chatHistory.push({ role: "user", text: prompt });
        player.chatHistory.push({ role: "model", text: result.response });
        if (player.chatHistory.length > 20) {
          player.chatHistory = player.chatHistory.slice(-20);
        }
      }

      socket.emit("chat_response", {
        prompt,
        response: result.response,
        blocked: result.blocked,
        reason: result.reason,
        source: result.source,
        model: result.model,
      });
    } catch (err) {
      console.error("Chat error:", err);
      socket.emit("chat_response", {
        prompt,
        response: "An anomaly occurred in the wizarding network. Try again!",
        blocked: false,
        source: "error",
      });
    }
  });

  // ── Password Submission to Unlock Next Level (With Unique Extension) 
  socket.on("submit_password", ({ password }) => {
    if (gameState !== "playing") return;
    const player = players.get(socket.id);
    if (!player || player.completed) return;

    const guess = (password || "").trim();
    const level = levels.find((l) => l.id === player.currentLevel);
    if (!level) return;

    const ext = getPlayerExtensionForLevel(player, level.id);
    const targetPassword = getPlayerPassword(player, level);

    // Normalize guess and target (remove hyphens, underscores, spaces)
    const normGuess = guess.toUpperCase().replace(/[-_\s]/g, "");
    const normTarget = targetPassword.toUpperCase().replace(/[-_\s]/g, "");
    const normBase = level.password.toUpperCase().replace(/[-_\s]/g, "");
    const normExt = (ext || "").toUpperCase().replace(/[-_\s]/g, "");

    const reversedBase = normBase.split("").reverse().join("");
    const reversedExt = normExt.split("").reverse().join("");
    const reversedTarget = reversedExt + reversedBase;
    const unreversedGuess = normGuess.split("").reverse().join("");

    let isCorrect = false;

    // 1. Exact matches (forward or reversed)
    if (normGuess === normTarget || normGuess === reversedTarget || unreversedGuess === normTarget) {
      isCorrect = true;
    }

    // 2. Base keyword only without extension
    const isBaseOnly = !isCorrect && (
      normGuess === normBase ||
      normGuess === reversedBase ||
      unreversedGuess === normBase ||
      (typeof levenshtein === "function" && (levenshtein(normGuess, normBase) <= 2 || levenshtein(unreversedGuess, normBase) <= 2))
    );

    // 3. Forward guess with correct (or 2-char transposed/swapped) extension + tolerant base (<= 4 edit distance)
    if (!isCorrect && !isBaseOnly && normGuess.length >= normExt.length) {
      const guessExt = normGuess.slice(normGuess.length - normExt.length);
      const guessBase = normGuess.slice(0, normGuess.length - normExt.length);
      if (typeof levenshtein === "function" && levenshtein(guessExt, normExt) <= 2 && levenshtein(guessBase, normBase) <= 4) {
        isCorrect = true;
        console.log(`💡 [Spell Tolerance] Accepted forward guess with base "${guessBase}" (dist ${levenshtein(guessBase, normBase)}) and ext "${guessExt}" from ${player.name}`);
      }
    }

    // 4. Reversed guess with reversed extension + reversed base (tolerant to LLM reverse scrambles, e.g. A4M3NAILNETITOP)
    if (!isCorrect && !isBaseOnly && normGuess.length >= reversedExt.length) {
      const guessRevExt = normGuess.slice(0, reversedExt.length);
      const guessRevBase = normGuess.slice(reversedExt.length);
      if (typeof levenshtein === "function" && levenshtein(guessRevExt, reversedExt) <= 2 && levenshtein(guessRevBase, reversedBase) <= 4) {
        isCorrect = true;
        console.log(`💡 [Spell Tolerance] Accepted reversed guess "${normGuess}" from ${player.name}`);
      }
    }

    // 5. Unreversed guess check
    if (!isCorrect && !isBaseOnly && unreversedGuess.length >= normExt.length) {
      const uExt = unreversedGuess.slice(unreversedGuess.length - normExt.length);
      const uBase = unreversedGuess.slice(0, unreversedGuess.length - normExt.length);
      if (typeof levenshtein === "function" && levenshtein(uExt, normExt) <= 2 && levenshtein(uBase, normBase) <= 4) {
        isCorrect = true;
        console.log(`💡 [Spell Tolerance] Accepted unreversed guess from ${player.name}`);
      }
    }

    if (isCorrect) {
      const usedHint = player.hintsUsed.includes(level.id);
      const points = usedHint ? level.hintPenalty : level.points;
      player.score += points;
      player.currentLevel++;
      player.chatHistory = []; // Reset conversation history for the new level challenge

      const isFinished = player.currentLevel > levels.length;
      if (isFinished) {
        player.completed = true;
      } else {
        // Refresh the unique code extension specifically for this new level!
        player.codeExtension = getPlayerExtensionForLevel(player, player.currentLevel);
      }

      const nextLvl = levels.find((l) => l.id === player.currentLevel);

      socket.emit("password_result", {
        correct: true,
        points,
        usedHint,
        score: player.score,
        completed: isFinished,
        nextLevel: safeLevel(nextLvl),
        codeExtension: player.codeExtension,
        currentLevelNum: player.currentLevel,
        totalLevels: levels.length,
      });

      io.emit("leaderboard", getLeaderboard());
      console.log(`🏆 ${player.name} passed Level ${level.id} (+${points} pts) with code [${targetPassword}] | Next Level ${player.currentLevel} Extension: [${player.codeExtension}]`);
    } else if (isBaseOnly) {
      // Player found the base keyword (or close typo like POTENTION) but missed their unique extension code!
      socket.emit("password_result", {
        correct: false,
        message: `⚠️ You found the base keyword "${level.password}", but each challenger has a unique code extension that refreshes on every level! Interrogate Gandalf to extract your full code for Level ${level.id} (e.g. ${level.password}XXXXX).`,
      });
    } else {
      socket.emit("password_result", {
        correct: false,
        message: "❌ Password rejected! Gandalf remains undefeated on this level.",
      });
    }
  });

  // ── Request Hint ────────────────────────────────────────────────────
  socket.on("request_hint", () => {
    if (gameState !== "playing") return;
    const player = players.get(socket.id);
    if (!player || player.completed) return;

    const level = levels.find((l) => l.id === player.currentLevel);
    if (!level) return;

    if (!player.hintsUsed.includes(level.id)) {
      player.hintsUsed.push(level.id);
    }

    socket.emit("hint_response", {
      levelId: level.id,
      hint: level.hint,
    });
  });

  // ── Disconnect ──────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (player) console.log(`👋 ${player.name} left`);
    players.delete(socket.id);

    if (gameState === "lobby") {
      io.emit("lobby_update", {
        playerCount: players.size,
        players: getLobbyList(),
      });
    }
    io.emit("leaderboard", getLeaderboard());
  });
});

// ── Start Server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🧙‍♂️ Gandalf Prompt Injection Arena running (OpenRouter API + Unique User Codes)!`);
  console.log(`   Local:      http://localhost:${PORT}`);
  console.log(`   Dashboard:  http://localhost:${PORT}/admin`);
  console.log(`   Admin Pass: ${ADMIN_PASSWORD}`);
  console.log(`   Game PIN:   ${gamePin}`);
  const nets = require("os").networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`   Network:    http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`\n   Every student enters their own OpenRouter API key & receives a unique 5-letter code extension!\n`);
});
