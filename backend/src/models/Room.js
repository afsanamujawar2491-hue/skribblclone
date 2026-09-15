
class Room {
  constructor(id, hostId, hostName, settings, visibility = "private") {
    this.id = id;
    this.hostId = hostId;
    this.players = [{ id: hostId, name: hostName, ready: false }];
    this.settings = settings;
    this.visibility = visibility === "public" ? "public" : "private";
    this.inviteToken = null;
    this.bannedNames = new Set();

    this.phase = "LOBBY";
    this.round = 0;
    this.drawerIndex = 0;
    this.currentDrawerId = null;
    this.currentWord = null;
    this.wordChoices = [];
    this.timeRemaining = 0;

    this.scores = { [hostId]: 0 };
    this.correctGuesses = new Set();

    this.strokes = [];
    this.currentStroke = null;

    this.roundTimer = null;
    this.hintTimer = null;
    this.wordChoiceTimeout = null;
    this.roundStartedAt = null;
    this.hintsRevealed = 0;
  }

  addPlayer(player) {
    this.players.push(player);
    this.scores[player.id] = 0;
  }

  removePlayer(playerId) {
    this.players = this.players.filter((player) => player.id !== playerId);
    delete this.scores[playerId];
    this.correctGuesses.delete(playerId);
  }
}

module.exports = Room;
