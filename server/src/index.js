import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import GameManager from './game-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
// Allow overriding allowed frontend origin via FRONTEND_ORIGIN env var
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const gameManager = new GameManager();

// Middleware
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

// Serve frontend
app.use(express.static(join(__dirname, '../../client')));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create or join room
  socket.on('join-room', (data) => {
    const { playerName, roomCode } = data;
    const room = gameManager.joinRoom(socket.id, playerName, roomCode);
    
    if (room) {
      socket.join(room.id);
      io.to(room.id).emit('player-joined', {
        players: room.getPlayers(),
        playerCount: room.players.size
      });
      socket.emit('join-success', {
        roomId: room.id,
        roomCode: room.code,
        isOwner: room.ownerId === socket.id
      });
        // if the game is already underway, let the newcomer know the
        // current state so their UI can switch straight to the game screen
        if (room.gameStarted) {
          const playerData = room.players.get(socket.id) || {};
          socket.emit('game-started', {
            roundNumber: room.currentRound,
            totalRounds: room.totalRounds,
            currentPhase: room.currentPhase,
            wordEnteringPlayerId: room.wordEnteringPlayerId,
            currentGuessingPlayerId: room.currentGuessingPlayerId,
            players: room.getPlayers()
          });
          if (playerData.role) {
            socket.emit('role-assigned', { role: playerData.role });
          }
        }
    } else {
      socket.emit('join-error', { message: 'Invalid room code' });
    }
  });

  // Create room
  socket.on('create-room', (data) => {
    const { playerName } = data;
    const room = gameManager.createRoom(socket.id, playerName);
    socket.join(room.id);
    socket.emit('room-created', {
      roomId: room.id,
      roomCode: room.code,
      isOwner: true
    });
    
    io.to(room.id).emit('player-joined', {
      players: room.getPlayers(),
      playerCount: room.players.size
    });
  });

  // Update room settings
  socket.on('update-settings', (data) => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (room && room.ownerId === socket.id) {
      const { maxPlayers, importerCount, roundCount } = data;
      room.updateSettings({ maxPlayers, importerCount, roundCount });
      io.to(room.id).emit('settings-updated', {
        maxPlayers: room.settings.maxPlayers,
        importerCount: room.settings.importerCount,
        roundCount: room.settings.roundCount
      });
    }
  });

  // Start game
  socket.on('start-game', () => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (room && room.ownerId === socket.id && !room.gameStarted) {
      // Validate minimum player count
      if (room.players.size < 2) {
        socket.emit('game-error', { message: 'At least 2 players are required to start the game' });
        return;
      }
      
      room.startGame();
      io.to(room.id).emit('game-started', {
        sessionNumber: room.currentSession,
        totalSessions: room.totalSessions,
        roundNumber: room.currentRound,
        totalRounds: room.totalRounds,
        currentPhase: room.currentPhase,
        wordEnteringPlayerId: room.wordEnteringPlayerId,
        players: room.getPlayers()
      });
    }
  });

  // Submit word (only word-entering player can submit)
  socket.on('submit-word', (data) => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room || !room.gameStarted) return;
    if (room.currentPhase !== 'word-entering') return;
    if (socket.id !== room.wordEnteringPlayerId) return;

    const { word } = data;
    room.submitWord(socket.id, word);

    // Broadcast role assignments to each player
    for (const [pid] of room.players.entries()) {
      const pdata = room.players.get(pid);
      const isWordEnteringPlayer = (pid === room.wordEnteringPlayerId);
      
      if (!isWordEnteringPlayer) {
        io.to(pid).emit('role-assigned', { 
          role: pdata.role,
          word: pdata.role === 'normal' ? word : null,
          isWordEnteringPlayer: false
        });
      } else {
        io.to(pid).emit('role-assigned', { 
          role: null,
          word: null,
          isWordEnteringPlayer: true
        });
      }
    }

    // Get list of guessing players (all except word-entering player)
    const guessingPlayerIds = Array.from(room.players.keys()).filter(
      id => id !== room.wordEnteringPlayerId
    );

    io.to(room.id).emit('word-submitted', {
      sessionNumber: room.currentSession,
      roundNumber: room.currentRound,
      totalRounds: room.totalRounds,
      currentPhase: room.currentPhase,
      currentGuessingPlayerId: room.currentGuessingPlayerId,
      guessingPlayers: guessingPlayerIds,
      players: room.getPlayers()
    });
  });

  // Pass current turn (guesser can pass to next guesser)
  socket.on('pass-turn', () => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room || !room.gameStarted) return;
    if (room.currentPhase !== 'guessing') return;
    if (socket.id !== room.currentGuessingPlayerId) return;

    room.passCurrentGuesser();

    // if we just entered voting phase
    if (room.currentPhase === 'voting') {
      // notify clients to show voting UI
      io.to(room.id).emit('voting-started', {
        sessionNumber: room.currentSession,
        totalSessions: room.totalSessions,
        guessingPlayers: room.guessersOrder,
        players: room.getPlayers()
      });
      return;
    }

    // if we just finished voting and are in reveal
    if (room.currentPhase === 'reveal') {
      io.to(room.id).emit('vote-results', {
        voteResults: room.voteResults,
        players: room.getPlayers()
      });

      // after a short delay, move to next session or end game
      setTimeout(() => {
        if (room.gameStarted && room.currentPhase === 'reveal') {
          // move into end-of-session logic
          room.endSession();
          if (room.currentPhase === 'game-over') {
            io.to(room.id).emit('game-over', {});
          } else {
            // notify clients of new session start
            io.to(room.id).emit('session-ended', {
              nextSessionNumber: room.currentSession,
              totalSessions: room.totalSessions
            });
            io.to(room.id).emit('game-started', {
              sessionNumber: room.currentSession,
              totalSessions: room.totalSessions,
              roundNumber: room.currentRound,
              totalRounds: room.totalRounds,
              currentPhase: room.currentPhase,
              wordEnteringPlayerId: room.wordEnteringPlayerId,
              players: room.getPlayers()
            });
          }
        }
      }, 3000);

      return;
    }

    // still in guessing phase normally
    io.to(room.id).emit('turn-updated', {
      currentPhase: room.currentPhase,
      currentGuessingPlayerId: room.currentGuessingPlayerId,
      turnsRemaining: room.turnsRemaining,
      players: room.getPlayers()
    });
  });

  // allow players to submit votes during voting phase
  socket.on('submit-vote', (data) => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room || !room.gameStarted) return;
    if (room.currentPhase !== 'voting') return;

    const { targetId } = data;
    room.submitVote(socket.id, targetId);

    // if voteResults computed we should broadcast them
    if (room.currentPhase === 'reveal') {
      io.to(room.id).emit('vote-results', {
        voteResults: room.voteResults,
        players: room.getPlayers()
      });

      // same post-reveal transition as in pass-turn
      setTimeout(() => {
        if (room.gameStarted && room.currentPhase === 'reveal') {
          room.endSession();
          if (room.currentPhase === 'game-over') {
            io.to(room.id).emit('game-over', {});
          } else {
            io.to(room.id).emit('session-ended', {
              nextSessionNumber: room.currentSession,
              totalSessions: room.totalSessions
            });
            io.to(room.id).emit('game-started', {
              sessionNumber: room.currentSession,
              totalSessions: room.totalSessions,
              roundNumber: room.currentRound,
              totalRounds: room.totalRounds,
              currentPhase: room.currentPhase,
              wordEnteringPlayerId: room.wordEnteringPlayerId,
              players: room.getPlayers()
            });
          }
        }
      }, 3000);
    }
  });

  // Owner can reset the game state (prepare for a fresh game)
  socket.on('reset-game', () => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.ownerId !== socket.id) return;
    room.resetGame();
    io.to(room.id).emit('room-reset', { players: room.getPlayers() });
  });

  // Owner can close the room entirely
  socket.on('close-room', () => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.ownerId !== socket.id) return;
    // notify remaining players and then delete room
    io.to(room.id).emit('room-closed', { message: 'Room has been closed by the owner.' });
    // remove players' mappings
    for (const pid of Array.from(room.players.keys())) {
      gameManager.removePlayerFromRoom(pid);
    }
    gameManager.deleteRoom(room.id);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (room) {
      gameManager.removePlayerFromRoom(socket.id);
      if (room.players.size === 0) {
        gameManager.deleteRoom(room.id);
      } else {
        io.to(room.id).emit('player-left', {
          players: room.getPlayers(),
          playerCount: room.players.size
        });
      }
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Imposter Game Server running on:`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   LAN:    http://<your-ip>:${PORT}`);
  console.log(`\n`);
});
