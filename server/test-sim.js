import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3000';
let clients = {};

async function run() {
  console.log('\n=== IMPOSTER GAME 3-PLAYER TEST ===\n');
  const a = io(SERVER);
  clients.A = a;
  a.on('connect', () => console.log('✓ A connected'));
  a.on('room-created', (data) => {
    console.log('✓ A created room', data.roomCode);
    connectB(data.roomCode, a);
  });
  a.on('game-started', (d) => console.log(`✓ A game-started session ${d.sessionNumber}/${d.totalSessions}`));
  a.on('role-assigned', (d) => console.log('✓ A role:', d.role || 'WORD_KEEPER'));
  a.on('word-submitted', () => console.log('✓ A word-submitted'));
  a.on('voting-started', () => console.log('✓ A voting-started'));
  a.on('vote-results', () => console.log('✓ A vote-results'));
  a.on('connect', () => setTimeout(()=> a.emit('create-room', { playerName: 'Alice' }), 200));
}

function connectB(roomCode, aSocket) {
  const b = io(SERVER);
  clients.B = b;
  b.on('connect', () => {
    console.log('✓ B connected');
    b.emit('join-room', { playerName: 'Bob', roomCode });
  });
  b.on('join-success', () => {
    console.log('✓ B join-success');
    connectC(roomCode, aSocket);
  });
  b.on('game-started', (d) => {
    console.log(`✓ B game-started session ${d.sessionNumber}/${d.totalSessions}`);
    if (b.id === d.wordEnteringPlayerId) setTimeout(()=> b.emit('submit-word', { word: 'apple' }), 300);
  });
  b.on('role-assigned', (d) => console.log('✓ B role:', d.role || 'WORD_KEEPER'));
  b.on('word-submitted', () => console.log('✓ B word-submitted'));
  b.on('voting-started', (d) => {
    console.log('✓ B voting-started');
    const v = d.guessingPlayers.find(id => id !== b.id);
    if (v) setTimeout(()=> b.emit('submit-vote', { targetId: v }), 300);
  });
  b.on('vote-results', () => console.log('✓ B vote-results'));
}

function connectC(roomCode, aSocket) {
  const c = io(SERVER);
  clients.C = c;
  c.on('connect', () => {
    console.log('✓ C connected');
    c.emit('join-room', { playerName: 'Carol', roomCode });
  });
  c.on('join-success', () => {
    console.log('✓ C join-success');
    setTimeout(()=> { console.log('▶ Starting game'); aSocket.emit('start-game'); }, 400);
  });
  c.on('game-started', (d) => {
    console.log(`✓ C game-started session ${d.sessionNumber}/${d.totalSessions}`);
    if (c.id === d.wordEnteringPlayerId) setTimeout(()=> c.emit('submit-word', { word: 'banana' }), 300);
  });
  c.on('role-assigned', (d) => console.log('✓ C role:', d.role || 'WORD_KEEPER'));
  c.on('word-submitted', () => console.log('✓ C word-submitted'));
  c.on('voting-started', (d) => {
    console.log('✓ C voting-started');
    const v = d.guessingPlayers.find(id => id !== c.id);
    if (v) setTimeout(()=> c.emit('submit-vote', { targetId: v }), 300);
  });
  c.on('vote-results', () => console.log('✓ C vote-results'));
}

setTimeout(()=>{
  Object.values(clients).forEach(s=> s.disconnect());
  console.log('\n✓ Simulation complete\n');
  process.exit(0);
}, 15000);

run().catch(e=>{ console.error('ERROR:', e); process.exit(1); });
