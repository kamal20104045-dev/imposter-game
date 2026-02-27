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
      // ensure room notifier is set so server can broadcast turn/voting updates
      if (typeof room.setNotifier === 'function') {
        room.setNotifier((event, payload) => {
          if (event === 'turn-updated') {
            io.to(room.id).emit('turn-updated', payload);
          } else if (event === 'voting-started') {
            io.to(room.id).emit('voting-phase-started', payload);
          }
        });
      }
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
    } else {
      socket.emit('join-error', { message: 'Invalid room code' });
    }
  });

  // Create room
  socket.on('create-room', (data) => {
    const { playerName } = data;
    const room = gameManager.createRoom(socket.id, playerName);
    socket.join(room.id);
    // set notifier so GameRoom can inform about turn/voting changes
    if (typeof room.setNotifier === 'function') {
      room.setNotifier((event, payload) => {
        if (event === 'turn-updated') {
          io.to(room.id).emit('turn-updated', payload);
        } else if (event === 'voting-started') {
          io.to(room.id).emit('voting-phase-started', payload);
        }
      });
    }
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
      room.setSettings(maxPlayers, importerCount, roundCount);
      io.to(room.id).emit('settings-updated', room.getSettings());
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
      // send role assignment privately to each player
      for (const [pid, pdata] of room.players.entries()) {
        io.to(pid).emit('role-assigned', { role: pdata.role });
      }
      io.to(room.id).emit('game-started', {
        roundNumber: room.currentRound,
        totalRounds: room.settings.roundCount,
        currentTurn: room.currentTurnPlayerId,
        timeLimit: room.TURN_TIME_LIMIT
      });
    }
  });

  // Submit word
  socket.on('submit-word', (data) => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (room && room.gameStarted && room.currentTurnPlayerId === socket.id) {
      const { word } = data;
      room.submitWord(socket.id, word);
      // Notify each player: hide the word from imposters
      for (const [pid, pdata] of room.players.entries()) {
        const isImposter = pdata.role === 'imposter';
        io.to(pid).emit('word-submitted', {
          submittedById: socket.id,
          submittedBy: gameManager.getPlayerName(socket.id),
          word: isImposter ? null : word,
          nextTurn: room.currentTurnPlayerId,
          playersLeft: room.getRemainingPlayersThisRound().length
        });
      }

      // Check if round is complete
      if (room.getRemainingPlayersThisRound().length === 0) {
        io.to(room.id).emit('voting-phase-started', {
          players: room.getPlayers(),
          timeLimit: room.VOTING_TIME_LIMIT
        });
      }
    }
  });

  // Submit vote
  socket.on('submit-vote', (data) => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (room && room.inVotingPhase) {
      const { votedPlayerId } = data;
      room.submitVote(socket.id, votedPlayerId);
      
      // Check if voting is complete
      if (room.areAllVotesSubmitted()) {
        const results = room.tallyVotes();
        room.revealResults(results);
        
        io.to(room.id).emit('voting-results', {
          voteCount: results.voteCount,
          eliminatedPlayer: results.eliminatedPlayer,
          impostersRevealed: results.impostersRevealed,
          roundNumber: room.currentRound,
          totalRounds: room.settings.roundCount
        });

        // Check if game is over
        if (room.currentRound >= room.settings.roundCount || results.gameOver) {
          io.to(room.id).emit('game-over', {
            finalResults: room.getFinalResults()
          });
        } else {
          // Move to next round after delay
          setTimeout(() => {
            room.nextRound();
            io.to(room.id).emit('game-started', {
              roundNumber: room.currentRound,
              totalRounds: room.settings.roundCount,
              currentTurn: room.currentTurnPlayerId,
              timeLimit: room.TURN_TIME_LIMIT
            });
          }, 3000);
        }
      }
    }
  });

  // Owner can reset the game state (prepare for a fresh game)
  socket.on('reset-game', () => {
    const room = gameManager.getRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.ownerId !== socket.id) return;
    room.resetGame();
    io.to(room.id).emit('room-reset', { players: room.getPlayers(), settings: room.getSettings() });
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
