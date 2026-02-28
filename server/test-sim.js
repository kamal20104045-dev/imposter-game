import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

async function run() {
  console.log('Connecting client A (owner)...');
  const a = io(SERVER);

  a.on('connect', () => console.log('A connected', a.id));

  a.on('room-created', (data) => {
    console.log('A created room', data.roomCode);
    // Now connect client B and join
    runB(data.roomCode, a);
  });

  a.on('game-started', (data) => {
    console.log('A sees game-started', data.currentPhase, 'wordEntering:', data.wordEnteringPlayerId);
  });

  a.on('role-assigned', (d) => {
    console.log('A role-assigned', d);
  });

  // create room after connect
  a.on('connect', () => setTimeout(()=>{
    a.emit('create-room', { playerName: 'Alice' });
  }, 200));
}

async function runB(roomCode, aSocket) {
  console.log('Connecting client B...');
  const b = io(process.env.SERVER_URL || 'http://localhost:3000');

  b.on('connect', () => {
    console.log('B connected', b.id);
    b.emit('join-room', { playerName: 'Bob', roomCode });
  });

  b.on('join-success', (d) => {
    console.log('B join-success', d);
    // small delay then owner starts game
    setTimeout(()=>{
      console.log('Owner starting game...');
      aSocket.emit('start-game');
    }, 400);
  });

  b.on('role-assigned', (d) => {
    console.log('B role-assigned', d);
    // if B is word-entering player, submit a word (unlikely)
  });

  b.on('word-submitted', (d) => {
    console.log('B word-submitted event', d);
  });

  b.on('game-started', (d) => {
    console.log('B game-started', d.currentPhase, 'wordEntering:', d.wordEnteringPlayerId);
    // If this client is the word-entering player, submit a test word
    if (b.id === d.wordEnteringPlayerId) {
      setTimeout(()=>{
        b.emit('submit-word', { word: 'apple' });
      }, 300);
    }
  });

  // cleanup after 5s
  setTimeout(()=>{
    aSocket.disconnect();
    b.disconnect();
    console.log('Simulation complete');
    process.exit(0);
  }, 5000);
}

run().catch(e=>{ console.error(e); process.exit(1); });
