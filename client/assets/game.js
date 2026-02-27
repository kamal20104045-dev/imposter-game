// Game State
const gameState = {
    socket: null,
    roomId: null,
    roomCode: null,
    playerId: null,
    playerName: null,
    isOwner: false,
    players: [],
    currentRole: null,
    gameStarted: false,
    currentRound: 1,
    totalRounds: 3,
    currentTurnPlayerId: null,
    currentTurnPlayerName: null,
    inVotingPhase: false,
    timeLimit: 30,
    votingTimeLimit: 20,
    playersSubmittedThisRound: new Set(),
    gameMode: null // 'local' or 'online'
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
        console.log(`Connected to server (${mode} mode)`, socketUrl);
        gameState.playerId = gameState.socket.id;
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
    });

    gameState.socket.on('settings-updated', (settings) => {
        updateSettingsDisplay(settings);
    });

    gameState.socket.on('game-started', (data) => {
        gameState.gameStarted = true;
        gameState.currentRound = data.roundNumber;
        gameState.totalRounds = data.totalRounds;
        gameState.currentTurnPlayerId = data.currentTurn;
        gameState.timeLimit = data.timeLimit;
        gameState.playersSubmittedThisRound = new Set();
        showScreen('game-screen');
        displayYourRole();
        updateGameDisplay();
        startTurnTimer(data.timeLimit);
    });

    gameState.socket.on('role-assigned', (data) => {
        gameState.currentRole = data.role;
        displayYourRole();
    });

    gameState.socket.on('turn-updated', (data) => {
        gameState.currentTurnPlayerId = data.currentTurn;
        updateGameDisplay();
        if (data.playersLeft > 0) startTurnTimer(gameState.timeLimit);
    });

    gameState.socket.on('word-submitted', (data) => {
        // data: { submittedById, submittedBy, word (or null), nextTurn, playersLeft }
        const submitterName = data.submittedBy;
        const submitterId = data.submittedById;
        if (data.word) {
            // Non-imposters receive the actual word
            console.log(`${submitterName} submitted: ${data.word}`);
        } else {
            // Imposters will receive a null word
            console.log(`${submitterName} submitted a word (hidden from you)`);
        }
        gameState.playersSubmittedThisRound.add(submitterId);
        gameState.currentTurnPlayerId = data.nextTurn;
        updateGameDisplay();
        if (data.playersLeft > 0) {
            startTurnTimer(gameState.timeLimit);
        }
    });

    gameState.socket.on('voting-phase-started', (data) => {
        gameState.inVotingPhase = true;
        gameState.players = data.players;
        // store eligible voters (array of ids) if provided
        gameState.eligibleVoters = data.voters || gameState.players.filter(p => p.alive).map(p => p.id);
        showVotingPhase(data.players, data.timeLimit, gameState.eligibleVoters);
        startVotingTimer(data.timeLimit);
    });

    gameState.socket.on('voting-results', (data) => {
        showVotingResults(data);
    });

    gameState.socket.on('game-over', (data) => {
        showGameOver(data.finalResults);
    });

    gameState.socket.on('room-closed', (data) => {
        showError(data.message || 'Room closed');
        // disconnect and return to landing after short delay
        setTimeout(() => {
            if (gameState.socket) gameState.socket.disconnect();
            resetLocalGameState();
            showScreen('landing-screen');
        }, 1500);
    });

    gameState.socket.on('room-reset', (data) => {
        // show lobby and clear game-specific UI so owner can start fresh
        gameState.gameStarted = false;
        gameState.currentRound = 1;
        gameState.currentTurnPlayerId = null;
        gameState.playersSubmittedThisRound = new Set();
        gameState.inVotingPhase = false;
        gameState.players = data.players || gameState.players;
        updatePlayersList();
        showScreen('lobby-screen');
    });

    gameState.socket.on('game-error', (data) => {
        showError('❌ ' + data.message);
    });

    gameState.socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// Screen Management
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName).classList.add('active');
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
    updatePlayersList();
    setupCopyButton();
    
    if (gameState.isOwner) {
        document.getElementById('owner-controls').classList.remove('hidden');
        document.getElementById('waiting-message').classList.add('hidden');
    } else {
        document.getElementById('owner-controls').classList.add('hidden');
        document.getElementById('waiting-message').classList.remove('hidden');
    }
}

// Copy Room Code
function setupCopyButton() {
    const copyBtn = document.getElementById('copy-code-btn');
    copyBtn.addEventListener('click', () => {
        const code = gameState.roomCode;
        navigator.clipboard.writeText(code).then(() => {
            showCopyNotification();
        }).catch(() => {
            showError('Failed to copy room code');
        });
    });
}

function showCopyNotification() {
    const notification = document.getElementById('copy-notification');
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

// Update the in-game players list (shows during gameplay)
function updateInGamePlayersList() {
    const el = document.getElementById('in-game-players-list');
    if (!el) return;
    el.innerHTML = gameState.players.map(player => `
        <div class="player-item">
            <span class="player-name">${player.name}</span>
            <div>
                ${player.isOwner ? '<span class="player-badge owner">👑</span>' : ''}
                ${!player.alive ? '<span class="player-badge eliminated">💀</span>' : ''}
                ${player.id === gameState.currentTurnPlayerId ? '<span class="player-badge turn">▶️</span>' : ''}
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

// Game Screen
function updateGameDisplay() {
    document.getElementById('current-round').textContent = gameState.currentRound;
    document.getElementById('total-rounds').textContent = gameState.totalRounds;
    
    const isMyTurn = gameState.currentTurnPlayerId === gameState.playerId;
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId);
    const currentName = currentPlayer ? currentPlayer.name : 'Unknown';
    
    document.getElementById('turn-status').textContent = `Turn: ${currentName}`;
    
    const yourTurn = document.getElementById('your-turn');
    const waitingTurn = document.getElementById('waiting-turn');
    
    if (isMyTurn) {
        yourTurn.classList.remove('hidden');
        waitingTurn.classList.add('hidden');
        yourTurn.classList.add('active');
        waitingTurn.classList.remove('active');
    } else {
        yourTurn.classList.add('hidden');
        waitingTurn.classList.remove('hidden');
        yourTurn.classList.remove('active');
        waitingTurn.classList.add('active');
    }

    // Update player status display
    updatePlayersStatus();
    updateInGamePlayersList();
}

// Word Submission
document.getElementById('submit-word-btn').addEventListener('click', () => {
    const word = document.getElementById('word-input').value.trim();
    if (!word) {
        showError('Please enter a word');
        return;
    }
    gameState.socket.emit('submit-word', { word });
    document.getElementById('word-input').value = '';
});

// Timers
let turnTimerInterval;
let votingTimerInterval;

function startTurnTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('turn-timer');
    
    clearInterval(turnTimerInterval);
    timerEl.textContent = remaining;
    timerEl.classList.remove('warning', 'danger');
    
    turnTimerInterval = setInterval(() => {
        remaining--;
        timerEl.textContent = remaining;
        
        if (remaining <= 5) {
            timerEl.classList.add('warning');
        }
        if (remaining <= 2) {
            timerEl.classList.add('danger');
        }
        
        if (remaining <= 0) {
            clearInterval(turnTimerInterval);
        }
    }, 1000);
}

function startVotingTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('voting-timer');
    
    clearInterval(votingTimerInterval);
    timerEl.textContent = remaining;
    timerEl.classList.remove('warning', 'danger');
    
    votingTimerInterval = setInterval(() => {
        remaining--;
        timerEl.textContent = remaining;
        
        if (remaining <= 5) {
            timerEl.classList.add('warning');
        }
        if (remaining <= 2) {
            timerEl.classList.add('danger');
        }
        
        if (remaining <= 0) {
            clearInterval(votingTimerInterval);
        }
    }, 1000);
}

// Voting Phase
function showVotingPhase(players, timeLimit) {
    document.getElementById('turn-phase').classList.remove('active');
    document.getElementById('voting-phase').classList.add('active');
    
    const alivePlayers = players.filter(p => p.alive);
    const votingEl = document.getElementById('voting-options');
    
    // If eligibleVoters provided, only show vote buttons for those players
    const eligible = gameState.eligibleVoters || alivePlayers.map(p => p.id);

    votingEl.innerHTML = alivePlayers.map(player => {
        if (!eligible.includes(player.id)) {
            return `
                <div class="vote-btn disabled">${player.name} (not voting)</div>
            `;
        }
        return `
            <button class="vote-btn" onclick="submitVote('${player.id}', this)">
                ${player.name}
            </button>
        `;
    }).join('');
}

let selectedVote = null;

function submitVote(playerId, element) {
    if (selectedVote) {
        document.querySelector('.vote-btn.selected').classList.remove('selected');
    }
    selectedVote = playerId;
    element.classList.add('selected');
    gameState.socket.emit('submit-vote', { votedPlayerId: playerId });
}

// Results
function showVotingResults(data) {
    clearInterval(votingTimerInterval);
    document.getElementById('voting-phase').classList.remove('active');
    document.getElementById('results-phase').classList.add('active');
    
    const resultsEl = document.getElementById('results-content');
    const eliminated = data.eliminatedPlayer ? 
        gameState.players.find(p => p.id === data.eliminatedPlayer)?.name : 'Nobody';
    
    let resultHTML = `
        <div class="result-item">
            <h4>Eliminated Player</h4>
            <p>${eliminated}</p>
        </div>
    `;
    
    if (data.impostersRevealed.length > 0) {
        resultHTML += `
            <div class="result-item imposter">
                <h4>🕵️ Imposters Revealed</h4>
                <p>${data.impostersRevealed.map(i => i.name).join(', ')}</p>
            </div>
        `;
    }
    
    resultsEl.innerHTML = resultHTML;
}

// Game Over
function showGameOver(results) {
    clearInterval(turnTimerInterval);
    clearInterval(votingTimerInterval);
    
    document.getElementById('voting-phase').classList.remove('active');
    document.getElementById('results-phase').classList.remove('active');
    
    showScreen('game-over-screen');
    
    const winner = results.winner;
    let title = '👥 Normal Players Win!';
    if (winner === 'imposter') {
        title = '🕵️ Imposters Win!';
    } else if (winner === 'tie') {
        title = '🤝 It\'s a Tie!';
    }
    
    document.getElementById('game-result-title').textContent = title;
    
    const contentEl = document.getElementById('game-result-content');
    contentEl.innerHTML = `
        <div class="team-section">
            <h4>Imposters</h4>
            <ul class="team-members">
                ${results.imposters.map(p => `
                    <li class="${p.alive ? 'alive' : 'dead'}">
                        ${p.name}
                    </li>
                `).join('')}
            </ul>
        </div>
        
        <div class="team-section">
            <h4>Normal Players</h4>
            <ul class="team-members">
                ${results.normalPlayers.map(p => `
                    <li class="${p.alive ? 'alive' : 'dead'}">
                        ${p.name}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

document.getElementById('return-to-lobby-btn').addEventListener('click', () => {
    // This would require a server-side reset, for now reload
    location.reload();
});

// How to Play Modal
function setupHowToPlayModal() {
    const modal = document.getElementById('how-to-play-modal');
    const btn = document.getElementById('how-to-play-btn');
    
    btn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });
}

function closeHowToPlay() {
    const modal = document.getElementById('how-to-play-modal');
    modal.classList.add('hidden');
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('how-to-play-modal');
    if (e.target === modal) {
        modal.classList.add('hidden');
    }
});

// Display Your Role
function displayYourRole() {
    // Role will be sent from server in a future update
    // For now, show placeholder
    const roleDisplay = document.getElementById('role-badge');
    if (gameState.currentRole === 'imposter') {
        roleDisplay.textContent = '🕵️ You are the Imposter';
        roleDisplay.classList.add('imposter');
    } else if (gameState.currentRole === 'normal') {
        roleDisplay.textContent = '👤 You are a Normal Player';
        roleDisplay.classList.add('normal');
    }
}

// Update Players Status Display
function updatePlayersStatus() {
    const statusEl = document.getElementById('players-status');
    if (!statusEl) return;
    
    const alivePlayers = gameState.players.filter(p => p.alive);
    
    statusEl.innerHTML = alivePlayers.map(player => {
        let badge = 'waiting';
        let badgeText = 'Waiting';
        
        if (player.id === gameState.currentTurnPlayerId) {
            badge = 'waiting';
            badgeText = 'Current Turn';
        } else if (gameState.playersSubmittedThisRound.has(player.id)) {
            badge = 'submitted';
            badgeText = 'Submitted';
        }
        
        return `
            <div class="player-status-item">
                <span>${player.name}</span>
                <span class="player-status-badge ${badge}">${badgeText}</span>
            </div>
        `;
    }).join('');
}

// Reset local UI/game state (preserve socket disconnected behavior separately)
function resetLocalGameState() {
    gameState.roomId = null;
    gameState.roomCode = null;
    gameState.isOwner = false;
    gameState.currentRole = null;
    gameState.gameStarted = false;
    gameState.currentRound = 1;
    gameState.totalRounds = 3;
    gameState.currentTurnPlayerId = null;
    gameState.currentTurnPlayerName = null;
    gameState.inVotingPhase = false;
    gameState.playersSubmittedThisRound = new Set();
    gameState.players = [];
    // clear UI timers
    clearInterval(turnTimerInterval);
    clearInterval(votingTimerInterval);
}

// Initialize
setupSettingsControls();
setupHowToPlayModal();
// Don't auto-initialize socket - wait for mode selection
