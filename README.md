# Skribbl Clone

A real-time multiplayer drawing and guessing game built for the full-stack assignment.

## Features

- Create rooms with configurable player count, rounds, drawing time, word count, hints, category, and public/private visibility
- Join by room code or invite link
- Public-room discovery and random public-room joining
- Private rooms are not listed publicly and require an invite link
- Lobby with player list, ready-up, and host-only start control
- Host kick/ban moderation
- Non-host players can leave a room
- Read-only room settings for players after the room is created
- Turn-based drawing with drawer-only secret word visibility
- Drawing timer starts after word selection
- HTML5 Canvas tools: brush, colors, size, eraser, undo, and clear
- Real-time drawing, chat, guessing, hints, scoring, leaderboard, and game-over winner screen
- Categorized words: All, Animals, Objects, Food, Places, Nature, People, and Fantasy
- Animated modern responsive UI
- Dismissible error messages displayed at the top of the screen

## Technology stack

- Frontend: React, TypeScript, Vite
- Canvas: HTML5 Canvas with custom drawing logic
- Backend: Node.js, Express
- Realtime communication: Socket.IO
- Database: SQLite using `better-sqlite3`

## Project structure

```text
skribbl-clone/
├── backend/
│   ├── src/
│   │   ├── database.js
│   │   ├── server.js
│   │   ├── models/Room.js
│   │   └── data/words.js
│   ├── data/                  # created automatically
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── socket.ts
│   │   └── components/DrawingCanvas.tsx
│   ├── vercel.json
│   └── package.json
└── render.yaml
```

## Run locally

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:5000`. SQLite is created automatically at `backend/data/skribbl.sqlite`.

### Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend normally runs on `http://localhost:5173`.

## Environment variables

### Backend

Copy `.env.example` to `.env` if required:

```text
PORT=5000
DATA_DIR=./data
FRONTEND_URL=http://localhost:5173
```

### Frontend

```text
VITE_SERVER_URL=http://localhost:5000
```

## Free deployment: Render + Vercel

This project is configured for a free-style deployment with:

- **Frontend:** Vercel
- **Backend:** Render Web Service
- **Database:** SQLite on the backend filesystem

### Important free-plan limitation

The Render free filesystem is ephemeral. SQLite will work while the service is running, but its data may be reset after a restart, redeploy, or service spin-down. The live rooms and game state are already held in memory, so multiplayer gameplay still works. For permanent database persistence, use a paid persistent disk or migrate to PostgreSQL.

### Deploy backend to Render

1. Push this repository to GitHub.
2. In Render, choose **New → Web Service** and connect the repository.
3. Set the root directory to `backend`.
4. Use these settings:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

5. Add the environment variable:

```text
NODE_ENV=production
```

6. Deploy and copy the Render backend URL, for example:

```text
https://your-skribbl-backend.onrender.com
```

The included `render.yaml` can also be used as a Render Blueprint. It does not request a paid persistent disk.

### Deploy frontend to Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Keep the build command as `npm run build`.
4. Set the environment variable:

```text
VITE_SERVER_URL=https://your-skribbl-backend.onrender.com
```

5. Deploy the frontend.

### Connect CORS

After Vercel provides the frontend URL, set this variable on Render:

```text
FRONTEND_URL=https://your-skribbl-frontend.vercel.app
```

Redeploy the backend after saving the variable.

### Final result

```text
Vercel React frontend
        │
        │ Socket.IO
        ▼
Render Node.js backend
        │
        ▼
SQLite database
```

## Database design

SQLite creates these tables automatically:

- `rooms` — room configuration and status
- `room_players` — players, ready state, scores, and join/leave records
- `banned_players` — room-specific bans
- `words` — categorized drawing words

Transient Socket.IO connection IDs, timers, active drawing strokes, and the current secret word remain in memory for real-time performance.

## Notes for evaluation

- The host is the only player who can start the game and moderate players.
- Only the drawer receives the actual selected word. Other players receive blanks and hints.
- The drawing timer begins after the drawer selects a word.
- Private room invite links should be shared with intended players only.
- For cross-device testing, use the deployed Vercel URL rather than a localhost URL.

## Health and database checks

```text
GET /health
GET /api/db-status
```

The health endpoint is used by Render. The database status endpoint can be used to confirm that SQLite initialized successfully.
