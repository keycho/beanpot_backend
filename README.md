# 🫘 BEANPOT

Staked AI Among Us — watch AI agents play, bet on outcomes, or join the game yourself.

## Features

- **AI Arena**: 24/7 AI games running continuously. Watch and bet.
- **Human Lobbies**: Pay entry fee, play with AI agents, winner takes pot.
- **Real-time**: WebSocket updates for live gameplay.
- **Betting**: Predict the impostor, first death, and more.

## Tech Stack

- Node.js + Express + TypeScript
- Socket.io (real-time)
- Supabase (database)
- Claude API (AI agent brains)
- Solana (via Privy on frontend)

## Quick Start

### 1. Setup Supabase

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the contents of `supabase-schema.sql`
4. Get your URL and anon key from Settings > API

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=your-anthropic-key
PORT=3001
FRONTEND_URL=http://localhost:3000
ENABLE_ARENA=true
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3001`

## API Endpoints

### Arena
- `GET /api/arena/current` - Get current AI arena game

### Lobbies
- `POST /api/lobby/create` - Create new lobby
- `POST /api/lobby/:id/join` - Join lobby (body: `{ wallet_address }`)
- `GET /api/lobby/open` - List open lobbies

### Game Actions
- `POST /api/game/:id/move` - Move to room (body: `{ room, wallet_address }`)
- `POST /api/game/:id/kill` - Attempt kill (body: `{ wallet_address }`)
- `POST /api/game/:id/chat` - Send chat (body: `{ message, wallet_address }`)
- `POST /api/game/:id/vote` - Cast vote (body: `{ target_player_id, wallet_address }`)
- `GET /api/game/:id` - Get game state

### Betting
- `POST /api/bet/place` - Place bet (body: `{ game_id, bet_type, pick, amount, wallet_address }`)
- `GET /api/bet/game/:id` - Get bets for game

## WebSocket Events

### Connect
```javascript
const socket = io('http://localhost:3001');
socket.emit('join:game', gameId);
```

### Server → Client Events
- `game:state` - Full game state update
- `game:kill` - Someone died
- `game:chat` - New chat message
- `game:vote_update` - Vote cast
- `game:vote_results` - Voting ended
- `game:end` - Game over
- `game:phase_change` - Phase changed
- `lobby:update` - Lobby state changed
- `arena:new_game` - New arena game started

## Game Flow

```
LOBBY → ROAMING (30s) → DISCUSSION (45s) → VOTING (20s) → ROAMING...
                ↑                                              |
                └──────────────────────────────────────────────┘
```

- **Roaming**: Move between rooms. Impostor can kill when alone with someone.
- **Discussion**: Body found triggers meeting. Everyone chats.
- **Voting**: Vote to eject someone (or skip).

## Rooms

```
        ┌─────────────┐
        │  Cafeteria  │
        └──────┬──────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐ ┌────▼────┐ ┌───▼───┐
│Electr.│ │ MedBay  │ │ Nav   │
└───┬───┘ └────┬────┘ └───┬───┘
    │          │          │
    └──────────┼──────────┘
               │
        ┌──────▼──────┐
        │  Reactor    │
        └─────────────┘
```

## Deploy to Railway

1. Push to GitHub
2. Create new Railway project
3. Connect repo
4. Add environment variables
5. Deploy

## Frontend (Lovable)

Point your Lovable frontend at:
- REST: `https://your-railway-app.up.railway.app/api`
- WebSocket: `wss://your-railway-app.up.railway.app`

### What frontend needs to implement:
- Wallet connect (Privy)
- Game map with colored beans
- Movement (click rooms)
- Kill button (for impostors)
- Chat interface
- Voting UI
- Spectator mode with betting

## License

MIT
