import { v4 as uuidv4 } from 'uuid';

class GameRoom {
  constructor(roomId, roomCode, ownerId) {
    this.id = roomId;
    this.code = roomCode;
    this.ownerId = ownerId;
    this.players = new Map(); // playerId -> { name, role, alive, isWordEnteringPlayer }
    this.gameStarted = false;
    this.currentRound = 0;
    this.totalRounds = 3;

    // Current round state
    this.secretWord = '';
    this.wordEnteringPlayerId = null;
    this.currentPhase = 'lobby'; // 'word-entering' | 'guessing' | 'round-end'
    this.currentGuessingPlayerId = null; // whose turn is it
    this.guessersThisRound = new Set(); // players who haven't guessed yet
    this.guessersPassed = new Set(); // players who have passed their turn

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
    this.currentRound = 1;
    this.selectWordEnteringPlayer();
    this.currentPhase = 'word-entering';
    return true;
  }

  selectWordEnteringPlayer() {
    // Select the next player in rotation to enter the word
    // This ensures everyone gets a turn fairly
    const playerIds = Array.from(this.players.keys());
    
    if (this.currentRound === 1) {
      // First round: random selection
      const randomIndex = Math.floor(Math.random() * playerIds.length);
      this.wordEnteringPlayerId = playerIds[randomIndex];
    } else {
      // Subsequent rounds: rotate through players
      // Find the current word-entering player in the list
      const currentIndex = playerIds.indexOf(this.wordEnteringPlayerId);
      const nextIndex = (currentIndex + 1) % playerIds.length;
      this.wordEnteringPlayerId = playerIds[nextIndex];
    }

    // Mark this player
    this.players.forEach(p => p.isWordEnteringPlayer = false);
    const playerData = this.players.get(this.wordEnteringPlayerId);
    if (playerData) playerData.isWordEnteringPlayer = true;
  }

  submitWord(wordEnteringPlayerId, word) {
    if (wordEnteringPlayerId !== this.wordEnteringPlayerId) return false;
    this.secretWord = word;

    // Assign roles to all OTHER players
    this.assignRolesToGuessers();

    // Prepare guessing phase
    const guessers = Array.from(this.players.keys()).filter(
      id => id !== this.wordEnteringPlayerId
    );
    this.guessersThisRound = new Set(guessers);
    this.guessersPassed = new Set();

    // Start guessing with first guesser
    if (guessers.length > 0) {
      this.currentGuessingPlayerId = guessers[0];
      this.currentPhase = 'guessing';
    }

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
    // Mark current guesser as passed
    if (this.currentGuessingPlayerId) {
      this.guessersPassed.add(this.currentGuessingPlayerId);
    }

    // Check if all have passed
    if (this.guessersPassed.size === this.guessersThisRound.size) {
      this.endRound();
      return;
    }

    // Move to next guesser
    const guessers = Array.from(this.guessersThisRound);
    const currentIndex = guessers.indexOf(this.currentGuessingPlayerId);
    const nextIndex = (currentIndex + 1) % guessers.length;
    this.currentGuessingPlayerId = guessers[nextIndex];
  }

  endRound() {
    this.currentPhase = 'round-end';
    this.secretWord = '';
    this.currentGuessingPlayerId = null;

    if (this.currentRound < this.totalRounds) {
      // Prepare next round
      this.currentRound++;
      this.selectWordEnteringPlayer();
      this.guessersThisRound = new Set();
      this.guessersPassed = new Set();
      this.currentPhase = 'word-entering';
    } else {
      // Game over
      this.currentPhase = 'game-over';
      this.gameStarted = false;
    }
  }

  resetGame() {
    this.gameStarted = false;
    this.currentRound = 0;
    this.currentPhase = 'lobby';
    this.secretWord = '';
    this.wordEnteringPlayerId = null;
    this.currentGuessingPlayerId = null;
    this.guessersThisRound = new Set();
    this.guessersPassed = new Set();

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
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      currentPhase: this.currentPhase,
      wordEnteringPlayerId: this.wordEnteringPlayerId,
      currentGuessingPlayerId: this.currentGuessingPlayerId,
      players: this.getPlayers(),
      secretWord: this.secretWord,
      guessersThisRound: Array.from(this.guessersThisRound),
      guessersPassed: Array.from(this.guessersPassed)
    };
  }
}

export default GameRoom;
