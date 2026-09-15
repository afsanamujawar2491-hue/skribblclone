# 🎨 Skribbl Clone

A full-stack, real-time multiplayer drawing and guessing game inspired by **skribbl.io**. Players can create or join public and private rooms, take turns drawing words, guess in real time, earn points, and compete on a live leaderboard.

The project was built as a full-stack application using **React + TypeScript + Vite** on the frontend and **Node.js + Express + Socket.IO + SQLite** on the backend.

## 🚀 Live Demo

**Frontend:** https://skribblclone-kappa.vercel.app

**Backend:** `https://skribblclone-backend-eh67.onrender.com/`  
> Replace the backend URL above with your deployed Render service URL before publishing the README.

---

## ✨ Features

### 🏠 Rooms & Lobby
- Create a multiplayer room with configurable settings
- Join rooms using a 6-character room code
- Public rooms can be discovered and joined
- Private rooms use secure invite links
- Player list with ready/unready status
- Host-controlled game start
- Configurable maximum players, rounds, draw time, word count, hints, and word category
- Host settings become read-only after joining

### 🎮 Multiplayer Game
- Turn-based drawing rounds
- One player draws while everyone else guesses
- Drawer chooses a word from multiple options
- Drawing timer starts after the word is selected
- Automatic drawer rotation between rounds
- Automatic game completion after all configured rounds
- Winner and final leaderboard displayed at game end

### 🖌️ Real-Time Drawing
- HTML5 Canvas with custom drawing logic
- Brush/pen drawing
- Multiple colors
- Adjustable brush size
- Eraser support
- Undo
- Clear canvas
- Real-time stroke synchronization through Socket.IO
- Mouse, touch, and stylus support using Pointer Events
- Responsive canvas for desktop and mobile devices

### 💬 Guessing & Chat
- Real-time guesses
- Automatic word matching
- Case-insensitive and whitespace-tolerant matching
- Correct guesses award points
- Correct-guess notifications
- General room chat
- Drawer cannot submit guesses for their own word

### 💡 Hints
- Configurable number of hints
- Letters are progressively revealed during a round
- Hint timing is calculated from the configured drawing time

### 🛡️ Moderation
- Host can kick players
- Host can ban players
- Banned players cannot rejoin the room
- Host cannot remove themselves
- Players can leave a room without ending the game

### 💾 Database
SQLite persistence using `better-sqlite3` for:
- Room configuration and status
- Players
- Scores
- Ready state
- Banned players
- Categorized word list

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS |
| Drawing | HTML5 Canvas API |
| Real-time communication | Socket.IO |
| Backend | Node.js, Express |
| Database | SQLite with better-sqlite3 |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## 🏗️ Architecture

```text
                         ┌──────────────────────────┐
                         │       React Frontend     │
                         │     TypeScript + Vite    │
                         │                          │
                         │  Lobby / Game / Chat     │
                         │  HTML5 Canvas            │
                         └────────────┬─────────────┘
                                      │
                         Socket.IO / WebSocket
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │     Node.js Backend      │
                         │   Express + Socket.IO    │
                         │                          │
                         │  Room Management         │
                         │  Game State              │
                         │  Turns & Timer           │
                         │  Scoring                 │
                         │  Word Matching           │
                         │  Moderation              │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │          SQLite          │
                         │      better-sqlite3      │
                         │                          │
                         │ Rooms / Players / Words  │
                         │ Scores / Bans            │
                         └──────────────────────────┘
```

### Real-Time Drawing Flow

1. The drawer interacts with the HTML5 Canvas.
2. Pointer events capture the drawing coordinates.
3. The frontend sends drawing events through Socket.IO.
4. The backend validates that the sender is the current drawer.
5. The backend broadcasts stroke data to the other players in the room.
6. Each client renders the received stroke on its local canvas.
7. Undo and clear operations synchronize the canvas state across clients.

### Game State Flow

```text
LOBBY
  │
  ▼
CHOOSING_WORD
  │
  ▼
PLAYING
  │
  ▼
ROUND_END
  │
  ├── More rounds ──► Next Drawer
  │
  └── Final round ──► GAME_OVER
```

The server is authoritative for:
- Current room
- Players and host
- Current drawer
- Current word
- Round number
- Timer
- Correct guesses
- Scores
- Hints
- Game phase

This prevents clients from independently deciding game results.

---

## 🔌 Important Socket.IO Events

### Room & Lobby

| Event | Purpose |
|---|---|
| `create_room` | Create a new room |
| `join_room` | Join using a room code/invite |
| `join_public_room` | Join an available public room |
| `toggle_ready` | Toggle player ready state |
| `start_game` | Host starts the game |
| `leave_room` | Player leaves the room |
| `moderate_player` | Host kicks/bans a player |

### Game

| Event | Purpose |
|---|---|
| `round_starting` | Announces a new round |
| `choose_word` | Sends word choices to the drawer |
| `select_word` | Drawer selects the word |
| `word_selected` | Sends selected word only to drawer |
| `word_started` | Starts the drawing phase for clients |
| `timer_update` | Synchronizes countdown |
| `hint_update` | Sends progressive hints |
| `round_end` | Ends the current round |
| `game_over` | Ends the complete game |

### Drawing

| Event | Purpose |
|---|---|
| `draw_start` | Starts a stroke |
| `draw_move` | Sends stroke movement |
| `draw_end` | Finishes a stroke |
| `draw_data` | Broadcasts drawing data |
| `canvas_clear` | Clears the canvas |
| `draw_undo` | Removes the latest stroke |
| `canvas_state` | Synchronizes the complete canvas state |

### Chat & Guessing

| Event | Purpose |
|---|---|
| `guess` | Submit a word guess |
| `guess_result` | Returns guess correctness and points |
| `chat` | Send a chat message |
| `chat_message` | Broadcast chat messages |

---

## 📁 Project Structure

```text
skribbl-clone/
│
├── backend/
│   ├── src/
│   │   ├── data/
│   │   │   └── words.js
│   │   ├── models/
│   │   │   └── Room.js
│   │   ├── database.js
│   │   ├── server.js
│   │   └── README_DATABASE.md
│   │
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   └── DrawingCanvas.tsx
│   │   ├── assets/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── socket.ts
│   │
│   ├── .env.example
│   ├── vercel.json
│   ├── package.json
│   └── package-lock.json
│
├── render.yaml
├── .gitignore
└── README.md
```

---

## 🛠️ Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/afsanamujawar2491-hue/skribbl-clone.git
cd skribbl-clone
```

### 2. Start the backend

```bash
cd backend
npm install
```

Create a `.env` file:

```env
NODE_ENV=development
PORT=5000
DATA_DIR=./data
FRONTEND_URL=http://localhost:5173
```

Start the server:

```bash
npm start
```

The backend will run at:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/health
```

### 3. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_SERVER_URL=http://localhost:5000
```

Start Vite:

```bash
npm run dev
```

Open the local application at the URL shown by Vite, normally:

```text
http://localhost:5173
```

---

## 🌐 Production Deployment

The application uses a split deployment architecture:

```text
Vercel
   │
   │ HTTPS
   ▼
React + Vite Frontend
   │
   │ Socket.IO / WebSocket
   ▼
Render
   │
   ├── Express API
   ├── Socket.IO server
   └── SQLite
```

### Frontend — Vercel

Set the following production environment variable in Vercel:

```env
VITE_SERVER_URL=https://skribblclone-backend-eh67.onrender.com
```

**Important:** Vite environment variables are embedded during the frontend build. After changing `VITE_SERVER_URL`, redeploy the frontend.

### Backend — Render

Recommended configuration:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

Environment variables:

```env
NODE_ENV=production
PORT=5000
DATA_DIR=/tmp/skribbl-data
FRONTEND_URL=https://skribblclone-kappa.vercel.app
```

### Why the WebSocket backend is separate

The frontend is hosted on Vercel, while the Socket.IO server runs on Render. The browser must therefore connect to the Render backend URL instead of attempting to connect to the Vercel frontend URL.

For example:

```text
Frontend:
https://skribblclone-kappa.vercel.app

WebSocket backend:
https://skribblclone-backend-eh67.onrender.com```

The frontend uses:

```env
VITE_SERVER_URL=https://skribblclone-backend-eh67.onrender.com
```

---

## 💾 SQLite Deployment Note

The application uses SQLite for persistence.

When deployed on a free Render web service, the local filesystem is not persistent across every restart/redeploy. Therefore, SQLite data stored on the free service can be reset when the service is restarted or redeployed.

The live multiplayer game state is maintained in server memory while the server is running.

For durable production persistence, the application can be migrated to:
- Render PostgreSQL
- Another managed PostgreSQL provider
- A Render persistent disk with an appropriate paid service

The database layer is isolated in `backend/src/database.js`, making this migration easier.

---

## 📱 Mobile Support

The drawing canvas supports:
- Desktop mouse input
- Mobile touch input
- Stylus input

The canvas uses **Pointer Events** instead of mouse-only events:

```text
pointerdown
pointermove
pointerup
pointercancel
```

and disables browser touch scrolling over the canvas while drawing.

This allows the same drawing implementation to work across desktop and mobile devices.

---

## 🔐 Security & Validation

The backend is authoritative for important game actions.

Examples:
- Only the host can start a game.
- Only the current drawer can select a word.
- Only the current drawer can draw.
- Private rooms require a valid invite token.
- Duplicate player names are rejected within a room.
- Banned players cannot rejoin.
- Room settings are normalized and constrained by server-side limits.
- Guess validation happens on the server.
- The selected word is sent privately to the drawer rather than exposed to other players.

Private invite tokens are generated server-side using Node's cryptographic random-byte generator.

---

## 🎯 Scoring

Points are awarded when a player correctly guesses the current word.

The score is influenced by how quickly the word is guessed, rewarding faster guesses.

The server stores and broadcasts the authoritative score so all connected players see the same leaderboard.

---

## 🧪 Useful Commands

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

### Backend

```bash
npm start
npm run dev
```

---

## 📝 Assignment Requirements Covered

The implementation covers the major requirements of the full-stack Skribbl clone assignment:

- ✅ Multiplayer rooms
- ✅ Public and private rooms
- ✅ Room creation with configurable settings
- ✅ Join by room code/invite
- ✅ Lobby and ready-up
- ✅ Host-controlled game start
- ✅ Turn-based drawing
- ✅ Real-time drawing synchronization
- ✅ HTML5 Canvas
- ✅ Word selection
- ✅ Guessing and word matching
- ✅ Scoring
- ✅ Leaderboard
- ✅ Game-over state
- ✅ Brush and color controls
- ✅ Brush size
- ✅ Eraser
- ✅ Undo
- ✅ Clear canvas
- ✅ Hints
- ✅ Chat
- ✅ Countdown timer
- ✅ Word categories
- ✅ Host kick/ban moderation
- ✅ Mobile drawing support
- ✅ Public deployment
- ✅ Socket.IO real-time communication
- ✅ SQLite database integration

---

## 🧠 Key Design Decisions

### Why Socket.IO?

Socket.IO provides a convenient abstraction over WebSockets and supports event-based real-time communication. This makes it well suited for:
- Drawing synchronization
- Room updates
- Chat
- Guesses
- Timers
- Game state changes

### Why Canvas?

HTML5 Canvas provides direct control over drawing operations and makes it possible to transmit compact stroke information rather than continuously sending screenshots.

### Why server-authoritative game logic?

The server controls the current word, drawer, timer, scoring, and round state. This reduces client-side cheating and keeps every connected client synchronized.

### Why SQLite?

SQLite is lightweight and requires no separate database server, making it a good fit for a small full-stack assignment while still demonstrating relational persistence.

---

## 🚧 Future Improvements

Possible extensions include:

- PostgreSQL for fully persistent cloud storage
- Spectator mode
- Votekick
- Multiple language word lists
- Custom host word lists
- Player avatars
- Replay of previous rounds
- More advanced anti-cheat validation
- Redis adapter for scaling Socket.IO across multiple backend instances
- Automated integration and end-to-end tests

---

## 👩‍💻 Author

**Afsana Mujawar**

Full-Stack Web Development Project

---

## 📄 License

This project was created for educational and assignment purposes.
