import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import * as engine from '../game/engine';

const router = Router();

// Bet types with odds
const BET_TYPES = {
  impostor: { name: 'Who is Impostor?', odds: 5, description: 'Pick the impostor' },
  first_death: { name: 'First Blood', odds: 5, description: 'Who dies first?' },
  survivor: { name: 'Survivor', odds: 3, description: 'Pick someone who survives' },
  total_deaths: { name: 'Death Count', odds: 2, description: 'Over/under on total deaths' },
  winning_team: { name: 'Winning Team', odds: 1.9, description: 'Crewmates or Impostor?' },
  ejected_count: { name: 'Ejections', odds: 2.5, description: 'How many get ejected?' }
};

// Get available bets for a game
router.get('/betting/game/:id/options', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const state = engine.getGameState(id);
    
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Build betting options based on game state
    const options = [];

    // Impostor bet - pick a player
    options.push({
      type: 'impostor',
      ...BET_TYPES.impostor,
      choices: state.players.map(p => ({
        id: p.id,
        name: p.color,
        is_ai: p.is_ai
      })),
      locked: state.game.phase !== 'lobby' && state.game.round_number > 1
    });

    // First death bet
    options.push({
      type: 'first_death',
      ...BET_TYPES.first_death,
      choices: state.players.map(p => ({
        id: p.id,
        name: p.color,
        is_ai: p.is_ai
      })),
      locked: state.players.some(p => !p.is_alive) // Lock after first death
    });

    // Survivor bet
    options.push({
      type: 'survivor',
      ...BET_TYPES.survivor,
      choices: state.players.filter(p => p.is_alive).map(p => ({
        id: p.id,
        name: p.color,
        is_ai: p.is_ai
      })),
      locked: state.game.status === 'finished'
    });

    // Winning team bet
    options.push({
      type: 'winning_team',
      ...BET_TYPES.winning_team,
      choices: [
        { id: 'crewmates', name: 'Crewmates Win' },
        { id: 'impostor', name: 'Impostor Wins' }
      ],
      locked: state.game.status === 'finished'
    });

    // Total deaths over/under
    const alivePlayers = state.players.filter(p => p.is_alive).length;
    options.push({
      type: 'total_deaths',
      ...BET_TYPES.total_deaths,
      choices: [
        { id: 'over_2', name: 'Over 2 deaths' },
        { id: 'under_2', name: 'Under 2 deaths' },
        { id: 'exactly_2', name: 'Exactly 2 deaths' }
      ],
      current_deaths: 5 - alivePlayers,
      locked: state.game.status === 'finished'
    });

    res.json({ 
      game_id: id,
      game_phase: state.game.phase,
      options 
    });
  } catch (error) {
    console.error('Error getting betting options:', error);
    res.status(500).json({ error: 'Failed to get betting options' });
  }
});

// Place a bet
router.post('/betting/place', async (req: Request, res: Response) => {
  try {
    const { game_id, bet_type, pick, amount, wallet_address } = req.body;

    if (!game_id || !bet_type || !pick || !amount || !wallet_address) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!BET_TYPES[bet_type as keyof typeof BET_TYPES]) {
      res.status(400).json({ error: 'Invalid bet type' });
      return;
    }

    const state = engine.getGameState(game_id);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Can't bet on game you're playing in
    const isPlayer = state.players.some(p => p.wallet_address === wallet_address);
    if (isPlayer) {
      res.status(400).json({ error: 'Cannot bet on your own game' });
      return;
    }

    // Check bet isn't locked
    if (bet_type === 'first_death' && state.players.some(p => !p.is_alive)) {
      res.status(400).json({ error: 'First death already happened' });
      return;
    }

    if (state.game.status === 'finished') {
      res.status(400).json({ error: 'Game already finished' });
      return;
    }

    const betInfo = BET_TYPES[bet_type as keyof typeof BET_TYPES];
    const potential_payout = amount * betInfo.odds;

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

    res.json({ 
      bet,
      odds: betInfo.odds,
      potential_payout
    });
  } catch (error) {
    console.error('Error placing bet:', error);
    res.status(500).json({ error: 'Failed to place bet' });
  }
});

// Get live odds (based on bet distribution)
router.get('/betting/game/:id/odds', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const bets = await db.getGameBets(id);
    const state = engine.getGameState(id);

    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Calculate pool sizes and implied odds
    const pools: Record<string, Record<string, number>> = {};

    for (const bet of bets) {
      if (!pools[bet.bet_type]) {
        pools[bet.bet_type] = {};
      }
      pools[bet.bet_type][bet.pick] = (pools[bet.bet_type][bet.pick] || 0) + bet.amount;
    }

    // Calculate implied odds from pool
    const odds: Record<string, any> = {};
    for (const [betType, pool] of Object.entries(pools)) {
      const totalPool = Object.values(pool).reduce((a, b) => a + b, 0);
      odds[betType] = {
        total_pool: totalPool,
        picks: Object.entries(pool).map(([pick, amount]) => ({
          pick,
          amount,
          percentage: totalPool > 0 ? (amount / totalPool * 100).toFixed(1) : 0,
          implied_odds: totalPool > 0 ? (totalPool / amount).toFixed(2) : BET_TYPES[betType as keyof typeof BET_TYPES]?.odds || 2
        }))
      };
    }

    res.json({ 
      game_id: id,
      total_bets: bets.length,
      odds 
    });
  } catch (error) {
    console.error('Error getting odds:', error);
    res.status(500).json({ error: 'Failed to get odds' });
  }
});

// Get user's active bets
router.get('/betting/user/:wallet', async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet as string;
    
    // This would need a new DB query - for now return from all games
    // In production, add: getUserBets(wallet_address) to db/index.ts
    
    res.json({ 
      wallet_address: wallet,
      active_bets: [],
      total_wagered: 0,
      total_won: 0
    });
  } catch (error) {
    console.error('Error getting user bets:', error);
    res.status(500).json({ error: 'Failed to get user bets' });
  }
});

export default router;
