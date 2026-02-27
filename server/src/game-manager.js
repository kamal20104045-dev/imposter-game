import { v4 as uuidv4 } from 'uuid';
import GameRoom from './game-room.js';

class GameManager {
  constructor() {
    this.rooms = new Map();
    this.playerToRoom = new Map();
    this.playerNames = new Map();
  }

  createRoom(playerId, playerName) {
    const roomId = uuidv4();
    const roomCode = this.generateRoomCode();
    
    const room = new GameRoom(roomId, roomCode, playerId);
    room.addPlayer(playerId, playerName);
    
    this.rooms.set(roomId, room);
    this.playerToRoom.set(playerId, roomId);
    this.playerNames.set(playerId, playerName);
    
    return room;
  }

  joinRoom(playerId, playerName, roomCode) {
    const room = Array.from(this.rooms.values()).find(r => r.code === roomCode);
    
    if (!room) return null;
    if (room.players.size >= room.settings.maxPlayers) return null;
    if (room.gameStarted) return null;

    room.addPlayer(playerId, playerName);
    this.playerToRoom.set(playerId, room.id);
    this.playerNames.set(playerId, playerName);
    
    return room;
  }

  getRoomByPlayerId(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    return this.rooms.get(roomId);
  }

  removePlayerFromRoom(playerId) {
    const roomId = this.playerToRoom.get(playerId);
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.removePlayer(playerId);
      }
      this.playerToRoom.delete(playerId);
      this.playerNames.delete(playerId);
    }
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  getPlayerName(playerId) {
    return this.playerNames.get(playerId) || 'Unknown';
  }

  generateRoomCode() {
    let code = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export default GameManager;
