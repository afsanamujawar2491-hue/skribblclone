const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'skribbl.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    host_name TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    max_players INTEGER NOT NULL,
    rounds INTEGER NOT NULL,
    draw_time INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    hints INTEGER NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'LOBBY',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS room_players (
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    ready INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TEXT,
    PRIMARY KEY (room_id, player_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS banned_players (
    room_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    banned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, player_name),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
  CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
`);

// Runtime socket rooms cannot survive a server restart. Mark old runtime sessions
// as abandoned while keeping their configuration/history in SQLite.
db.prepare(`UPDATE rooms SET status = 'ABANDONED', updated_at = CURRENT_TIMESTAMP WHERE status IN ('LOBBY', 'PLAYING', 'CHOOSING_WORD', 'ROUND_END')`).run();

db.prepare(`UPDATE room_players SET left_at = COALESCE(left_at, CURRENT_TIMESTAMP) WHERE left_at IS NULL`).run();

const statements = {
  insertWord: db.prepare(`INSERT OR IGNORE INTO words (word, category) VALUES (?, ?)`),
  insertRoom: db.prepare(`
    INSERT INTO rooms (room_id, host_name, visibility, max_players, rounds, draw_time, word_count, hints, category, status)
    VALUES (@roomId, @hostName, @visibility, @maxPlayers, @rounds, @drawTime, @wordCount, @hints, @category, @status)
  `),
  updateRoomStatus: db.prepare(`UPDATE rooms SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`),
  updateHostName: db.prepare(`UPDATE rooms SET host_name = ?, updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`),
  insertPlayer: db.prepare(`
    INSERT OR REPLACE INTO room_players (room_id, player_id, player_name, score, ready, joined_at, left_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT joined_at FROM room_players WHERE room_id = ? AND player_id = ?), CURRENT_TIMESTAMP), NULL)
  `),
  updatePlayerScore: db.prepare(`UPDATE room_players SET score = ? WHERE room_id = ? AND player_id = ?`),
  updatePlayerReady: db.prepare(`UPDATE room_players SET ready = ? WHERE room_id = ? AND player_id = ?`),
  removePlayer: db.prepare(`UPDATE room_players SET left_at = CURRENT_TIMESTAMP WHERE room_id = ? AND player_id = ?`),
  insertBan: db.prepare(`INSERT OR IGNORE INTO banned_players (room_id, player_name) VALUES (?, ?)`),
  randomWords: db.prepare(`SELECT word FROM words WHERE category = ? ORDER BY RANDOM() LIMIT ?`),
  allRandomWords: db.prepare(`SELECT word FROM words ORDER BY RANDOM() LIMIT ?`),
};

function seedWords(wordCategories) {
  const seed = db.transaction(() => {
    for (const [category, words] of Object.entries(wordCategories)) {
      for (const word of words) statements.insertWord.run(String(word).trim(), category);
    }
  });
  seed();
}

function createRoom(room) {
  statements.insertRoom.run({
    roomId: room.id,
    hostName: room.players[0]?.name || 'Host',
    visibility: room.visibility,
    ...room.settings,
    status: room.phase,
  });
  const host = room.players[0];
  if (host) addPlayer(room.id, host, room.scores[host.id] || 0);
}

function addPlayer(roomId, player, score = 0) {
  statements.insertPlayer.run(roomId, player.id, player.name, score, player.ready ? 1 : 0, roomId, player.id);
}

function updatePlayerScore(roomId, playerId, score) {
  statements.updatePlayerScore.run(score, roomId, playerId);
}

function updatePlayerReady(roomId, playerId, ready) {
  statements.updatePlayerReady.run(ready ? 1 : 0, roomId, playerId);
}

function removePlayer(roomId, playerId) {
  statements.removePlayer.run(roomId, playerId);
}

function setRoomStatus(roomId, status) {
  statements.updateRoomStatus.run(status, roomId);
}

function transferHost(roomId, hostName) {
  statements.updateHostName.run(hostName, roomId);
}

function banPlayer(roomId, playerName) {
  statements.insertBan.run(roomId, playerName.toLowerCase());
}

function getRandomWords(count, category = 'all') {
  const rows = category === 'all'
    ? statements.allRandomWords.all(count)
    : statements.randomWords.all(category, count);
  return rows.map((row) => row.word);
}

function close() {
  db.close();
}

module.exports = {
  db,
  seedWords,
  createRoom,
  addPlayer,
  updatePlayerScore,
  updatePlayerReady,
  removePlayer,
  setRoomStatus,
  transferHost,
  banPlayer,
  getRandomWords,
  close,
};
