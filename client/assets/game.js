// Game State
const gameState = {
    socket: null,
    roomId: null,
    roomCode: null,
    playerId: null,
    playerName: null,
    isOwner: false,
    players: [],
    currentRole: null, // 'imposter', 'normal', or null
    currentWord: null,
    gameStarted: false,
    currentSession: 1,
    totalSessions: 1,
    currentRound: 1,
    totalRounds: 3,
    currentPhase: 'lobby', // 'word-entering', 'guessing', 'voting', 'reveal', 'waiting', 'round-end', 'game-over'
    wordEnteringPlayerId: null, // Player currently entering the word
    currentGuessingPlayerId: null, // Player whose turn it is to speak
    guessingPhaseStarted: false,
    isWordEnteringPlayer: false, // True if this player is entering the word
    gameMode: null, // 'local' or 'online'
    guessingPlayers: [], // Players participating in guessing phase
    turnsRemaining: 0,
    voteResults: null,
    hasVoted: false
};

// Mode Selection
function selectMode(mode) {
    gameState.gameMode = mode;
    
    if (mode === 'local') {
        // Local mode - use localhost or LAN IP
        initSocket('local');
    } else {
        // Online mode - use deployed server
        initSocket('online');
    }
    
    showScreen('join-screen');
}

// Initialize Socket.IO connection
function initSocket(mode) {
    // Determine server URL based on mode
    let socketUrl;
    
    if (mode === 'local') {
        // Local mode - use current location (localhost or LAN IP)
        const protocol = window.location.protocol;
        const host = window.location.host;
        socketUrl = `${protocol}//${host}`;
    } else {
        // Online mode - use deployed server (change this to your deployed URL)
        // Prefer explicit BACKEND_URL if provided in index.html
        if (window.BACKEND_URL && window.BACKEND_URL.length > 0) {
            socketUrl = window.BACKEND_URL;
        } else {
            // Fallback to current origin
            socketUrl = window.location.origin;
        }
    }
    
    gameState.socket = io(socketUrl);
    
    gameState.socket.on('connect', () => {
        gameState.playerId = gameState.socket.id;
    });

    // Receive role assignment (private to each player)
    gameState.socket.on('role-assigned', (data) => {
        if (data) {
            gameState.currentRole = data.role; // 'imposter', 'normal', or null
            gameState.currentWord = data.word || null;
            gameState.isWordEnteringPlayer = data.isWordEnteringPlayer || false;
            displayRoleCard();
            displayWordCard();
        }
    });
    gameState.socket.on('join-success', (data) => {
        gameState.roomId = data.roomId;
        gameState.roomCode = data.roomCode;
        gameState.isOwner = data.isOwner;
        showScreen('lobby-screen');
        updateRoomDisplay();
    });

    gameState.socket.on('room-created', (data) => {
        gameState.roomId = data.roomId;
        gameState.roomCode = data.roomCode;
        gameState.isOwner = data.isOwner;
        showScreen('lobby-screen');
        updateRoomDisplay();
    });

    gameState.socket.on('join-error', (data) => {
        showError(data.message);
    });

    gameState.socket.on('player-joined', (data) => {
        gameState.players = data.players;
        updatePlayersList();
    });

    gameState.socket.on('player-left', (data) => {
        gameState.players = data.players;
        updatePlayersList();
        // If we are in a game and our owner status changed, show message
        if (gameState.gameStarted && !gameState.isOwner) {
            const nowOwner = gameState.players.find(p => p.isOwner);
            if (nowOwner && nowOwner.id === gameState.playerId) {
                showError('You are now the room owner');
                gameState.isOwner = true;
            }
        }
    });

    gameState.socket.on('settings-updated', (settings) => {
        updateSettingsDisplay(settings);
    });

    gameState.socket.on('game-started', (data) => {
        gameState.gameStarted = true;
        gameState.currentSession = data.sessionNumber || 1;
        gameState.totalSessions = data.totalSessions || gameState.totalSessions;
        gameState.currentRound = data.roundNumber || 1;
        gameState.totalRounds = data.totalRounds || 3;
        gameState.currentPhase = data.currentPhase || 'word-entering';
        gameState.wordEnteringPlayerId = data.wordEnteringPlayerId;
        gameState.currentGuessingPlayerId = data.currentGuessingPlayerId;
        gameState.players = data.players || [];
        gameState.guessingPhaseStarted = false;
        gameState.currentRole = null;
        gameState.currentWord = null;
        gameState.isWordEnteringPlayer = (gameState.playerId === gameState.wordEnteringPlayerId);
        gameState.turnsRemaining = data.turnsRemaining || 0;
        gameState.voteResults = null;
        gameState.hasVoted = false;
        
        showScreen('game-screen');
        updateGameDisplay();
        
        // Show word-entering phase by default
        document.querySelectorAll('#word-entering-phase, #guessing-phase, #waiting-phase, #voting-phase, #reveal-phase').forEach(el => el.classList.add('hidden'));
        const enteringPhase = document.getElementById('word-entering-phase');
        if (enteringPhase) enteringPhase.classList.remove('hidden');
        
        updateWordEnteringPhase();
    });

    gameState.socket.on('role-assigned', (data) => {
        gameState.currentRole = data.role;
        gameState.currentWord = data.word || null;
        displayRoleCard();
    });

    gameState.socket.on('word-submitted', (data) => {
        gameState.currentRound = data.roundNumber || gameState.currentRound;
        gameState.totalRounds = data.totalRounds || gameState.totalRounds;
        gameState.currentPhase = data.currentPhase || 'guessing';
        gameState.currentGuessingPlayerId = data.currentGuessingPlayerId;
        gameState.players = data.players || [];
        gameState.guessingPhaseStarted = true;
        gameState.guessingPlayers = data.guessingPlayers || [];
        gameState.turnsRemaining = data.turnsRemaining || gameState.turnsRemaining;
        
        // Hide other phases, show guessing phase
        document.querySelectorAll('#word-entering-phase, #guessing-phase, #waiting-phase, #voting-phase, #reveal-phase').forEach(el => el.classList.add('hidden'));
        const guessingPhase = document.getElementById('guessing-phase');
        const waitingPhase = document.getElementById('waiting-phase');
        if (guessingPhase) guessingPhase.classList.remove('hidden');
        
        // If this player enters the word, show waiting screen
        if (gameState.isWordEnteringPlayer) {
            if (guessingPhase) guessingPhase.classList.add('hidden');
            if (waitingPhase) waitingPhase.classList.remove('hidden');
        }
        
        updateGameDisplay();
    });

    gameState.socket.on('turn-updated', (data) => {
        gameState.currentPhase = data.currentPhase;
        gameState.currentGuessingPlayerId = data.currentGuessingPlayerId;
        gameState.players = data.players || [];
        gameState.turnsRemaining = data.turnsRemaining || gameState.turnsRemaining;
        updateGameDisplay();
    });

    gameState.socket.on('round-ended', (data) => {
        gameState.currentRound = data.roundNumber;
        gameState.totalRounds = data.totalRounds;
        gameState.players = data.players || [];
        showRoundEndScreen();
    });

    gameState.socket.on('game-over', (data) => {
        showGameOverScreen();
    });

    gameState.socket.on('voting-started', (data) => {
        gameState.currentPhase = 'voting';
        gameState.players = data.players || [];
        gameState.guessingPlayers = data.guessingPlayers || [];
        gameState.hasVoted = false;
        showVotingPhase();
    });

    gameState.socket.on('vote-results', (data) => {
        gameState.voteResults = data.voteResults;
        gameState.players = data.players || [];
        showRevealPhase();
    });

    gameState.socket.on('session-ended', (data) => {
        gameState.currentSession = data.nextSessionNumber;
        gameState.totalSessions = data.totalSessions;
    });

    gameState.socket.on('room-closed', (data) => {
        showError(data.message || 'Room closed');
        setTimeout(() => {
            if (gameState.socket) gameState.socket.disconnect();
            resetLocalGameState();
            showScreen('landing-screen');
        }, 1500);
    });

    gameState.socket.on('room-reset', (data) => {
        gameState.gameStarted = false;
        gameState.currentRound = 1;
        gameState.currentPhase = 'lobby';
        gameState.players = data.players || [];
        updatePlayersList();
        showScreen('lobby-screen');
    });

    gameState.socket.on('game-error', (data) => {
        showError('❌ ' + data.message);
    });

    gameState.socket.on('disconnect', () => {});
}

// Screen Management
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(screenName);
    if (!target) {
        console.error('showScreen: target not found', screenName);
        return;
    }
    target.classList.add('active');
}

// Back to Landing
function backToLanding() {
    if (gameState.socket) {
        gameState.socket.disconnect();
    }
    gameState.gameMode = null;
    showScreen('landing-screen');
}

// Join/Create Room
document.getElementById('create-room-btn').addEventListener('click', () => {
    const name = document.getElementById('player-name-input').value.trim();
    if (!name) {
        showError('🎤 Please enter your name');
        return;
    }
    gameState.playerName = name;
    gameState.socket.emit('create-room', { playerName: name });
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    // Prefer the join-specific name input if provided, otherwise use the main name input
    const joinNameEl = document.getElementById('join-player-name-input');
    const name = (joinNameEl && joinNameEl.value.trim()) || document.getElementById('player-name-input').value.trim();
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    
    if (!name) {
        showError('🎤 Please enter your name');
        return;
    }
    if (!code || code.length !== 6) {
        showError('📋 Please enter a valid room code (6 characters)');
        return;
    }
    
    gameState.playerName = name;
    gameState.socket.emit('join-room', { playerName: name, roomCode: code });
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (gameState.socket) {
        gameState.socket.disconnect();
        location.reload();
    }
});

// Exit Game Button
document.getElementById('exit-game-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to exit the game? This will end the game for everyone.')) {
        if (gameState.socket) {
            gameState.socket.disconnect();
            location.reload();
        }
    }
});

// Error Display
function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 4000);
}

// Update Room Display
function updateRoomDisplay() {
    document.getElementById('room-code-display').textContent = gameState.roomCode;
    const gameCodeEl = document.getElementById('room-code-game');
    if (gameCodeEl) gameCodeEl.textContent = gameState.roomCode;
    updatePlayersList();
    setupCopyButton();
    setupCopyButton('game');
    
    if (gameState.isOwner) {
        document.getElementById('owner-controls').classList.remove('hidden');
        document.getElementById('waiting-message').classList.add('hidden');
    } else {
        document.getElementById('owner-controls').classList.add('hidden');
        document.getElementById('waiting-message').classList.remove('hidden');
    }
}

// Copy Room Code (supports lobby and game screen)
function setupCopyButton(screen) {
    const id = screen === 'game' ? 'copy-code-btn-game' : 'copy-code-btn';
    const copyBtn = document.getElementById(id);
    if (!copyBtn) return;
    copyBtn.addEventListener('click', () => {
        const code = gameState.roomCode;
        navigator.clipboard.writeText(code).then(() => {
            showCopyNotification(screen === 'game' ? 'copy-notification-game' : 'copy-notification');
        }).catch(() => {
            showError('Failed to copy room code');
        });
    });
}

function showCopyNotification(id = 'copy-notification') {
    const notification = document.getElementById(id);
    if (!notification) return;
    notification.textContent = '✓ Copied!';
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2000);
}

// Update Players List
function updatePlayersList() {
    const listEl = document.getElementById('players-list');
    document.getElementById('player-count').textContent = gameState.players.length;
    
    listEl.innerHTML = gameState.players.map(player => `
        <div class="player-item">
            <span class="player-name">${player.name}</span>
            <div>
                ${player.isOwner ? '<span class="player-badge owner">👑 Owner</span>' : ''}
                ${!player.alive ? '<span class="player-badge eliminated">💀 Eliminated</span>' : ''}
            </div>
        </div>
    `).join('');
    
    // Update start button state
    updateStartButtonState();
}

// Update the in-game players list
function updateInGamePlayersList() {
    const el = document.getElementById('in-game-players-list');
    if (!el) return;
    el.innerHTML = gameState.players.map(player => `
        <div class="player-item">
            <span class="player-name">${player.name}</span>
            <div>
                ${player.isOwner ? '<span class="player-badge owner">👑</span>' : ''}
                ${player.id === gameState.currentGuessingPlayerId ? '<span class="player-badge turn">▶️</span>' : ''}
            </div>
        </div>
    `).join('');
}

// Update Start Button State
function updateStartButtonState() {
    const startBtn = document.getElementById('start-game-btn');
    const playerCount = gameState.players.length;
    
    if (playerCount < 2) {
        startBtn.disabled = true;
        startBtn.title = 'Need at least 2 players to start';
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
    } else {
        startBtn.disabled = false;
        startBtn.title = '';
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
    }
}

// Settings Controls
function setupSettingsControls() {
    const controls = [
        { minus: 'max-players-minus', plus: 'max-players-plus', input: 'max-players', setting: 'maxPlayers' },
        { minus: 'imposters-minus', plus: 'imposters-plus', input: 'imposters-count', setting: 'importerCount' },
        { minus: 'rounds-minus', plus: 'rounds-plus', input: 'rounds-count', setting: 'roundCount' }
    ];

    controls.forEach(control => {
        const input = document.getElementById(control.input);
        document.getElementById(control.minus).addEventListener('click', () => {
            input.value = Math.max(parseInt(input.min), parseInt(input.value) - 1);
            emitSettings();
        });
        document.getElementById(control.plus).addEventListener('click', () => {
            input.value = Math.min(parseInt(input.max), parseInt(input.value) + 1);
            emitSettings();
        });
    });
}

function emitSettings() {
    if (!gameState.isOwner) return;
    gameState.socket.emit('update-settings', {
        maxPlayers: parseInt(document.getElementById('max-players').value),
        importerCount: parseInt(document.getElementById('imposters-count').value),
        roundCount: parseInt(document.getElementById('rounds-count').value)
    });
}

function updateSettingsDisplay(settings) {
    document.getElementById('max-players').value = settings.maxPlayers;
    document.getElementById('imposters-count').value = settings.importerCount;
    document.getElementById('rounds-count').value = settings.roundCount;
}

// Start Game
document.getElementById('start-game-btn').addEventListener('click', () => {
    const playerCount = gameState.players.length;
    
    // Check if there are at least 2 players
    if (playerCount < 2) {
        showError('❌ At least 2 players are required to start the game');
        return;
    }
    
    gameState.socket.emit('start-game');
});

// Word Entering Phase Display
function updateWordEnteringPhase() {
    const selfEl = document.getElementById('word-entering-self');
    const waitingEl = document.getElementById('word-entering-waiting');
    const playerNameEl = document.getElementById('word-entering-player-name');
    const wordEnteringBanner = document.getElementById('word-entering-banner');
    
    const isWordEnteringPlayer = gameState.playerId === gameState.wordEnteringPlayerId;
    
    // Update top banner showing who is entering
    if (wordEnteringBanner) {
        const wordPlayer = gameState.players.find(p => p.id === gameState.wordEnteringPlayerId);
        if (wordPlayer) {
            wordEnteringBanner.textContent = `⏳ ${wordPlayer.name} is entering the word...`;
            wordEnteringBanner.classList.remove('hidden');
        }
    }
    
    if (isWordEnteringPlayer) {
        if (selfEl) selfEl.classList.remove('hidden');
        if (waitingEl) waitingEl.classList.add('hidden');
    } else {
        if (selfEl) selfEl.classList.add('hidden');
        if (waitingEl) waitingEl.classList.remove('hidden');
        
        // Find word-entering player's name
        const wordPlayer = gameState.players.find(p => p.id === gameState.wordEnteringPlayerId);
        if (playerNameEl && wordPlayer) {
            playerNameEl.textContent = `${wordPlayer.name} is entering the word...`;
        }
    }
}

// Game Display
function updateGameDisplay() {
    // update session / round info
    const sessionEl = document.getElementById('current-session');
    const totalSessEl = document.getElementById('total-sessions');
    if (sessionEl) sessionEl.textContent = gameState.currentSession;
    if (totalSessEl) totalSessEl.textContent = gameState.totalSessions;

    document.getElementById('current-round').textContent = gameState.currentRound;
    document.getElementById('total-rounds').textContent = gameState.totalRounds;

    // hide banners by default
    document.getElementById('word-entering-banner').classList.add('hidden');
    document.getElementById('current-player-banner').classList.add('hidden');

    // choose which phase to render
    switch (gameState.currentPhase) {
        case 'word-entering':
            updateWordEnteringPhase();
            break;
        case 'guessing':
            if (gameState.isWordEnteringPlayer) {
                // show waiting screen
                document.getElementById('word-entering-phase').classList.add('hidden');
                document.getElementById('guessing-phase').classList.add('hidden');
                const waitingPhase = document.getElementById('waiting-phase');
                if (waitingPhase) waitingPhase.classList.remove('hidden');

                const waitingList = document.getElementById('waiting-game-players');
                if (waitingList) {
                    waitingList.innerHTML = gameState.players.map(player => `
                        <div class="player-item">
                            <span class="player-name">${player.name}</span>
                            <div>
                                ${player.id === gameState.currentGuessingPlayerId ? '<span class="player-badge turn">🎤 Speaking</span>' : ''}
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                updateGuessingPhaseDisplay();
            }
            break;
        case 'voting':
            showVotingPhase();
            break;
        case 'reveal':
            showRevealPhase();
            break;
        case 'session-end':
            // could show a brief message but game-started event will transition
            break;
        case 'game-over':
            showGameOverScreen();
            break;
        default:
            updateWordEnteringPhase();
    }

    updateInGamePlayersList();
}

// helper to render voting screen
function showVotingPhase() {
    document.querySelectorAll('#word-entering-phase, #guessing-phase, #waiting-phase, #voting-phase, #reveal-phase').forEach(el => el.classList.add('hidden'));
    const voting = document.getElementById('voting-phase');
    if (voting) voting.classList.remove('hidden');
    updateVotingList();
}

function updateVotingList() {
    const listEl = document.getElementById('voting-players-list');
    if (!listEl) return;
    // only guessing players can be voted on
    const eligible = gameState.players.filter(p => p.id !== gameState.wordEnteringPlayerId);
    listEl.innerHTML = eligible.map(player => `
        <div class="player-item" data-id="${player.id}">
            <span class="player-name">${player.name}</span>
        </div>
    `).join('');

    // attach click handlers
    listEl.querySelectorAll('.player-item').forEach(item => {
        item.addEventListener('click', () => {
            if (gameState.hasVoted) return;
            const targetId = item.getAttribute('data-id');
            gameState.socket.emit('submit-vote', { targetId });
            gameState.hasVoted = true;
            item.style.opacity = '0.5';
        });
    });
}

function showRevealPhase() {
    document.querySelectorAll('#word-entering-phase, #guessing-phase, #waiting-phase, #voting-phase, #reveal-phase').forEach(el => el.classList.add('hidden'));
    const reveal = document.getElementById('reveal-phase');
    if (reveal) reveal.classList.remove('hidden');
    // display results
    const content = document.getElementById('reveal-content');
    if (!content || !gameState.voteResults) return;
    const names = id => gameState.players.find(p=>p.id===id)?.name || 'Unknown';
    const { winners, actual, counts } = gameState.voteResults;
    let html = '<p>Votes:</p><ul>';
    for (const [id, cnt] of Object.entries(counts)) {
        html += `<li>${names(id)}: ${cnt}</li>`;
    }
    html += '</ul>';
    html += `<p>Imposters were: ${actual.map(names).join(', ')}</p>`;
    html += `<p>Voted ${winners.map(names).join(', ')}</p>`;
    content.innerHTML = html;
}

function updateGuessingPhaseDisplay() {
    const isMyTurn = gameState.playerId === gameState.currentGuessingPlayerId;
    const turnIndicator = document.getElementById('turn-indicator');
    const waitingTurn = document.getElementById('waiting-turn');
    const passBtn = document.getElementById('pass-btn');
    const currentPlayerBanner = document.getElementById('current-player-banner');
    
    // ALWAYS show prominent top banner indicating current player
    if (currentPlayerBanner) {
        const currentPlayer = gameState.players.find(p => p.id === gameState.currentGuessingPlayerId);
        if (currentPlayer) {
            currentPlayerBanner.innerHTML = '<div style="text-align: center; font-size: 18px; font-weight: bold; color: #ff6b6b;">🎤 ' + currentPlayer.name + '\'s Turn to Speak</div>';
            currentPlayerBanner.classList.remove('hidden');
        }
    }
    
    if (isMyTurn) {
        if (turnIndicator) turnIndicator.classList.remove('hidden');
        if (waitingTurn) waitingTurn.classList.add('hidden');
        if (passBtn) passBtn.disabled = false;
    } else {
        if (turnIndicator) turnIndicator.classList.add('hidden');
        if (waitingTurn) waitingTurn.classList.remove('hidden');
        
        // Update waiting text with current player's name
        const currentPlayer = gameState.players.find(p => p.id === gameState.currentGuessingPlayerId);
        if (currentPlayer && document.getElementById('current-player-name')) {
            document.getElementById('current-player-name').textContent = currentPlayer.name;
        }
    }
}

// Flippable Card Logic
let flippedCard = null;

function flipCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    // If another card is flipped, flip it back
    if (flippedCard && flippedCard !== cardId) {
        document.getElementById(flippedCard).classList.remove('flipped');
    }
    
    card.classList.toggle('flipped');
    flippedCard = card.classList.contains('flipped') ? cardId : null;
}

function displayRoleCard() {
    const roleContent = document.getElementById('role-content');
    if (!roleContent) return;
    
    if (gameState.currentRole === 'imposter') {
        roleContent.innerHTML = '<p style="font-size: 24px;">🕵️</p><p style="margin-top: 10px;"><strong>You are the</strong></p><p><strong>IMPOSTER</strong></p>';
    } else if (gameState.currentRole === 'normal') {
        roleContent.innerHTML = '<p style="font-size: 24px;">👤</p><p style="margin-top: 10px;"><strong>You are a</strong></p><p><strong>NORMAL PLAYER</strong></p>';
    } else if (gameState.isWordEnteringPlayer) {
        roleContent.innerHTML = '<p style="font-size: 24px;">✍️</p><p style="margin-top: 10px;"><strong>You are the</strong></p><p><strong>WORD KEEPER</strong></p>';
    } else {
        roleContent.innerHTML = '<p>Loading...</p>';
    }
}

function displayWordCard() {
    const wordContent = document.getElementById('word-content');
    if (!wordContent) return;
    
    if (gameState.isWordEnteringPlayer) {
        // Word-entering player doesn't see the word card during guessing
        wordContent.innerHTML = '<p><strong>Waiting...</strong></p><p style="font-size: 12px; margin-top: 10px;">You\'ve entered the word.<br>Watch the game!</p>';
    } else if (gameState.currentRole === 'imposter') {
        wordContent.innerHTML = '<p style="font-size: 24px;">🤐</p><p style="margin-top: 10px;"><strong>You don\'t know<br>the word!</strong></p><p style="font-size: 12px; margin-top: 10px;">Find the word<br>from clues</p>';
    } else if (gameState.currentWord) {
        wordContent.innerHTML = `<p style="font-size: 32px; font-weight: bold;">${gameState.currentWord.toUpperCase()}</p><p style="font-size: 12px; margin-top: 10px;">You know the word!<br>Help without saying it</p>`;
    } else {
        wordContent.innerHTML = '<p>Loading...</p>';
    }
}

// Word Submission
document.addEventListener('DOMContentLoaded', () => {
    const submitWordBtn = document.getElementById('submit-word-btn');
    if (submitWordBtn) {
        submitWordBtn.addEventListener('click', () => {
            const word = document.getElementById('word-input').value.trim();
            if (!word) {
                showError('Please enter a word');
                return;
            }
            gameState.socket.emit('submit-word', { word });
            document.getElementById('word-input').value = '';
        });
    }
    
    const passBtn = document.getElementById('pass-btn');
    if (passBtn) {
        passBtn.addEventListener('click', () => {
            gameState.socket.emit('pass-turn');
            passBtn.disabled = true;
        });
    }
});

// Round End Screen
function showRoundEndScreen() {
    const roundEndPhase = document.getElementById('round-end-phase');
    if (roundEndPhase) {
        roundEndPhase.classList.remove('hidden');
        document.getElementById('word-entering-phase').classList.add('hidden');
        document.getElementById('guessing-phase').classList.add('hidden');
    }
}

// Game Over Screen
function showGameOverScreen() {
    showScreen('game-over-screen');
}

document.getElementById('return-to-lobby-btn').addEventListener('click', () => {
    // This would require a server-side reset, for now reload
    location.reload();
});



// Warn before leaving or reloading during an active game
window.addEventListener('beforeunload', (e) => {
    if (gameState.gameStarted) {
        e.preventDefault();
        e.returnValue = 'You are in a game. Are you sure you want to leave?';
    }
});

// Reset local UI/game state
function resetLocalGameState() {
    gameState.roomId = null;
    gameState.roomCode = null;
    gameState.isOwner = false;
    gameState.currentRole = null;
    gameState.currentWord = null;
    gameState.gameStarted = false;
    gameState.currentRound = 1;
    gameState.totalRounds = 3;
    gameState.currentPhase = 'lobby';
    gameState.wordEnteringPlayerId = null;
    gameState.currentGuessingPlayerId = null;
    gameState.guessingPhaseStarted = false;
    gameState.players = [];
}

// Initialize
setupSettingsControls();
// Don't auto-initialize socket - wait for mode selection
