import { Router, Request, Response } from 'express';
import * as stats from '../stats';

const router = Router();

// Get live stats (for homepage)
router.get('/stats/live', async (req: Request, res: Response) => {
  try {
    const liveStats = stats.getStats();
    res.json(liveStats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get recent events (for live ticker)
router.get('/stats/events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const events = stats.getRecentEvents(limit);
    res.json({ events });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get leaderboard
router.get('/stats/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = stats.getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Join matchmaking queue
router.post('/queue/join', async (req: Request, res: Response) => {
  try {
    const { wallet_address, tier = 'bronze' } = req.body;
    
    if (!wallet_address) {
      res.status(400).json({ error: 'wallet_address required' });
      return;
    }
    
    const result = stats.joinQueue(wallet_address, tier);
    const queueStatus = stats.getQueueStatus(tier);
    
    res.json({
      success: true,
      position: result.position,
      queue_size: result.queue_size,
      estimated_wait: queueStatus.estimated_wait,
      entry_fee: stats.getEntryFee(tier)
    });
  } catch (error) {
    console.error('Error joining queue:', error);
    res.status(500).json({ error: 'Failed to join queue' });
  }
});

// Leave matchmaking queue
router.post('/queue/leave', async (req: Request, res: Response) => {
  try {
    const { wallet_address } = req.body;
    
    if (!wallet_address) {
      res.status(400).json({ error: 'wallet_address required' });
      return;
    }
    
    const success = stats.leaveQueue(wallet_address);
    res.json({ success });
  } catch (error) {
    console.error('Error leaving queue:', error);
    res.status(500).json({ error: 'Failed to leave queue' });
  }
});

// Get queue status for a tier
router.get('/queue/status/:tier', async (req: Request, res: Response) => {
  try {
    const tier = req.params.tier as string;
    const status = stats.getQueueStatus(tier);
    
    res.json({
      tier,
      players_waiting: status.players,
      estimated_wait: status.estimated_wait,
      entry_fee: stats.getEntryFee(tier)
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Get all queue statuses
router.get('/queue/all', async (req: Request, res: Response) => {
  try {
    const tiers = ['bronze', 'silver', 'gold', 'diamond'];
    const queues = tiers.map(tier => ({
      tier,
      ...stats.getQueueStatus(tier),
      entry_fee: stats.getEntryFee(tier)
    }));
    
    res.json({ queues, total: stats.getTotalQueueCount() });
  } catch (error) {
    console.error('Error getting all queues:', error);
    res.status(500).json({ error: 'Failed to get queues' });
  }
});

// Get hot games (highest action/stakes)
router.get('/games/hot', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const hotGames = stats.getHotGames(limit);
    res.json({ games: hotGames });
  } catch (error) {
    console.error('Error getting hot games:', error);
    res.status(500).json({ error: 'Failed to get hot games' });
  }
});

// Get spectate recommendation
router.get('/games/spectate', async (req: Request, res: Response) => {
  try {
    const recommendation = stats.getSpectateRecommendation();
    
    if (!recommendation) {
      res.json({ 
        available: false, 
        message: 'No active games to spectate' 
      });
      return;
    }
    
    res.json({ 
      available: true,
      ...recommendation
    });
  } catch (error) {
    console.error('Error getting spectate recommendation:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

// Quick play - get best action for user
router.post('/games/quickplay', async (req: Request, res: Response) => {
  try {
    const { wallet_address, tier = 'bronze' } = req.body;
    
    const recommendation = stats.getQuickPlayRecommendation(tier);
    
    // If action is join_queue, actually join them
    if (recommendation.action === 'join_queue' && wallet_address) {
      const queueResult = stats.joinQueue(wallet_address, tier);
      recommendation.queue_position = queueResult.position;
    }
    
    res.json(recommendation);
  } catch (error) {
    console.error('Error with quick play:', error);
    res.status(500).json({ error: 'Failed to process quick play' });
  }
});

export default router;
