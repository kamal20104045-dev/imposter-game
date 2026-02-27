# 🕵️ Finding the Imposter

A real-time multiplayer web game built with Node.js, Express, and Socket.IO. Play with friends on mobile, tablet, or desktop!

## Features

✨ **Core Gameplay**
- Real-time multiplayer (2-16 players)
- Imposter role assignment and identification
- Turn-based word submission system
- Voting and elimination mechanics
- Multiple rounds with customizable settings
- Auto-skip turn timer with AFK handling

📱 **Mobile-First Design**
- Responsive UI optimized for all devices
- Touch-friendly buttons and interface
- Works on iOS, Android, and desktop
- Supports local Wi-Fi play over LAN

🎮 **Room System**
- Create private rooms with unique 6-character codes
- Join rooms via code
- Room owner controls game settings
- Up to 16 players per room
- Multiple simultaneous rooms supported

🌐 **Play Modes**
- **Local Mode**: Play with friends on same Wi-Fi network
- **Online Mode**: Connect with players worldwide using room codes
- Landing page with mode selection
- Same game experience in both modes

🎯 **Quality of Life**
- How-to-Play instructions
- Copy room code with one click
- Player status badges (waiting, submitted, eliminated)
- Exit game button
- Minimum player validation before game start
- Better error messages with emojis
- Show your role during gameplay

## Getting Started

### Prerequisites
- Node.js 16+ (Download from [nodejs.org](https://nodejs.org))
- Any modern web browser

### Installation

1. **Clone/extract the project**
   ```bash
   cd imposter-game
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

   You'll see:
   ```
   🎮 Imposter Game Server running on:
      Local:  http://localhost:3000
      LAN:    http://<your-ip>:3000
   ```

### Playing the Game

#### Mode Selection
1. Open `http://localhost:3000` in your browser
2. You'll see two options:
   - **Play Local** - For Wi-Fi games with friends nearby
   - **Play Online** - For internet games with anyone

#### Local Wi-Fi (Play Local)
1. Both players on same Wi-Fi network
2. Find your computer's IP:
   ```bash
   # Windows: Run in Command Prompt
   ipconfig
   # Look for "IPv4 Address" (e.g., 192.168.1.100)
   ```
3. Player 1: `http://localhost:3000`
4. Player 2-16: `http://<your-ip>:3000` (same Wi-Fi)

#### Over Internet (Play Online - Deployed)
1. Deploy the server to Render, Railway, or similar
2. Share your deployed URL with friends
3. Everyone goes to that URL
4. Create/join rooms using room codes

### Game Flow

1. **Mode Selection**
   - Choose "Play Local" or "Play Online"
   - Connects to appropriate server

2. **Create/Join Room**
   - Enter your player name
   - Create a new room or join with a 6-character code
   - Can copy room code with one click

3. **Lobby**
   - Room owner configures:
     - Maximum players
     - Number of imposters
     - Number of rounds
   - Start button disabled until 2+ players join
   - Owner starts the game

4. **Gameplay**
   - Players take turns entering a word
   - Imposter must guess the word
   - After all players submit or time expires → voting phase

4. **Voting**
   - Players vote to eliminate someone
   - Most voted player is eliminated
   - Results and imposter reveal shown

5. **Results**
   - Normal players win if all imposters are eliminated
   - Imposters win if they survive all rounds
   - Game ends automatically

## Game Rules

### Roles
- **Normal Players**: Know the secret word, try to identify the imposter
- **Imposter**: Doesn't know the word, tries to fake knowing it while avoiding detection

### Turn Phase
- Each player gets 30 seconds to submit a word
- Can't submit twice in the same round
- Timer auto-skips inactive players

### Voting Phase
- All alive players vote for who they think is the imposter
- Most voted player is eliminated
- Votes are simultaneous (20 second timer)

### Win Conditions
- **Normal Players Win**: All imposters eliminated
- **Imposters Win**: Survive all rounds without elimination
- Game ends after configured number of rounds

## Room Settings

| Setting | Min | Max | Default |
|---------|-----|-----|---------|
| Max Players | 2 | 16 | 8 |
| Imposters | 1 | 5 | 2 |
| Rounds | 1 | 10 | 3 |

## Project Structure

```
imposter-game/
├── server/
│   ├── src/
│   │   ├── index.js           (Main server + Socket.IO handlers)
│   │   ├── game-manager.js    (Room and player management)
│   │   └── game-room.js       (Game logic and state)
│   ├── package.json
│   └── node_modules/
├── client/
│   ├── index.html             (Main game interface)
│   └── assets/
│       ├── styles.css         (Responsive styling)
│       └── game.js            (Frontend logic)
└── README.md
```

## Technology Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript
- **Communication**: WebSockets (Socket.IO)
- **Database**: In-memory (no persistence)

**No external APIs, databases, or paid services required!**

## Deployment

### Quick Start
1. **Local Network Only?** Just run `npm start` and share your IP
2. **Want internet play?** Deploy to Render/Railway (see DEPLOYMENT.md)
3. **Need more help?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions

### Option 1: Local Network (Free - No Deployment)

```bash
# Start the server
cd server
npm start

# Get your IP address
ipconfig  # Windows
ifconfig  # Mac/Linux

# Share with friends: http://<your-ip>:3000
# They must be on same Wi-Fi
```

### Option 2: Free Cloud Hosting (Render/Railway)

See [DEPLOYMENT.md](DEPLOYMENT.md) for:
- Step-by-step Render.com deployment
- Railway.app setup
- Updating server URL for online mode
- Testing and troubleshooting

## Troubleshooting

### "npm: command not found"
- Install Node.js from [nodejs.org](https://nodejs.org)
- Restart terminal/command prompt

### Server won't start
```bash
# Check if port 3000 is already in use
# Try a different port:
PORT=3001 npm start
```

### Can't connect from another device
1. Make sure both devices are on same Wi-Fi network
2. Find your computer's LAN IP:
   - Windows: `ipconfig` → look for IPv4 Address
   - Mac/Linux: `ifconfig` → look for inet
3. Use that IP in the URL: `http://192.168.x.x:3000`
4. Allow firewall access if prompted

### Game feels laggy
- Close other apps using bandwidth
- Both players should be on same Wi-Fi network
- Check internet connection

## Features Coming Soon

- [ ] Game statistics and player history
- [ ] Custom word lists
- [ ] Game chat during rounds
- [ ] Player profiles and leaderboards
- [ ] Different game modes
- [ ] Sound effects and animations

## Contributing

Found a bug? Want to add a feature?
- Open an issue on GitHub
- Create a pull request with improvements

## License

MIT License - Free to use and modify

## Support

Need help?
- Check Troubleshooting section above
- Make sure Node.js is installed correctly
- Verify port 3000 isn't in use
- Test with `npm start` directly in terminal

---

**Made with ❤️ for friends and parties**

## Deployment Configuration Notes

- Frontend config: open `client/index.html` and set `window.BACKEND_URL` to your deployed backend URL when hosting the frontend separately (GitHub Pages). Example:

```html
<script>
   // e.g. 'https://imposter-backend.onrender.com'
   window.BACKEND_URL = '';
</script>
```

- Backend CORS: the server reads `FRONTEND_ORIGIN` env var. If you deploy the frontend to GitHub Pages, set `FRONTEND_ORIGIN` to `https://<yourusername>.github.io` to restrict allowed origins. If not set, CORS defaults to `*`.

- GitHub Pages automation: A GitHub Actions workflow is included at `.github/workflows/deploy_client.yml` that publishes the `client/` folder to the `gh-pages` branch on push to `main`.

If you want, I can help deploy the server to Render and set the `BACKEND_URL` and `FRONTEND_ORIGIN` values for you.
