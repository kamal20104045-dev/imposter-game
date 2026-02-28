import { v4 as uuidv4 } from 'uuid';

class GameRoom {
  constructor(roomId, roomCode, ownerId) {
    this.id = roomId;
    this.code = roomCode;
    this.ownerId = ownerId;
    this.players = new Map(); // playerId -> { name, role, alive, isWordEnteringPlayer }
    this.gameStarted = false;

    // Session tracking (each word-enterer gets one session)
    this.sessions = [];            // ordered list of playerIds who will enter words
    this.sessionIndex = 0;         // index into sessions
    this.currentSession = 0;       // 1-based for UI
    this.totalSessions = 0;        // will be number of players at start

    // Round tracking within a session
    this.currentRound = 0;         // 1-based within session
    this.totalRounds = 3;          // rounds per session (from settings)

    // Current guess/word state
    this.secretWord = '';
    this.wordEnteringPlayerId = null;
    this.currentPhase = 'lobby'; // 'word-entering' | 'guessing' | 'voting' | 'reveal' | 'session-end' | 'game-over'
    this.currentGuessingPlayerId = null; // whose turn is it
    this.guessersOrder = [];      // ordered list for rotating turns
    this.turnsRemaining = 0;      // total passes left before voting

    // Voting state
    this.votes = new Map();       // voterId -> targetId
    this.voteResults = null;      // computed results after voting

    // Settings
    this.settings = {
      maxPlayers: 8,
      importerCount: 2,
      roundCount: 3
    };

    // Timers
    this.WORD_ENTERING_TIME_LIMIT = 30; // seconds for word entry
    this.GUESSING_TIME_LIMIT = 20; // seconds per player turn
    this.roundTimer = null;
    this.notifier = null; // function(event, data)
  }

  setNotifier(fn) {
    this.notifier = fn;
  }

  addPlayer(playerId, playerName) {
    this.players.set(playerId, {
      name: playerName,
      role: null,
      alive: true,
      isWordEnteringPlayer: false
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.ownerId === playerId) {
      // Transfer ownership to first remaining player
      const remaining = Array.from(this.players.keys())[0];
      if (remaining) this.ownerId = remaining;
    }
  }

  getPlayers() {
    return Array.from(this.players.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      role: data.role,
      alive: data.alive,
      isOwner: id === this.ownerId,
      isWordEnteringPlayer: data.isWordEnteringPlayer
    }));
  }

  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.totalRounds = settings.roundCount || this.totalRounds;
  }

  startGame() {
    if (this.players.size < 2) return false;
    this.gameStarted = true;

    // prepare session order (rotate randomly to choose starting player)
    this.sessions = Array.from(this.players.keys());
    if (this.sessions.length > 1) {
      const rand = Math.floor(Math.random() * this.sessions.length);
      // rotate so that rand index becomes first
      this.sessions = this.sessions.slice(rand).concat(this.sessions.slice(0, rand));
    }
    this.totalSessions = this.sessions.length;
    this.sessionIndex = 0;
    this.currentSession = 1;

    // rounds per session comes from settings
    this.totalRounds = this.settings.roundCount || this.totalRounds;
    this.currentRound = 1;

    this.startNextSession();
    return true;
  }

  // start a new session where a particular player will enter the word
  startNextSession() {
    if (this.sessionIndex >= this.sessions.length) {
      // no more sessions left
      this.currentPhase = 'game-over';
      this.gameStarted = false;
      return;
    }

    this.wordEnteringPlayerId = this.sessions[this.sessionIndex];
    this.players.forEach((p, id) => {
      p.isWordEnteringPlayer = id === this.wordEnteringPlayerId;
      p.role = null; // clear previous roles
    });

    // reset round tracking for this session
    this.currentRound = 1;
    this.totalRounds = this.settings.roundCount || this.totalRounds;

    this.currentPhase = 'word-entering';
  }

  submitWord(wordEnteringPlayerId, word) {
    if (wordEnteringPlayerId !== this.wordEnteringPlayerId) return false;
    this.secretWord = word;

    // Assign roles to all OTHER players
    this.assignRolesToGuessers();

    // Build turn order and calculate total passes for this session
    const guessers = Array.from(this.players.keys()).filter(
      id => id !== this.wordEnteringPlayerId
    );
    this.guessersOrder = guessers;
    this.turnsRemaining = guessers.length * (this.settings.roundCount || this.totalRounds);

    // start with first guesser
    if (guessers.length > 0) {
      this.currentGuessingPlayerId = guessers[0];
      this.currentPhase = 'guessing';
    }

    // clear any previous voting state
    this.votes.clear();
    this.voteResults = null;

    return true;
  }

  assignRolesToGuessers() {
    // Only assign roles to non-word-entering players
    const guessers = Array.from(this.players.keys()).filter(
      id => id !== this.wordEnteringPlayerId
    );

    // Randomly select imposters from guessers
    const impostersCount = Math.min(
      this.settings.importerCount,
      guessers.length
    );
    const shuffled = [...guessers].sort(() => Math.random() - 0.5);
    const impostorIds = shuffled.slice(0, impostersCount);

    guessers.forEach(id => {
      const player = this.players.get(id);
      player.role = impostorIds.includes(id) ? 'imposter' : 'normal';
    });

    // Word-entering player has no role during guessing
    const wordEnteringPlayer = this.players.get(this.wordEnteringPlayerId);
    if (wordEnteringPlayer) {
      wordEnteringPlayer.role = null; // They don't participate
    }
  }

  passCurrentGuesser() {
    // reduce remaining turns and rotate to next guesser
    if (this.currentGuessingPlayerId && this.guessersOrder.length > 0) {
      this.turnsRemaining -= 1;
      const currentIndex = this.guessersOrder.indexOf(this.currentGuessingPlayerId);
      const nextIndex = (currentIndex + 1) % this.guessersOrder.length;
      this.currentGuessingPlayerId = this.guessersOrder[nextIndex];
    }

    // check if we've finished all rounds for this session
    if (this.turnsRemaining <= 0) {
      this.startVoting();
    }
  }

  startVoting() {
    this.currentPhase = 'voting';
    this.votes.clear();
  }

  submitVote(voterId, targetId) {
    if (this.currentPhase !== 'voting') return;
    if (!this.guessersOrder.includes(voterId)) return; // only guessers vote
    this.votes.set(voterId, targetId);

    // if everyone has voted, compute results
    if (this.votes.size === this.guessersOrder.length) {
      const counts = {};
      for (const vote of this.votes.values()) {
        counts[vote] = (counts[vote] || 0) + 1;
      }
      // determine winner(s)
      let max = 0;
      Object.values(counts).forEach(c => { if (c > max) max = c; });
      const winners = Object.keys(counts).filter(id => counts[id] === max);

      // actual imposters
      const actual = Array.from(this.players.entries())
        .filter(([id,p]) => p.role === 'imposter')
        .map(([id]) => id);

      this.voteResults = { counts, winners, actual };
      this.currentPhase = 'reveal';
    }
  }

  endSession() {
    // clear round-specific state
    this.secretWord = '';
    this.currentGuessingPlayerId = null;
    this.guessersOrder = [];
    this.turnsRemaining = 0;
    this.votes.clear();

    // move to next session
    this.sessionIndex++;
    this.currentSession++;
    if (this.sessionIndex < this.sessions.length) {
      this.startNextSession();
    } else {
      this.currentPhase = 'game-over';
      this.gameStarted = false;
    }
  }

  resetGame() {
    this.gameStarted = false;
    this.sessions = [];
    this.sessionIndex = 0;
    this.currentSession = 0;
    this.totalSessions = 0;
    this.currentRound = 0;
    this.totalRounds = this.settings.roundCount || 0;
    this.currentPhase = 'lobby';
    this.secretWord = '';
    this.wordEnteringPlayerId = null;
    this.currentGuessingPlayerId = null;
    this.guessersOrder = [];
    this.turnsRemaining = 0;
    this.votes.clear();
    this.voteResults = null;

    this.players.forEach(p => {
      p.role = null;
      p.alive = true;
      p.isWordEnteringPlayer = false;
    });

    if (this.roundTimer) clearTimeout(this.roundTimer);
  }

  reset() {
    this.resetGame();
  }

  getGameState() {
    return {
      gameStarted: this.gameStarted,
      currentSession: this.currentSession,
      totalSessions: this.totalSessions,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      currentPhase: this.currentPhase,
      wordEnteringPlayerId: this.wordEnteringPlayerId,
      currentGuessingPlayerId: this.currentGuessingPlayerId,
      players: this.getPlayers(),
      secretWord: this.secretWord,
      turnsRemaining: this.turnsRemaining,
      votes: Array.from(this.votes.entries()),
      voteResults: this.voteResults
    };
  }
}

export default GameRoom;
