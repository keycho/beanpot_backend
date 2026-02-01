import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import * as engine from '../game/engine';
import { Room, ROOMS } from '../types';

const router = Router();

// Arena endpoints
router.get('/arena/current', async (req: Request, res: Response) => {
  try {
    const game = await db.getCurrentArenaGame();
    if (!game) {
      res.json({ game: null, message: 'No active arena game' });
      return;
    }
    
    const state = engine.getGameState(game.id);
    res.json({ game, state });
  } catch (error) {
    console.error('Error getting arena game:', error);
    res.status(500).json({ error: 'Failed to get arena game' });
  }
});

// Lobby endpoints
router.post('/lobby/create', async (req: Request, res: Response) => {
  try {
    const { entry_fee = 0.1 } = req.body;
    const game = await engine.createNewGame('lobby', entry_fee);
    res.json({ game_id: game.id, game });
  } catch (error) {
    console.error('Error creating lobby:', error);
    res.status(500).json({ error: 'Failed to create lobby' });
  }
});

router.post('/lobby/:id/join', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { wallet_address } = req.body;

    if (!wallet_address) {
      res.status(400).json({ error: 'wallet_address required' });
      return;
    }

    const state = engine.getGameState(id);
    if (!state) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    if (state.game.status !== 'waiting') {
      res.status(400).json({ error: 'Game already started' });
      return;
    }

    // Check if player already in game
    const existing = state.players.find(p => p.wallet_address === wallet_address);
    if (existing) {
      res.status(400).json({ error: 'Already in this lobby' });
      return;
    }

    const player = await engine.addPlayerToGame(id, wallet_address, false);

    // Start countdown if this is the first human
    const humanCount = state.players.filter(p => !p.is_ai).length;
    if (humanCount === 1) {
      engine.startLobbyCountdown(id);
    }

    res.json({ player, players: state.players });
  } catch (error) {
    console.error('Error joining lobby:', error);
    res.status(500).json({ error: 'Failed to join lobby' });
  }
});

router.get('/lobby/open', async (req: Request, res: Response) => {
  try {
    const lobbies = await db.getOpenLobbies();
    const lobbiesWithPlayers = await Promise.all(
      lobbies.map(async (lobby) => {
        const state = engine.getGameState(lobby.id);
        return {
          ...lobby,
          player_count: state?.players.length || 0,
          players: state?.players || []
        };
      })
    );
    res.json({ lobbies: lobbiesWithPlayers });
  } catch (error) {
    console.error('Error getting open lobbies:', error);
    res.status(500).json({ error: 'Failed to get lobbies' });
  }
});

// Game action endpoints
router.post('/game/:id/move', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { room, wallet_address } = req.body;

    if (!room || !ROOMS.includes(room)) {
      res.status(400).json({ error: 'Invalid room' });
      return;
    }

    const state = engine.getGameState(id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const player = state.players.find(p => p.wallet_address === wallet_address);
    if (!player) {
      res.status(400).json({ error: 'Player not in game' });
      return;
    }

    const success = await engine.movePlayer(id, player.id, room as Room);
    
    if (!success) {
      res.status(400).json({ error: 'Invalid move' });
      return;
    }

    res.json({ success: true, room });
  } catch (error) {
    console.error('Error moving player:', error);
    res.status(500).json({ error: 'Failed to move' });
  }
});

router.post('/game/:id/kill', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { wallet_address } = req.body;

    const state = engine.getGameState(id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const player = state.players.find(p => p.wallet_address === wallet_address);
    if (!player) {
      res.status(400).json({ error: 'Player not in game' });
      return;
    }

    const success = await engine.attemptKill(id, player.id);
    
    if (!success) {
      res.status(400).json({ error: 'Cannot kill' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error attempting kill:', error);
    res.status(500).json({ error: 'Failed to kill' });
  }
});

router.post('/game/:id/chat', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { message, wallet_address } = req.body;

    if (!message || message.length > 200) {
      res.status(400).json({ error: 'Invalid message' });
      return;
    }

    const state = engine.getGameState(id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const player = state.players.find(p => p.wallet_address === wallet_address);
    if (!player) {
      res.status(400).json({ error: 'Player not in game' });
      return;
    }

    const success = await engine.sendChat(id, player.id, message);
    
    if (!success) {
      res.status(400).json({ error: 'Cannot chat now' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending chat:', error);
    res.status(500).json({ error: 'Failed to send chat' });
  }
});

router.post('/game/:id/vote', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { target_player_id, wallet_address } = req.body;

    const state = engine.getGameState(id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const player = state.players.find(p => p.wallet_address === wallet_address);
    if (!player) {
      res.status(400).json({ error: 'Player not in game' });
      return;
    }

    const success = await engine.castVote(id, player.id, target_player_id);
    
    if (!success) {
      res.status(400).json({ error: 'Cannot vote' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

router.get('/game/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const state = engine.getGameState(id);
    
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    res.json({ state });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// Betting endpoints
router.post('/bet/place', async (req: Request, res: Response) => {
  try {
    const { game_id, bet_type, pick, amount, wallet_address } = req.body;

    if (!game_id || !bet_type || !pick || !amount || !wallet_address) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!['impostor', 'first_death'].includes(bet_type)) {
      res.status(400).json({ error: 'Invalid bet type' });
      return;
    }

    const state = engine.getGameState(game_id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Only allow betting before or during early game
    if (state.game.phase !== 'lobby' && state.game.round_number > 1) {
      res.status(400).json({ error: 'Betting closed for this game' });
      return;
    }

    // Can't bet on game you're playing in
    const isPlayer = state.players.some(p => p.wallet_address === wallet_address);
    if (isPlayer) {
      res.status(400).json({ error: 'Cannot bet on your own game' });
      return;
    }

    const bet = await db.createBet({
      id: uuidv4(),
      game_id,
      wallet_address,
      bet_type,
      pick,
      amount,
      resolved: false,
      payout: 0
    });

    res.json({ bet });
  } catch (error) {
    console.error('Error placing bet:', error);
    res.status(500).json({ error: 'Failed to place bet' });
  }
});

router.get('/bet/game/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const bets = await db.getGameBets(id);
    
    // Calculate odds based on bet distribution
    const impostorBets: Record<string, number> = {};
    const firstDeathBets: Record<string, number> = {};

    for (const bet of bets) {
      if (bet.bet_type === 'impostor') {
        impostorBets[bet.pick] = (impostorBets[bet.pick] || 0) + bet.amount;
      } else {
        firstDeathBets[bet.pick] = (firstDeathBets[bet.pick] || 0) + bet.amount;
      }
    }

    res.json({ bets, odds: { impostor: impostorBets, first_death: firstDeathBets } });
  } catch (error) {
    console.error('Error getting bets:', error);
    res.status(500).json({ error: 'Failed to get bets' });
  }
});

export default router;
