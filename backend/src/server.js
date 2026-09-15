
const Room = require("./models/Room");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { wordCategories } = require("./data/words");
const database = require("./database");

database.seedWords(wordCategories);

const app = express();

const configuredOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser tools/server-to-server requests.
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes("*")) {
      return callback(null, true);
    }
    return callback(null, configuredOrigins.includes(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
};

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

const rooms = new Map();

const DEFAULT_SETTINGS = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hints: 3,
  category: "all",
};

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function normalizeSettings(settings = {}) {
  return {
    maxPlayers: clamp(settings.maxPlayers, 2, 20, DEFAULT_SETTINGS.maxPlayers),
    rounds: clamp(settings.rounds, 2, 10, DEFAULT_SETTINGS.rounds),
    drawTime: clamp(settings.drawTime, 15, 240, DEFAULT_SETTINGS.drawTime),
    wordCount: clamp(settings.wordCount, 1, 5, DEFAULT_SETTINGS.wordCount),
    hints: clamp(settings.hints, 0, 5, DEFAULT_SETTINGS.hints),
    category: typeof settings.category === "string" && (settings.category === "all" || wordCategories[settings.category]) ? settings.category : DEFAULT_SETTINGS.category,
  };
}

function getRandomWords(count, category = "all") {
  const words = database.getRandomWords(count, category);
  if (words.length >= count) return words;
  const fallback = database.getRandomWords(count, "all");
  return [...new Set([...words, ...fallback])].slice(0, count);
}

function generateInviteToken() {
  return crypto.randomBytes(18).toString("hex");
}

function generateRoomId() {
  let id;
  do {
    id = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.has(id));
  return id;
}

function publicPlayers(room) {
  return room.players.map((player) => ({
    ...player,
    score: room.scores[player.id] || 0,
  }));
}

function broadcastPlayers(room) {
  io.to(room.id).emit("players_updated", {
    players: publicPlayers(room),
  });
}

function publicRooms() {
  return [...rooms.values()]
    .filter((room) => room.visibility === "public" && room.phase === "LOBBY")
    .map((room) => ({
      roomId: room.id,
      hostName: room.players.find((p) => p.id === room.hostId)?.name || "Host",
      playerCount: room.players.length,
      maxPlayers: room.settings.maxPlayers,
      rounds: room.settings.rounds,
    }));
}

function broadcastPublicRooms() {
  io.emit("public_rooms", { rooms: publicRooms() });
}

function broadcastSystemMessage(room, text) {
  io.to(room.id).emit("system_message", { text });
}

function clearRoundTimers(room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = null;
  if (room.hintTimer) clearInterval(room.hintTimer);
  room.hintTimer = null;
}

function clearCanvas(room) {
  room.strokes = [];
  room.currentStroke = null;
  io.to(room.id).emit("canvas_state", { strokes: [] });
}

function calculatePoints(room) {
  const elapsed = room.settings.drawTime - room.timeRemaining;
  return Math.max(10, Math.round(100 - elapsed * 1.2));
}

function allGuessersCorrect(room) {
  const guessers = room.players.filter((p) => p.id !== room.currentDrawerId);
  return guessers.length > 0 && guessers.every((p) => room.correctGuesses.has(p.id));
}

function startRound(room) {
  clearRoundTimers(room);
  clearCanvas(room);

  if (room.round > room.settings.rounds) {
    finishGame(room);
    return;
  }

  room.phase = "CHOOSING_WORD";
  database.setRoomStatus(room.id, room.phase);
  room.currentWord = null;
  room.wordChoices = getRandomWords(room.settings.wordCount, room.settings.category);
  // The drawing timer does not start while the drawer is choosing a word.
  // Keep the lobby/selection state separate from the timed drawing phase.
  room.timeRemaining = 0;
  room.correctGuesses = new Set();
  room.hintsRevealed = 0;

  const drawerId = room.currentDrawerId;
  io.to(room.id).emit("round_starting", {
    round: room.round,
    totalRounds: room.settings.rounds,
    drawerId,
    // This is configuration only; the actual drawing timer starts after selection.
    drawTime: room.settings.drawTime,
    timerStarted: false,
  });

  io.to(drawerId).emit("choose_word", {
    words: room.wordChoices,
  });

  room.wordChoiceTimeout = setTimeout(() => {
    if (room.phase !== "CHOOSING_WORD") return;
    const fallback = room.wordChoices[0];
    chooseWord(room, drawerId, fallback);
  }, 15000);
}

function chooseWord(room, drawerId, word) {
  if (room.phase !== "CHOOSING_WORD" || room.currentDrawerId !== drawerId) return;

  const selected = room.wordChoices.find(
    (item) => item.toLowerCase() === String(word).trim().toLowerCase()
  );
  if (!selected) return;

  if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
  room.currentWord = selected.trim().toLowerCase();
  room.phase = "PLAYING";
  database.setRoomStatus(room.id, room.phase);
  room.timeRemaining = room.settings.drawTime;
  room.roundStartedAt = Date.now();
  room.correctGuesses = new Set();

  io.to(drawerId).emit("word_selected", { word: room.currentWord });
  io.to(room.id).emit("word_started", {
    wordLength: room.currentWord.length,
    word: null,
  });

  io.to(room.id).emit("round_started", {
    round: room.round,
    totalRounds: room.settings.rounds,
    drawerId: room.currentDrawerId,
    drawTime: room.settings.drawTime,
    timerStarted: true,
  });

  if (room.settings.hints > 0) {
    const interval = Math.max(
      1000,
      Math.floor((room.settings.drawTime * 1000) / (room.settings.hints + 1))
    );
    room.hintTimer = setInterval(() => {
      if (room.phase !== "PLAYING") return;
      room.hintsRevealed += 1;
      const chars = room.currentWord.split("");
      const revealCount = Math.min(
        chars.length,
        Math.ceil((chars.length * room.hintsRevealed) / room.settings.hints)
      );
      const revealed = chars.map((char, index) =>
        char === " " || index < revealCount ? char : "_"
      );
      io.to(room.id).emit("hint_update", {
        pattern: revealed.join(" "),
      });
      if (room.hintsRevealed >= room.settings.hints) {
        clearInterval(room.hintTimer);
        room.hintTimer = null;
      }
    }, interval);
  }

  room.roundTimer = setInterval(() => {
    if (room.phase !== "PLAYING") return;
    room.timeRemaining = Math.max(
      0,
      room.settings.drawTime - Math.floor((Date.now() - room.roundStartedAt) / 1000)
    );
    io.to(room.id).emit("timer_update", { timeRemaining: room.timeRemaining });
    if (room.timeRemaining <= 0) endRound(room);
  }, 1000);
}

function endRound(room) {
  if (!room || (room.phase !== "PLAYING" && room.phase !== "CHOOSING_WORD")) return;
  clearRoundTimers(room);
  room.phase = "ROUND_END";
  database.setRoomStatus(room.id, room.phase);

  const scores = room.scores;
  io.to(room.id).emit("round_end", {
    word: room.currentWord || room.wordChoices[0] || "",
    scores,
    players: publicPlayers(room),
  });

  setTimeout(() => {
    if (!rooms.has(room.id)) return;
    room.round += 1;

    if (room.round > room.settings.rounds) {
      finishGame(room);
      return;
    }

    room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
    room.currentDrawerId = room.players[room.drawerIndex]?.id || null;
    startRound(room);
  }, 3500);
}

function finishGame(room) {
  clearRoundTimers(room);
  room.phase = "GAME_OVER";
  database.setRoomStatus(room.id, room.phase);

  const leaderboard = publicPlayers(room).sort((a, b) => b.score - a.score);
  const winner = leaderboard[0] || null;

  io.to(room.id).emit("game_over", {
    winner,
    leaderboard,
  });
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  socket.emit("public_rooms", { rooms: publicRooms() });

  socket.on("create_room", ({ hostName, settings, visibility }) => {
    const cleanName = String(hostName || "").trim().slice(0, 24);
    if (!cleanName) {
      socket.emit("error_message", { message: "Please enter your name" });
      return;
    }

    const roomId = generateRoomId();
    const roomVisibility = visibility === "public" ? "public" : "private";
    const room = new Room(
      roomId,
      socket.id,
      cleanName,
      normalizeSettings(settings),
      roomVisibility
    );
    room.inviteToken = roomVisibility === "private" ? generateInviteToken() : null;

    rooms.set(roomId, room);
    database.createRoom(room);
    socket.join(roomId);

    socket.emit("room_created", {
      roomId,
      player: room.players[0],
      players: publicPlayers(room),
      settings: room.settings,
      hostId: room.hostId,
      visibility: room.visibility,
      inviteToken: room.inviteToken,
    });
    broadcastPublicRooms();
  });

  socket.on("join_room", ({ roomId, playerName, inviteToken }) => {
    const requestedRoomId = String(roomId || "").trim().replace(/\s+/g, "").toUpperCase();
    const room = rooms.get(requestedRoomId);
    const cleanName = String(playerName || "").trim().slice(0, 24);

    if (!room) {
      console.log(`Join failed: room ${requestedRoomId || "<empty>"} not found for ${socket.id}`);
      socket.emit("join_result", { ok: false, message: "Room not found. Check the 6-character room code." });
      socket.emit("error_message", { message: "Room not found. Check the 6-character room code." });
      return;
    }
    if (!cleanName) {
      socket.emit("join_result", { ok: false, message: "Please enter your name" });
      socket.emit("error_message", { message: "Please enter your name" });
      return;
    }
    if (room.visibility === "private" && String(inviteToken || "") !== String(room.inviteToken || "")) {
      socket.emit("join_result", { ok: false, message: "This is a private room. Use the host's invite link to join." });
      socket.emit("error_message", { message: "This is a private room. Use the host's invite link to join." });
      return;
    }
    if (room.bannedNames.has(cleanName.toLowerCase())) {
      socket.emit("join_result", { ok: false, message: "You are banned from this room." });
      socket.emit("error_message", { message: "You are banned from this room." });
      return;
    }
    if (room.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      socket.emit("join_result", { ok: false, message: "That name is already in use in this room." });
      socket.emit("error_message", { message: "That name is already in use in this room." });
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit("join_result", { ok: false, message: "Room is full" });
      socket.emit("error_message", { message: "Room is full" });
      return;
    }
    if (room.phase !== "LOBBY") {
      socket.emit("join_result", { ok: false, message: "Game has already started" });
      socket.emit("error_message", { message: "Game has already started" });
      return;
    }

    const player = { id: socket.id, name: cleanName, ready: false };
    room.addPlayer(player);
    database.addPlayer(room.id, player);
    socket.join(room.id);

    socket.emit("join_result", { ok: true, roomId: room.id });
    socket.emit("room_joined", {
      roomId: room.id,
      player,
      players: publicPlayers(room),
      settings: room.settings,
      hostId: room.hostId,
      visibility: room.visibility,
      inviteToken: room.inviteToken,
    });
    io.to(room.id).emit("room_state", {
      roomId: room.id,
      players: publicPlayers(room),
      settings: room.settings,
      hostId: room.hostId,
      visibility: room.visibility,
      phase: room.phase,
    });
    broadcastPlayers(room);
    broadcastSystemMessage(room, `${cleanName} joined the room.`);
    broadcastPublicRooms();
  });

  socket.on("join_public_room", ({ playerName }) => {
    const cleanName = String(playerName || "").trim().slice(0, 24);
    if (!cleanName) {
      socket.emit("error_message", { message: "Please enter your name" });
      return;
    }
    const available = [...rooms.values()].find(
      (r) => r.visibility === "public" && r.phase === "LOBBY" && r.players.length < r.settings.maxPlayers
    );
    if (!available) {
      socket.emit("error_message", { message: "No public rooms are currently available" });
      return;
    }
    if (available.bannedNames.has(cleanName.toLowerCase())) {
      socket.emit("error_message", { message: "You are banned from this room." });
      return;
    }
    if (available.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      socket.emit("error_message", { message: "That name is already in use in this room." });
      return;
    }
    const player = { id: socket.id, name: cleanName, ready: false };
    available.addPlayer(player);
    database.addPlayer(available.id, player);
    socket.join(available.id);
    socket.emit("room_joined", {
      roomId: available.id, player, players: publicPlayers(available),
      settings: available.settings, hostId: available.hostId, visibility: available.visibility,
    });
    io.to(available.id).emit("room_state", {
      roomId: available.id, players: publicPlayers(available),
      settings: available.settings, hostId: available.hostId,
      visibility: available.visibility, phase: available.phase,
    });
    broadcastPlayers(available);
    broadcastSystemMessage(available, `${cleanName} joined the room.`);
    broadcastPublicRooms();
  });

  socket.on("toggle_ready", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player || room.phase !== "LOBBY") return;

    player.ready = !player.ready;
    database.updatePlayerReady(room.id, player.id, player.ready);
    broadcastPlayers(room);
  });

  socket.on("start_game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.hostId) {
      socket.emit("error_message", { message: "Only the host can start the game" });
      return;
    }
    if (room.players.length < 2) {
      socket.emit("error_message", { message: "At least 2 players are required" });
      return;
    }
    if (room.players.some((p) => !p.ready)) {
      socket.emit("error_message", { message: "All players must be ready before starting" });
      return;
    }

    room.round = 1;
    room.drawerIndex = 0;
    room.currentDrawerId = room.players[0].id;
    room.players.forEach((p) => (p.ready = false));
    broadcastPlayers(room);
    io.to(room.id).emit("game_started", {
      roomId: room.id,
      round: room.round,
      drawerId: room.currentDrawerId,
      players: publicPlayers(room),
    });
    startRound(room);
    broadcastPublicRooms();
  });

  socket.on("select_word", ({ roomId, word }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.currentDrawerId) return;
    chooseWord(room, socket.id, word);
  });

  socket.on("draw_start", (data) => {
    const room = rooms.get(data.roomId);
    if (!room || room.phase !== "PLAYING" || room.currentDrawerId !== socket.id) return;

    room.currentStroke = {
      type: "stroke",
      color: data.isEraser ? "#ffffff" : data.color || "#000000",
      size: Number(data.size) || 5,
      points: [{ x: Number(data.x), y: Number(data.y) }],
    };

    socket.to(room.id).emit("draw_data", {
      type: "start",
      x: Number(data.x),
      y: Number(data.y),
      color: room.currentStroke.color,
      size: room.currentStroke.size,
      isEraser: Boolean(data.isEraser),
    });
  });

  socket.on("draw_move", (data) => {
    const room = rooms.get(data.roomId);
    if (!room || room.phase !== "PLAYING" || room.currentDrawerId !== socket.id) return;
    if (!room.currentStroke) return;

    const point = { x: Number(data.x), y: Number(data.y) };
    room.currentStroke.points.push(point);
    socket.to(room.id).emit("draw_data", { type: "move", x: point.x, y: point.y });
  });

  socket.on("draw_end", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "PLAYING" || room.currentDrawerId !== socket.id) return;
    if (!room.currentStroke) return;

    room.strokes.push(room.currentStroke);
    room.currentStroke = null;
    socket.to(room.id).emit("draw_data", { type: "end" });
  });

  socket.on("canvas_clear", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "PLAYING" || room.currentDrawerId !== socket.id) return;
    clearCanvas(room);
  });

  socket.on("draw_undo", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "PLAYING" || room.currentDrawerId !== socket.id) return;
    room.strokes.pop();
    io.to(room.id).emit("canvas_state", { strokes: room.strokes });
  });

  socket.on("guess", ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "PLAYING") return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player || player.id === room.currentDrawerId || room.correctGuesses.has(player.id)) return;

    const guess = String(text || "").trim();
    if (!guess) return;

    const correct = guess.toLowerCase() === room.currentWord.toLowerCase();

    if (correct) {
      const points = calculatePoints(room);
      room.scores[player.id] = (room.scores[player.id] || 0) + points;
      database.updatePlayerScore(room.id, player.id, room.scores[player.id]);
      room.correctGuesses.add(player.id);

      io.to(room.id).emit("guess_result", {
        correct: true,
        playerId: player.id,
        playerName: player.name,
        points,
      });
      broadcastPlayers(room);

      if (allGuessersCorrect(room)) endRound(room);
    } else {
      io.to(room.id).emit("chat_message", {
        playerId: player.id,
        playerName: player.name,
        text: guess,
      });
      socket.emit("guess_result", {
        correct: false,
        playerId: player.id,
        playerName: player.name,
        points: 0,
      });
    }
  });

  socket.on("chat", ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase === "GAME_OVER") return;

    const player = room.players.find((p) => p.id === socket.id);
    const message = String(text || "").trim().slice(0, 200);
    if (!player || !message) return;

    io.to(room.id).emit("chat_message", {
      playerId: player.id,
      playerName: player.name,
      text: message,
    });
  });

  socket.on("leave_room", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    // The host controls the room lifecycle; regular players can leave freely.
    if (socket.id === room.hostId) {
      socket.emit("error_message", { message: "The host cannot leave the room. End the room or transfer hosting first." });
      return;
    }

    const wasDrawer = room.currentDrawerId === socket.id;
    room.removePlayer(socket.id);
    database.removePlayer(room.id, socket.id);
    socket.leave(room.id);
    socket.emit("room_left", { message: "You left the room." });

    broadcastSystemMessage(room, `${player.name} left the room.`);

    if (room.players.length === 0) {
      clearRoundTimers(room);
      database.setRoomStatus(room.id, "ABANDONED");
      rooms.delete(roomId);
      broadcastPublicRooms();
      socket.disconnect(true);
      return;
    }

    if (room.phase === "LOBBY") {
      broadcastPlayers(room);
    } else if (room.phase !== "GAME_OVER") {
      if (room.players.length < 2) {
        finishGame(room);
      } else if (wasDrawer) {
        room.drawerIndex = room.drawerIndex % room.players.length;
        room.currentDrawerId = room.players[room.drawerIndex]?.id || null;
        startRound(room);
      } else if (allGuessersCorrect(room)) {
        endRound(room);
      } else {
        broadcastPlayers(room);
      }
    }

    broadcastPublicRooms();
    socket.disconnect(true);
  });

  socket.on("moderate_player", ({ roomId, playerId, action }) => {
    const room = rooms.get(roomId);
    if (!room || socket.id !== room.hostId) return;
    if (!playerId || playerId === socket.id) return;

    const target = room.players.find((p) => p.id === playerId);
    const targetSocket = io.sockets.sockets.get(playerId);
    if (!target || !targetSocket) return;

    const shouldBan = action === "ban";
    if (shouldBan) {
      room.bannedNames.add(target.name.toLowerCase());
      database.banPlayer(room.id, target.name);
    }

    room.removePlayer(playerId);
    database.removePlayer(room.id, playerId);
    targetSocket.emit("moderation_result", {
      action: shouldBan ? "ban" : "kick",
      message: shouldBan ? "You were banned by the host." : "You were kicked by the host.",
    });
    targetSocket.leave(room.id);
    targetSocket.disconnect(true);

    if (room.players.length === 0) {
      database.setRoomStatus(room.id, "ABANDONED");
      rooms.delete(roomId);
      broadcastPublicRooms();
      return;
    }

    broadcastSystemMessage(room, `${target.name} was ${shouldBan ? "banned" : "kicked"} by the host.`);

    if (room.phase === "LOBBY") {
      broadcastPlayers(room);
    } else if (room.currentDrawerId === playerId) {
      room.drawerIndex = room.players.length ? room.drawerIndex % room.players.length : 0;
      room.currentDrawerId = room.players[room.drawerIndex]?.id || null;
      if (room.players.length < 2) finishGame(room);
      else startRound(room);
    } else {
      broadcastPlayers(room);
      if (allGuessersCorrect(room)) endRound(room);
    }
    broadcastPublicRooms();
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms) {
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) continue;

      if (room.phase === "LOBBY") {
        room.removePlayer(socket.id);
        database.removePlayer(room.id, socket.id);
        if (room.players.length === 0) {
          database.setRoomStatus(room.id, "ABANDONED");
          rooms.delete(roomId);
          continue;
        }
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
          database.transferHost(room.id, room.players[0].name);
        }
        broadcastPlayers(room);
        broadcastSystemMessage(room, `${player.name} left the room.`);
        broadcastPublicRooms();
      } else {
        const leavingName = player.name;
        broadcastSystemMessage(room, `${leavingName} left the game.`);
        room.removePlayer(socket.id);
        database.removePlayer(room.id, socket.id);
        if (room.players.length < 2) {
          finishGame(room);
        } else if (room.currentDrawerId === socket.id) {
          room.drawerIndex = room.drawerIndex % room.players.length;
          room.currentDrawerId = room.players[room.drawerIndex].id;
          room.round = Math.max(1, room.round);
          startRound(room);
        } else {
          broadcastPlayers(room);
        }
        broadcastPublicRooms();
      }
      break;
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "Skribbl Clone Backend", database: "SQLite" });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "Skribbl Clone Backend", database: "SQLite" });
});

app.get("/api/db-status", (_req, res) => {
  const row = database.db.prepare("SELECT COUNT(*) AS count FROM words").get();
  res.json({ database: "SQLite", words: row.count });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
