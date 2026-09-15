
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { socket } from "./socket";
import DrawingCanvas from "./components/DrawingCanvas";

interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

interface Settings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  category: string;
}

interface Message {
  playerId: string;
  playerName: string;
  text: string;
  system?: boolean;
}

const defaultSettings: Settings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hints: 3,
  category: "all",
};

function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [publicRooms, setPublicRooms] = useState<Array<{ roomId: string; hostName: string; playerCount: number; maxPlayers: number; rounds: number }>>([]);
  const [currentRoom, setCurrentRoom] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [error, setError] = useState("");

  const [phase, setPhase] = useState<"LOBBY" | "CHOOSING_WORD" | "PLAYING" | "ROUND_END" | "GAME_OVER">("LOBBY");
  const [round, setRound] = useState(0);
  const [currentDrawerId, setCurrentDrawerId] = useState("");
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [selectedWord, setSelectedWord] = useState("");
  const [wordPattern, setWordPattern] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [guess, setGuess] = useState("");
  const [winner, setWinner] = useState<Player | null>(null);
  const [gameOver, setGameOver] = useState<Player[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [confettiKey, setConfettiKey] = useState(0);

  const isDrawer = socket.id === currentDrawerId;
  const currentPlayer = players.find((p) => p.id === socket.id);
  const isHost = socket.id === players[0]?.id;
  const drawer = players.find((p) => p.id === currentDrawerId);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  useEffect(() => {
    const roomFromLink = new URLSearchParams(window.location.search).get("room");
    const inviteFromLink = new URLSearchParams(window.location.search).get("invite");
    if (roomFromLink) setRoomCode(roomFromLink.trim().toUpperCase());
    if (inviteFromLink) setInviteToken(inviteFromLink);
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomLeft = (data: { message?: string }) => {
      setCurrentRoom("");
      setPlayers([]);
      setMessages([]);
      setCurrentDrawerId("");
      setWordChoices([]);
      setSelectedWord("");
      setWordPattern("");
      setGuess("");
      setPhase("LOBBY");
      setError("");
      if (data.message) setShareMessage(data.message);
    };

    const onModeration = (data: { action: string; message: string }) => {
      setCurrentRoom("");
      setPhase("LOBBY");
      setError(data.message || "You were removed from the room.");
    };

    const onRoom = (data: { roomId: string; players: Player[]; settings: Settings; visibility?: "public" | "private"; inviteToken?: string | null }) => {
      setCurrentRoom(data.roomId);
      setPlayers(data.players || []);
      setSettings(data.settings || defaultSettings);
      setVisibility(data.visibility || "private");
      if (data.inviteToken) setInviteToken(data.inviteToken);
      setError("");
    };

    const onPlayers = (data: { players: Player[] }) => setPlayers(data.players || []);

    const onPublicRooms = (data: { rooms: typeof publicRooms }) => setPublicRooms(data.rooms || []);

    const onSystemMessage = (data: { text: string }) => {
      setMessages((prev) => [
        ...prev.slice(-49),
        { playerId: "", playerName: "", text: data.text, system: true },
      ]);
    };

    const onGameStarted = (data: { round: number; drawerId: string; players: Player[] }) => {
      setPhase("CHOOSING_WORD");
      setRound(data.round);
      setCurrentDrawerId(data.drawerId);
      setPlayers(data.players || []);
      setWordChoices([]);
      setSelectedWord("");
      setWordPattern("");
      setTimeRemaining(settings.drawTime);
      setMessages([]);
      setWinner(null);
      setGameOver([]);
    };

    const onRoundStarting = (data: { round: number; totalRounds: number; drawerId: string; drawTime: number; timerStarted?: boolean }) => {
      setPhase("CHOOSING_WORD");
      setRound(data.round);
      setCurrentDrawerId(data.drawerId);
      // Do not display the drawing countdown while the drawer is choosing.
      setTimeRemaining(0);
      setWordChoices([]);
      setSelectedWord("");
      setWordPattern("");
    };

    const onChooseWord = (data: { words: string[] }) => {
      setPhase("CHOOSING_WORD");
      setWordChoices(data.words || []);
    };

    // This event is intentionally sent only to the drawer by the server.
    const onWordSelected = (data: { word: string }) => {
      setSelectedWord(data.word);
      setPhase("PLAYING");
    };

    // Everyone else receives only the word length/pattern, never the actual word.
    const onWordStarted = (data: { wordLength: number }) => {
      setWordPattern(Array(data.wordLength).fill("_").join(" "));
      // The server sends this event to everyone after the drawer receives
      // the private word_selected event. Do not clear selectedWord here,
      // otherwise the drawer's word disappears immediately.
      setPhase("PLAYING");
    };

    const onRoundStarted = (data: { round: number; drawerId: string; drawTime: number }) => {
      setPhase("PLAYING");
      setRound(data.round);
      setCurrentDrawerId(data.drawerId);
      setTimeRemaining(data.drawTime);
    };

    const onTimer = (data: { timeRemaining: number }) => setTimeRemaining(data.timeRemaining);
    const onHint = (data: { pattern: string }) => setWordPattern(data.pattern);

    const onGuessResult = (data: { correct: boolean; playerName: string; points: number }) => {
      if (data.correct) {
        setMessages((prev) => [
          ...prev,
          { playerId: "", playerName: "🎉", text: `${data.playerName} guessed correctly (+${data.points})`, system: true },
        ]);
      } else {
        setError("That's not the word. Try again!");
        window.setTimeout(() => setError(""), 1600);
      }
    };

    const onChat = (data: Message) => setMessages((prev) => [...prev.slice(-49), data]);

    const onRoundEnd = (data: { word: string; players: Player[] }) => {
      setPhase("ROUND_END");
      setPlayers(data.players || []);
      setSelectedWord(data.word);
      setWordPattern(data.word);
      setMessages((prev) => [
        ...prev,
        { playerId: "", playerName: "⏱️", text: `Round ended. The word was "${data.word}".`, system: true },
      ]);
    };

    const onGameOver = (data: { winner: Player | null; leaderboard: Player[] }) => {
      const leaderboard = data.leaderboard || [];
      const winningPlayer = data.winner || leaderboard[0] || null;
      setWinner(winningPlayer);
      setGameOver(leaderboard);
      setPlayers(leaderboard);
      setConfettiKey((key) => key + 1);
      setShowConfetti(true);
      setPhase("GAME_OVER");
      window.setTimeout(() => setShowConfetti(false), 10000);
    };

    const onJoinResult = (data: { ok: boolean; message?: string }) => {
      if (data.ok) {
        setError("");
      } else {
        setError(data.message || "Unable to join room");
      }
    };
    const onError = (data: { message: string }) => setError(data.message);
    const onConnectError = () => setError("Unable to connect to the game server. Check that the backend is running.");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_created", onRoom);
    socket.on("room_joined", onRoom);
    socket.on("players_updated", onPlayers);
    socket.on("public_rooms", onPublicRooms);
    socket.on("system_message", onSystemMessage);
    socket.on("game_started", onGameStarted);
    socket.on("round_starting", onRoundStarting);
    socket.on("choose_word", onChooseWord);
    socket.on("word_selected", onWordSelected);
    socket.on("word_started", onWordStarted);
    socket.on("round_started", onRoundStarted);
    socket.on("timer_update", onTimer);
    socket.on("hint_update", onHint);
    socket.on("guess_result", onGuessResult);
    socket.on("chat_message", onChat);
    socket.on("round_end", onRoundEnd);
    socket.on("game_over", onGameOver);
    socket.on("error_message", onError);
    socket.on("join_result", onJoinResult);
    socket.on("connect_error", onConnectError);
    socket.on("moderation_result", onModeration);
    socket.on("room_left", onRoomLeft);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_created", onRoom);
      socket.off("room_joined", onRoom);
      socket.off("players_updated", onPlayers);
      socket.off("public_rooms", onPublicRooms);
      socket.off("system_message", onSystemMessage);
      socket.off("game_started", onGameStarted);
      socket.off("round_starting", onRoundStarting);
      socket.off("choose_word", onChooseWord);
      socket.off("word_selected", onWordSelected);
      socket.off("word_started", onWordStarted);
      socket.off("round_started", onRoundStarted);
      socket.off("timer_update", onTimer);
      socket.off("hint_update", onHint);
      socket.off("guess_result", onGuessResult);
      socket.off("chat_message", onChat);
      socket.off("round_end", onRoundEnd);
      socket.off("game_over", onGameOver);
      socket.off("error_message", onError);
      socket.off("join_result", onJoinResult);
      socket.off("connect_error", onConnectError);
      socket.off("moderation_result", onModeration);
      socket.off("room_left", onRoomLeft);
    };
  }, [settings.drawTime]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const createRoom = () => {
    if (!name.trim()) return setError("Please enter your name");
    socket.emit("create_room", { hostName: name.trim(), settings, visibility });
  };

  const joinPublicRoom = () => {
    if (!name.trim()) return setError("Please enter your name");
    socket.emit("join_public_room", { playerName: name.trim() });
  };

  const joinRoom = (code?: string) => {
    const cleanName = String(name || "").trim();
    // Never treat a browser click event as a room code.
    const requestedCode = typeof code === "string" ? code : String(roomCode || "");
    const cleanCode = requestedCode.trim().replace(/\s+/g, "").toUpperCase();
    if (!cleanName) { setError("Please enter your name"); return; }
    if (!cleanCode) { setError("Please enter a room code"); return; }

    setError("");
    setRoomCode(cleanCode);

    const emitJoin = () => {
      socket.emit("join_room", { roomId: cleanCode, playerName: cleanName, inviteToken: inviteToken || undefined });
    };

    if (socket.connected) {
      emitJoin();
      return;
    }

    const handleConnect = () => {
      socket.off("connect", handleConnect);
      emitJoin();
    };
    socket.once("connect", handleConnect);
    socket.connect();
  };

  const leaveRoom = () => {
    if (!currentRoom || isHost) return;
    if (window.confirm("Leave this room? You can rejoin later with the room code.")) {
      socket.emit("leave_room", { roomId: currentRoom });
    }
  };

  const toggleReady = () => socket.emit("toggle_ready", { roomId: currentRoom });
  const startGame = () => socket.emit("start_game", { roomId: currentRoom });
  const selectWord = (word: string) => socket.emit("select_word", { roomId: currentRoom, word });
  const moderatePlayer = (playerId: string, action: "kick" | "ban") => {
    const target = players.find((p) => p.id === playerId);
    if (!target || !isHost) return;
    const verb = action === "ban" ? "ban" : "kick";
    if (window.confirm(`${verb === "ban" ? "Ban" : "Kick"} ${target.name}?`)) {
      socket.emit("moderate_player", { roomId: currentRoom, playerId, action });
    }
  };

  const sendGuess = (event?: FormEvent) => {
    event?.preventDefault();
    const text = guess.trim();
    if (!text || phase !== "PLAYING") return;
    socket.emit("guess", { roomId: currentRoom, text });
    setGuess("");
  };

  const initial = (value: string) => value.charAt(0).toUpperCase();

  const inviteLink = currentRoom
    ? visibility === "private" && inviteToken
      ? `${window.location.origin}/?room=${encodeURIComponent(currentRoom)}&invite=${encodeURIComponent(inviteToken)}`
      : `${window.location.origin}/?room=${encodeURIComponent(currentRoom)}`
    : "";

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setShareMessage("Invite link copied!");
    } catch {
      setShareMessage("Copy failed — please copy the link manually.");
    }
    window.setTimeout(() => setShareMessage(""), 2200);
  };

  const shareInviteLink = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Skribbl game",
          text: `Join my ${visibility} Skribbl room (${currentRoom})`,
          url: inviteLink,
        });
        return;
      } catch {
        // User cancelled the native share sheet.
        return;
      }
    }
    await copyInviteLink();
  };

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-[#0b0b12] text-white">
        {error && <div className="fixed left-1/2 top-4 z-[200] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur animate-slide-down"><span className="text-lg">⚠️</span><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">✕</button></div>}
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
          <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl lg:grid-cols-2">
            <div className="hidden flex-col justify-between bg-gradient-to-br from-purple-600/20 to-blue-600/10 p-10 lg:flex">
              <div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 text-2xl">🎨</div>
                <h1 className="mt-8 text-5xl font-black leading-tight">Draw.<br />Guess.<br /><span className="text-purple-300">Have Fun.</span></h1>
                <p className="mt-6 max-w-md text-gray-400">A real-time multiplayer drawing and guessing game.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm text-gray-500">
                <div className="rounded-2xl bg-white/[0.04] p-4">🎨<br />Draw</div>
                <div className="rounded-2xl bg-white/[0.04] p-4">💡<br />Guess</div>
                <div className="rounded-2xl bg-white/[0.04] p-4">🏆<br />Win</div>
              </div>
            </div>

            <div className="p-8 sm:p-10">
              <h2 className="text-3xl font-bold">Welcome 👋</h2>
              <p className="mt-2 text-sm text-gray-500">Create a room or join an existing game.</p>

              <label className="mt-7 block text-sm font-medium text-gray-300">Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-purple-500" />

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">Room settings</h3>
                  <span className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-300">Customize</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="col-span-2 text-xs text-gray-500">
                    Word category
                    <select value={settings.category} onChange={(e) => setSettings((s) => ({ ...s, category: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-purple-500">
                      <option value="all">🎲 All categories</option>
                      <option value="animals">🐾 Animals</option>
                      <option value="objects">📦 Objects</option>
                      <option value="food">🍕 Food</option>
                      <option value="places">🌍 Places</option>
                      <option value="nature">🌿 Nature</option>
                      <option value="people">🧑 People</option>
                      <option value="fantasy">🧙 Fantasy</option>
                    </select>
                  </label>
                  {([
                    ["maxPlayers", "Max players", 2, 20],
                    ["rounds", "Rounds", 2, 10],
                    ["drawTime", "Draw time (sec)", 15, 240],
                    ["wordCount", "Words to choose", 1, 5],
                    ["hints", "Hints", 0, 5],
                  ] as const).map(([key, label, min, max]) => (
                    <label key={key} className="text-xs text-gray-500">
                      {label}
                      <input type="number" min={min} max={max} value={settings[key]}
                        onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white" />
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1">
                <button onClick={() => setVisibility("private")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${visibility === "private" ? "bg-purple-500 text-white" : "text-gray-500"}`}>🔒 Private Room</button>
                <button onClick={() => setVisibility("public")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${visibility === "public" ? "bg-purple-500 text-white" : "text-gray-500"}`}>🌐 Public Room</button>
              </div>
              <button onClick={createRoom} className="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-3.5 font-bold">Create {visibility === "public" ? "Public" : "Private"} Room</button>

              <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-white/10" /><span className="text-xs text-gray-600">OR</span><div className="h-px flex-1 bg-white/10" /></div>

              <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="Room code"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-white outline-none focus:border-blue-500" />
              <button type="button" onClick={() => joinRoom()} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 font-semibold hover:bg-white/10">Join Existing Room</button>

              <button onClick={joinPublicRoom} className="mt-3 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-3.5 font-semibold text-purple-200 hover:bg-purple-500/20">🌐 Join Random Public Room</button>

              {publicRooms.length > 0 && <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">🌐 Public Rooms</h3><span className="text-xs text-gray-500">{publicRooms.length} available</span></div>
                <div className="space-y-2">
                  {publicRooms.slice(0, 5).map((room) => <button key={room.roomId} onClick={() => { setInviteToken(""); setRoomCode(room.roomId); joinRoom(room.roomId); }} className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-3 text-left hover:bg-white/[0.08]">
                    <span className="font-mono font-bold text-purple-300">{room.roomId}</span><span className="min-w-0 flex-1 truncate text-sm">{room.hostName}'s room</span><span className="text-xs text-gray-500">{room.playerCount}/{room.maxPlayers}</span>
                  </button>)}
                </div>
              </div>}

              <div className="mt-5 text-center text-xs text-gray-500">
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
                {connected ? "Server connected" : "Server disconnected"}
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "GAME_OVER") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0b0b12] px-6 py-12 text-white">
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
          {Array.from({ length: 120 }, (_, i) => (
            <span
              key={`${confettiKey}-${i}`}
              className="confetti-piece"
              style={{
                left: `${(i * 47) % 100}%`,
                animationDelay: `${(i % 20) * 0.05}s`,
                animationDuration: `${3 + (i % 8) * 0.35}s`,
                width: `${7 + (i % 4) * 2}px`,
                height: `${10 + (i % 5) * 3}px`,
                transform: `rotate(${(i * 43) % 360}deg)`,
                animationName: "confetti-fall",
                animationTimingFunction: "cubic-bezier(.2,.7,.3,1)",
                animationFillMode: "forwards",
              }}
            />
          ))}
        </div>
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="text-6xl">🏆</div>
          <h1 className="mt-4 text-4xl font-black">Game Over!</h1>
          <p className="mt-2 text-gray-400">{winner ? `${winner.name} wins with ${winner.score} points!` : "Thanks for playing!"}</p>
          <div className="mx-auto mt-8 max-w-xl space-y-2 text-left">
            {gameOver.map((player, index) => (
              <div key={player.id} className="flex items-center gap-4 rounded-2xl bg-white/[0.04] p-4">
                <span className="w-8 text-xl font-black">{index + 1}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 font-bold">{initial(player.name)}</div>
                <span className="flex-1 font-semibold">{player.name}</span>
                <span className="font-bold text-purple-300">{player.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-gray-500">Room: {currentRoom}. Refresh to create or join another room.</p>
        </div>
      </div>
    );
  }

  if (phase === "LOBBY") {
    return (
      <div className="min-h-screen bg-[#0b0b12] px-6 py-10 text-white">
        {error && <div className="fixed left-1/2 top-4 z-[200] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur animate-slide-down"><span className="text-lg">⚠️</span><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">✕</button></div>}
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <div><h1 className="text-2xl font-black">🎨 Skribbl Clone</h1><p className="text-sm text-gray-500">Game Lobby</p></div>
            <div className="rounded-full bg-green-500/10 px-4 py-2 text-sm text-green-400">● Connected</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs text-gray-500">Room code</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-3xl font-black tracking-[0.25em]">{currentRoom}</span>
              <button onClick={() => navigator.clipboard.writeText(currentRoom)} className="rounded-lg bg-white/5 px-3 py-2 text-sm">Copy</button>
            </div>
            <div className="mt-2 text-sm text-gray-500">{visibility === "public" ? "🌐 Public room — anyone can discover and join while the lobby is open." : "🔒 Private room — invite-only. Players must use the host's invite link."}</div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Invite link</p>
                  <p className="mt-1 truncate font-mono text-sm text-purple-200">{inviteLink}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={copyInviteLink} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">📋 Copy Link</button>
                  <button onClick={shareInviteLink} className="rounded-xl bg-purple-500 px-3 py-2 text-sm font-semibold hover:bg-purple-400">🔗 Share</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-600">Share this link by WhatsApp, Telegram, email, or any other app supported by your browser.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">Players</h2><p className="text-sm text-gray-500">Everyone should be ready before starting.</p></div><span className="text-sm text-gray-500">{players.filter(p => p.ready).length} ready</span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 font-bold">{initial(p.name)}</div>
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name} {p.id === players[0]?.id && "👑"}</p><p className="text-xs text-gray-500">{p.id === socket.id ? "You" : p.id === players[0]?.id ? "Host" : "Player"}</p></div>
                    <div className="flex items-center gap-2">
                      {isHost && p.id !== socket.id && <>
                        <button type="button" onClick={() => moderatePlayer(p.id, "kick")} className="rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20">Kick</button>
                        <button type="button" onClick={() => moderatePlayer(p.id, "ban")} className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20">Ban</button>
                      </>}
                      <span className={`rounded-full px-3 py-1 text-xs ${p.ready ? "bg-green-500/10 text-green-400" : "bg-white/5 text-gray-500"}`}>{p.ready ? "Ready" : "Waiting"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Game Settings</h2><span className="rounded-full border border-purple-400/20 bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300">🔒 Host configured</span></div>
              <p className="mt-1 text-xs text-gray-500">These settings are controlled by the room host and cannot be changed by players.</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Players</span><b>{settings.maxPlayers}</b></div>
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Rounds</span><b>{settings.rounds}</b></div>
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Draw time</span><b>{settings.drawTime}s</b></div>
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Word choices</span><b>{settings.wordCount}</b></div>
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Hints</span><b>{settings.hints}</b></div>
                <div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span className="text-gray-500">Category</span><b className="capitalize">{settings.category === "all" ? "All" : settings.category}</b></div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div><p className="font-semibold">{currentPlayer?.ready ? "You're ready! 🎉" : "Ready to play?"}</p><p className="text-sm text-gray-500">{isHost ? "As host, you can start the game." : "Wait for the host."}</p></div>
            <div className="flex gap-3">
              <button onClick={toggleReady} className="rounded-xl bg-purple-500 px-5 py-3 font-semibold">{currentPlayer?.ready ? "I'm Not Ready" : "Ready"}</button>
              {!isHost && <button type="button" onClick={leaveRoom} className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 font-semibold text-red-300 hover:bg-red-500/20">Leave Room</button>}
              {isHost && <button onClick={startGame} disabled={players.length < 2} className="rounded-xl bg-white px-5 py-3 font-bold text-black disabled:opacity-40">Start Game →</button>}
            </div>
          </div>
          {shareMessage && <div className="mt-4 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-400">✓ {shareMessage}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b12] px-4 py-5 text-white">
      {error && <div className="fixed left-1/2 top-4 z-[200] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur animate-slide-down"><span className="text-lg">⚠️</span><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">✕</button></div>}
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex items-center justify-between">
          <div><h1 className="text-xl font-black">🎨 Skribbl Clone</h1><p className="text-xs text-gray-500">Round {round} / {settings.rounds}</p></div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2"><span className="text-xs text-gray-500">Room </span><b className="font-mono tracking-widest text-purple-300">{currentRoom}</b></div>
            {!isHost && <button type="button" onClick={leaveRoom} className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20">↪ Leave</button>}
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_310px]">
          <main className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Current drawer</p>
                <h2 className="text-xl font-bold">🎨 {drawer?.name || "Waiting..."}</h2>
                <div className="mt-2 text-lg font-bold tracking-widest text-purple-300">
                  {isDrawer ? (selectedWord ? `Draw: ${selectedWord}` : "Choose a word") : wordPattern}
                </div>
              </div>
              <div className="rounded-2xl bg-purple-500/10 px-5 py-3 text-center">
                <p className="text-xs text-gray-500">Time</p>
                <p className={`text-2xl font-black ${phase === "CHOOSING_WORD" ? "text-gray-400" : timeRemaining <= 10 ? "text-red-400" : "text-purple-300"}`}>
                  {phase === "CHOOSING_WORD" ? "—" : `${timeRemaining}s`}
                </p>
              </div>
            </div>

            {isDrawer && phase === "CHOOSING_WORD" && (
              <div className="mb-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5">
                <h3 className="font-bold">✨ Choose a word</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {wordChoices.map((word) => <button key={word} onClick={() => selectWord(word)} className="rounded-xl bg-white/10 px-4 py-4 font-bold capitalize hover:bg-purple-500/30">{word}</button>)}
                </div>
              </div>
            )}

            <DrawingCanvas isDrawer={isDrawer && phase === "PLAYING"} roomId={currentRoom} />
          </main>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="mb-4 font-bold">🏆 Leaderboard</h2>
              <div className="space-y-2">
                {sortedPlayers.map((p, i) => <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-3"><span className="w-5 text-gray-500">{i + 1}</span><span className="flex-1 truncate">{p.name}{p.id === currentDrawerId ? " 🎨" : ""}</span><b className="text-purple-300">{p.score}</b>{isHost && p.id !== socket.id && <div className="flex gap-1"><button type="button" onClick={() => moderatePlayer(p.id, "kick")} className="rounded-md px-1.5 py-1 text-[10px] text-amber-300 hover:bg-amber-500/10">Kick</button><button type="button" onClick={() => moderatePlayer(p.id, "ban")} className="rounded-md px-1.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10">Ban</button></div>}</div>)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="mb-4 font-bold">💬 Chat & Guess</h2>
              <div className="h-64 overflow-y-auto rounded-2xl bg-black/20 p-3">
                {messages.length === 0 && <p className="text-center text-xs text-gray-600">Messages and correct guesses appear here.</p>}
                {messages.map((m, i) => <div key={i} className={`mb-2 text-sm ${m.system ? "text-green-400" : "text-gray-300"}`}>{m.system ? `ℹ️ ${m.text}` : <><b>{m.playerName}</b>{": "}{m.text}</>}</div>)}
              </div>
              <form onSubmit={sendGuess} className="mt-3 flex gap-2">
                <input value={guess} onChange={(e) => setGuess(e.target.value)} disabled={phase !== "PLAYING"} placeholder={isDrawer ? "You are drawing..." : "Type your guess..."} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none disabled:opacity-50" />
                <button disabled={phase !== "PLAYING" || isDrawer} className="rounded-xl bg-purple-500 px-4 font-bold disabled:opacity-40">Send</button>
              </form>
              {!isDrawer && <p className="mt-2 text-center text-[11px] text-gray-600">Exact word matching • trim + case-insensitive</p>}
            </div>
          </aside>
        </div>


      </div>
    </div>
  );
}

export default App;
