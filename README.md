# Skribbl.io Clone

A real-time multiplayer drawing and guessing game built with React, TypeScript, Node.js, Express and Socket.IO.

## Implemented assignment requirements

### Core
- Create and join rooms using a room code
- Configurable room settings: max players, rounds, drawing time, word choices and hints
- Lobby with live player list and ready status
- Host-only game start
- Turn-based drawer rotation
- Drawer chooses from 1–5 words
- Real-time canvas drawing over Socket.IO
- Brush, colors, brush size, eraser, undo and clear
- Guessing with case-insensitive exact word matching
- Correct-guess scoring
- Live leaderboard
- Server-authoritative countdown
- Round-end handling and next-drawer rotation
- Game-over screen with winner and final leaderboard
- Hint letters revealed during a round
- Chat/correct-guess notifications

## Tech stack

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Backend: Node.js + Express
- Realtime: Socket.IO
- Database: SQLite (via better-sqlite3)
- Persistence: SQLite stores room configuration/history, players, bans, scores and the categorized word list; live Socket.IO game state remains in memory for low-latency gameplay

## Project structure

```text
skribbl-clone/
├── backend/
│   ├── data/
│   │   └── skribbl.sqlite (created automatically)
│   └── src/
│       ├── data/words.js
│       ├── models/Room.js
│       ├── database.js
│       └── server.js
└── frontend/
    └── src/
        ├── components/DrawingCanvas.tsx
        ├── socket.ts
        └── App.tsx
```

## Run locally

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`. On first startup, the backend automatically creates `backend/data/skribbl.sqlite` and seeds the word categories into the SQLite `words` table.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend normally runs on `http://localhost:5173`.

For a deployed frontend, set:

```text
VITE_SERVER_URL=https://YOUR-BACKEND-URL
```

The frontend uses `VITE_SERVER_URL` and falls back to `http://localhost:5000`.

## Architecture

The browser connects to the Node.js server with Socket.IO. A `Room` object holds players, settings, current drawer, round state, secret word, scores, timer state and drawing strokes.

Drawing flow:

1. The drawer captures mouse coordinates on the HTML5 canvas.
2. `draw_start`, `draw_move` and `draw_end` events are sent to the server.
3. The server verifies that the sender is the current drawer and that the round is active.
4. The server broadcasts drawing events to the other clients.
5. Completed strokes are kept by the server so undo/clear can synchronize the canvas.

Game flow:

1. Host creates a room and configures settings.
2. Players join with the room code.
3. Players ready up.
4. Host starts the game.
5. Server chooses the first drawer and sends that drawer word choices.
6. Drawer selects a word; the server keeps the secret word authoritative.
7. Other players see blanks/hints and submit guesses.
8. Correct guesses receive points based on remaining time.
9. When time expires or every guesser succeeds, the round ends.
10. Drawer rotates and the next round starts.
11. After the configured number of rounds, the server broadcasts `game_over`.

## Important Socket.IO events

Room/lobby:
- `create_room`
- `join_room`
- `players_updated`
- `toggle_ready`
- `start_game`

Game:
- `game_started`
- `round_starting`
- `choose_word`
- `select_word`
- `word_selected`
- `word_started`
- `round_started`
- `timer_update`
- `hint_update`
- `round_end`
- `game_over`

Drawing:
- `draw_start`
- `draw_move`
- `draw_end`
- `draw_data`
- `canvas_clear`
- `draw_undo`
- `canvas_state`

Chat/guessing:
- `guess`
- `guess_result`
- `chat`
- `chat_message`

## Deployment (Render + Vercel)

The repository includes production configuration for a simple deployment with a React/Vite frontend on Vercel and the Socket.IO/Express backend on Render.

### Backend — Render

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** from the repository. The root `render.yaml` configures the backend automatically.
3. Render will install dependencies, start `npm start`, expose `/health`, and attach a 1 GB persistent disk for SQLite.
4. After the frontend is deployed, set the Render `FRONTEND_URL` environment variable to the exact Vercel URL. Multiple origins can be supplied as a comma-separated list.

The persistent disk is mounted at `/opt/render/project/data`, and `DATA_DIR` points SQLite there so the database survives service restarts/deploys. The current Socket.IO game state remains in memory. Keep the backend at one instance because SQLite is local to the persistent disk.

### Frontend — Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Vercel detects Vite and uses `npm run build` with `dist` output.
4. Add the environment variable:

```text
VITE_SERVER_URL=https://YOUR-BACKEND.onrender.com
```

5. Redeploy after setting the variable.

The included `frontend/vercel.json` keeps client-side routes working on refresh.

### Local production-style configuration

Copy the example files if needed:

```bash
cd backend
copy .env.example .env

cd ..\frontend
copy .env.example .env
```

The backend accepts `PORT`, `DATA_DIR`, and `FRONTEND_URL`. The frontend uses `VITE_SERVER_URL`.

**Live URL:** Add the deployed frontend URL here after deployment.

## Code walkthrough points

Be ready to explain:
- Why the server is authoritative for the secret word and score.
- Why Socket.IO is used for drawing, chat and game-state events.
- How the canvas converts mouse coordinates to canvas coordinates.
- How strokes are stored for undo/clear.
- How the round timer is controlled by the server.
- How drawer rotation works.
- How guesses are normalized with `trim()` and `toLowerCase()`.
- Why the WebSocket backend should not be hosted as a normal Vercel/Netlify serverless function.


## Added multiplayer features

- Public and private room visibility
- Public-room discovery and random public-room joining
- Join/leave system messages in the lobby and game chat
- Winner celebration with animated confetti on game over


## Room sharing

- **Public rooms** appear in the public room list while the lobby is open.
- **Private rooms** are invite/code based and are not listed publicly.
- In a room lobby, use **Copy Link** or **Share** to invite another player.
- The invite URL uses the room code as a query parameter, so opening it pre-fills the room code on the landing page.
- The browser's native Web Share API is used when available; otherwise Share falls back to copying the invite link.

## Additional features
- Word categories: All, Animals, Objects, Food, Places, Nature, People, and Fantasy.
- Host moderation: Kick or Ban players from the lobby or active game.
- Banned player names cannot rejoin the same room.
- Error notifications appear as dismissible animated banners at the top of the screen.


## Database

The project uses SQLite with `better-sqlite3`. The database is created automatically at `backend/data/skribbl.sqlite`.

Tables:
- `rooms` — room code, visibility, configured settings and lifecycle status
- `room_players` — players, ready state, scores and join/leave history
- `banned_players` — room-specific host bans
- `words` — categorized drawing words

Active drawing strokes, timers and Socket.IO connection IDs remain in memory because they are transient real-time state. Persistent room metadata and the word list are stored in SQLite.

You can verify the database after starting the backend at `http://localhost:5000/api/db-status`.


### Room & Lobby requirements
- Host creates a room with configurable player count, rounds, draw time, word count, hints, and category.
- Players join public rooms by room code or discoverable public-room list; random public-room join is supported.
- Private rooms are not listed publicly and require the host-generated invite link.
- Lobby shows players and ready status; the host starts the game after the lobby requirements are met.
- Invite links contain a private-room token and are used for private-room access.
