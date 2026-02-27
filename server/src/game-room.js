import { v4 as uuidv4 } from 'uuid';

class GameRoom {
  constructor(roomId, roomCode, ownerId) {
    this.id = roomId;
    this.code = roomCode;
    this.ownerId = ownerId;
    this.players = new Map(); // playerId -> { name, role, alive }
    this.gameStarted = false;
    this.inVotingPhase = false;
    this.currentRound = 0;
    this.currentTurnPlayerId = null;
    this.wordsThisRound = new Map(); // playerId -> word
    this.playersWhoSubmitted = new Set();
    this.votes = new Map(); // voterId -> votedPlayerId
    this.eliminations = [];

    // Settings
    this.settings = {
      maxPlayers: 8,
      importerCount: 2,
      roundCount: 3
    };

    // Timers
    this.TURN_TIME_LIMIT = 30; // seconds
    this.VOTING_TIME_LIMIT = 20; // seconds
    this.turnTimer = null;
    this.votingTimer = null;
    this.notifier = null; // function(event, data)
    this.lastSubmitter = null;
  }

  setNotifier(fn) {
    this.notifier = fn;
  }

  addPlayer(playerId, playerName) {
    this.players.set(playerId, {
      name: playerName,
      role: null,
      alive: true
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    // If owner leaves, assign new owner
    if (playerId === this.ownerId && this.players.size > 0) {
      this.ownerId = this.players.keys().next().value;
    }
  }

  getPlayers() {
    return Array.from(this.players.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      alive: data.alive,
      isOwner: id === this.ownerId
    }));
  }

  setSettings(maxPlayers, importerCount, roundCount) {
    this.settings.maxPlayers = maxPlayers;
    this.settings.importerCount = importerCount;
    this.settings.roundCount = roundCount;
  }

  getSettings() {
    return this.settings;
  }

  startGame() {
    this.gameStarted = true;
    this.currentRound = 1;
    this.assignRoles();
    this.startRound();
  }

  assignRoles() {
    const playerIds = Array.from(this.players.keys());
    const shuffled = playerIds.sort(() => Math.random() - 0.5);
    
    // Assign importer roles
    for (let i = 0; i < this.settings.importerCount && i < shuffled.length; i++) {
      this.players.get(shuffled[i]).role = 'imposter';
    }
    
    // Assign normal roles
    for (let i = this.settings.importerCount; i < shuffled.length; i++) {
      this.players.get(shuffled[i]).role = 'normal';
    }
  }

  startRound() {
    this.inVotingPhase = false;
    this.wordsThisRound = new Map();
    this.playersWhoSubmitted = new Set();
    this.votes = new Map();
    
    // Get alive players for this round
    const alivePlayers = Array.from(this.players.entries())
      .filter(([, data]) => data.alive)
      .map(([id]) => id);
    
    if (alivePlayers.length > 0) {
      // Randomly select first player
      this.currentTurnPlayerId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      this.startTurnTimer();
      if (this.notifier) this.notifier('turn-updated', { currentTurn: this.currentTurnPlayerId, playersLeft: this.getRemainingPlayersThisRound().length });
    }
  }

  startTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => {
      this.skipTurn();
    }, this.TURN_TIME_LIMIT * 1000);
  }

  submitWord(playerId, word) {
    if (this.currentTurnPlayerId === playerId && !this.playersWhoSubmitted.has(playerId)) {
      this.wordsThisRound.set(playerId, word);
      this.playersWhoSubmitted.add(playerId);
      this.lastSubmitter = playerId;
      this.nextTurn();
    }
  }

  skipTurn() {
    if (this.currentTurnPlayerId) {
      this.playersWhoSubmitted.add(this.currentTurnPlayerId);
    }
    this.nextTurn();
  }

  nextTurn() {
    const alivePlayers = Array.from(this.players.entries())
      .filter(([, data]) => data.alive)
      .map(([id]) => id);
    
    const remainingPlayers = alivePlayers.filter(id => !this.playersWhoSubmitted.has(id));
    
    if (remainingPlayers.length > 0) {
      this.currentTurnPlayerId = remainingPlayers[0];
      this.startTurnTimer();
      if (this.notifier) this.notifier('turn-updated', { currentTurn: this.currentTurnPlayerId, playersLeft: remainingPlayers.length });
    } else {
      this.endRound();
    }
  }

  endRound() {
    this.inVotingPhase = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.notifier) this.notifier('voting-started', { players: this.getPlayers(), timeLimit: this.VOTING_TIME_LIMIT });
  }

  getRemainingPlayersThisRound() {
    const alivePlayers = Array.from(this.players.entries())
      .filter(([, data]) => data.alive)
      .map(([id]) => id);
    
    return alivePlayers.filter(id => !this.playersWhoSubmitted.has(id));
  }

  // Voters for the current round: exclude the player who last submitted (they know the word)
  getVotersForCurrentRound() {
    const alivePlayers = Array.from(this.players.entries())
      .filter(([, data]) => data.alive)
      .map(([id]) => id);

    if (this.lastSubmitter) {
      return alivePlayers.filter(id => id !== this.lastSubmitter);
    }
    return alivePlayers;
  }

  submitVote(playerId, votedPlayerId) {
    if (!this.inVotingPhase) return;
    if (this.votes.has(playerId)) return; // Already voted
    
    this.votes.set(playerId, votedPlayerId);
  }

  areAllVotesSubmitted() {
    const alivePlayers = Array.from(this.players.entries())
      .filter(([, data]) => data.alive)
      .map(([id]) => id);
    
    return this.votes.size === alivePlayers.length;
  }

  tallyVotes() {
    const voteCount = new Map();
    let maxVotes = 0;
    let eliminatedPlayer = null;

    // Count votes
    for (const [, votedId] of this.votes) {
      voteCount.set(votedId, (voteCount.get(votedId) || 0) + 1);
      maxVotes = Math.max(maxVotes, voteCount.get(votedId));
    }

    // Find player with most votes (break ties randomly)
    const topVoted = Array.from(voteCount.entries())
      .filter(([, count]) => count === maxVotes)
      .map(([id]) => id);
    
    if (topVoted.length > 0) {
      eliminatedPlayer = topVoted[Math.floor(Math.random() * topVoted.length)];
      this.players.get(eliminatedPlayer).alive = false;
      this.eliminations.push(eliminatedPlayer);
    }

    // Check if game is over
    const importersAlive = Array.from(this.players.entries())
      .filter(([, data]) => data.alive && data.role === 'imposter')
      .length;
    
    const gameOver = importersAlive === 0;

    return {
      voteCount: Object.fromEntries(voteCount),
      eliminatedPlayer,
      impostersRevealed: this.getImpostersRevealed(),
      gameOver
    };
  }

  getImpostersRevealed() {
    return Array.from(this.players.entries())
      .filter(([, data]) => data.role === 'imposter' && !data.alive)
      .map(([id, data]) => ({ id, name: data.name }));
  }

  revealResults(results) {
    // Store results for display
    this.lastResults = results;
  }

  nextRound() {
    this.currentRound++;
    if (this.currentRound <= this.settings.roundCount) {
      this.startRound();
    }
  }

  // Reset game-specific state but keep players in the room (useful for restarting)
  resetGame() {
    this.gameStarted = false;
    this.inVotingPhase = false;
    this.currentRound = 0;
    this.currentTurnPlayerId = null;
    this.wordsThisRound = new Map();
    this.playersWhoSubmitted = new Set();
    this.votes = new Map();
    this.eliminations = [];
    this.lastResults = null;
    // clear timers
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.votingTimer) {
      clearTimeout(this.votingTimer);
      this.votingTimer = null;
    }
    // reset roles and alive status so a fresh game can be started
    for (const [id, pdata] of this.players.entries()) {
      pdata.role = null;
      pdata.alive = true;
    }
  }

  // Full reset in preparation for room deletion
  reset() {
    this.resetGame();
    this.players.clear();
    this.ownerId = null;
    this.code = null;
    this.id = null;
    this.notifier = null;
  }

  getFinalResults() {
    const importersAlive = Array.from(this.players.entries())
      .filter(([, data]) => data.alive && data.role === 'imposter').length;
    
    const normalPlayersAlive = Array.from(this.players.entries())
      .filter(([, data]) => data.alive && data.role === 'normal').length;

    let winner = importersAlive === 0 ? 'normal' : 'imposter';
    if (importersAlive === 0 && normalPlayersAlive === 0) {
      winner = 'tie';
    }

    return {
      winner,
      imposters: Array.from(this.players.entries())
        .filter(([, data]) => data.role === 'imposter')
        .map(([id, data]) => ({ id, name: data.name, alive: data.alive })),
      normalPlayers: Array.from(this.players.entries())
        .filter(([, data]) => data.role === 'normal')
        .map(([id, data]) => ({ id, name: data.name, alive: data.alive }))
    };
  }
}

export default GameRoom;
