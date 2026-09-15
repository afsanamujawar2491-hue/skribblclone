# SQLite persistence

`database.js` initializes `backend/data/skribbl.sqlite`, creates the required tables, and seeds the categorized word list on startup.

The Socket.IO server keeps transient live game state in memory, while persistent room/player/ban/word data is written to SQLite.
