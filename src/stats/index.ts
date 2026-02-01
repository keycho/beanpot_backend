// Live stats tracking

interface LiveStats {
  players_online: number;
  games_today: number;
  total_pot_today: number;
  total_won_today: number;
  active_lobbies: number;
  queue_count: number;
  recent_events: GameEvent[];
  leaderboard: LeaderboardEntry[];
}

interface GameEvent {
  id: string;
  type: 'kill' | 'eject' | 'win' | 'bet_won';
  message: string;
  timestamp: Date;
}

interface LeaderboardEntry {
  wallet_address: string;
  display_name: string;
  wins: number;
  earnings: number;
  win_streak: number;
}

interface QueuePlayer {
  wallet_address: string;
  joined_at: Date;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
}

// In-memory state
const stats: LiveStats = {
  players_online: 0,
  games_today: 0,
  total_pot_today: 0,
  total_won_today: 0,
  active_lobbies: 0,
  queue_count: 0,
  recent_events: [],
  leaderboard: []
};

const matchmakingQueue: Map<string, QueuePlayer[]> = new Map([
  ['bronze', []],
  ['silver', []],
  ['gold', []],
  ['diamond', []]
]);

const TIER_ENTRY_FEES: Record<string, number> = {
  bronze: 0.05,
  silver: 0.25,
  gold: 1,
  diamond: 5
};

const TIER_MIN_PLAYERS = 3; // Start lobby when 3+ players in queue

// Stats functions
export function getStats(): LiveStats {
  return {
    ...stats,
    queue_count: getTotalQueueCount()
  };
}

export function incrementPlayersOnline(): void {
  stats.players_online++;
}

export function decrementPlayersOnline(): void {
  stats.players_online = Math.max(0, stats.players_online - 1);
}

export function incrementGamesToday(): void {
  stats.games_today++;
}

export function addToPot(amount: number): void {
  stats.total_pot_today += amount;
}

export function addToWinnings(amount: number): void {
  stats.total_won_today += amount;
}

export function setActiveLobbies(count: number): void {
  stats.active_lobbies = count;
}

export function addGameEvent(type: GameEvent['type'], message: string): void {
  const event: GameEvent = {
    id: Date.now().toString(),
    type,
    message,
    timestamp: new Date()
  };
  
  stats.recent_events.unshift(event);
  
  // Keep last 50 events
  if (stats.recent_events.length > 50) {
    stats.recent_events = stats.recent_events.slice(0, 50);
  }
}

export function getRecentEvents(limit: number = 10): GameEvent[] {
  return stats.recent_events.slice(0, limit);
}

// Queue functions
export function joinQueue(wallet_address: string, tier: string = 'bronze'): { position: number; queue_size: number } {
  const validTier = TIER_ENTRY_FEES[tier] ? tier : 'bronze';
  const queue = matchmakingQueue.get(validTier) || [];
  
  // Check if already in queue
  const existing = queue.find(p => p.wallet_address === wallet_address);
  if (existing) {
    const position = queue.indexOf(existing) + 1;
    return { position, queue_size: queue.length };
  }
  
  const player: QueuePlayer = {
    wallet_address,
    joined_at: new Date(),
    tier: validTier as QueuePlayer['tier']
  };
  
  queue.push(player);
  matchmakingQueue.set(validTier, queue);
  
  return { position: queue.length, queue_size: queue.length };
}

export function leaveQueue(wallet_address: string): boolean {
  for (const [tier, queue] of matchmakingQueue.entries()) {
    const index = queue.findIndex(p => p.wallet_address === wallet_address);
    if (index !== -1) {
      queue.splice(index, 1);
      matchmakingQueue.set(tier, queue);
      return true;
    }
  }
  return false;
}

export function getQueueStatus(tier: string = 'bronze'): { players: number; estimated_wait: number } {
  const queue = matchmakingQueue.get(tier) || [];
  const playersNeeded = Math.max(0, TIER_MIN_PLAYERS - queue.length);
  
  return {
    players: queue.length,
    estimated_wait: playersNeeded * 15 // Rough estimate: 15 seconds per player needed
  };
}

export function getTotalQueueCount(): number {
  let total = 0;
  for (const queue of matchmakingQueue.values()) {
    total += queue.length;
  }
  return total;
}

export function checkAndCreateLobby(tier: string): QueuePlayer[] | null {
  const queue = matchmakingQueue.get(tier) || [];
  
  if (queue.length >= TIER_MIN_PLAYERS) {
    // Pop first 5 (or all if less) players for a lobby
    const lobbyPlayers = queue.splice(0, 5);
    matchmakingQueue.set(tier, queue);
    return lobbyPlayers;
  }
  
  return null;
}

export function getEntryFee(tier: string): number {
  return TIER_ENTRY_FEES[tier] || TIER_ENTRY_FEES.bronze;
}

// Leaderboard functions
export function updateLeaderboard(wallet_address: string, won: boolean, earnings: number): void {
  let entry = stats.leaderboard.find(e => e.wallet_address === wallet_address);
  
  if (!entry) {
    entry = {
      wallet_address,
      display_name: `${wallet_address.slice(0, 4)}...${wallet_address.slice(-4)}`,
      wins: 0,
      earnings: 0,
      win_streak: 0
    };
    stats.leaderboard.push(entry);
  }
  
  if (won) {
    entry.wins++;
    entry.win_streak++;
    entry.earnings += earnings;
  } else {
    entry.win_streak = 0;
  }
  
  // Sort by earnings
  stats.leaderboard.sort((a, b) => b.earnings - a.earnings);
  
  // Keep top 100
  if (stats.leaderboard.length > 100) {
    stats.leaderboard = stats.leaderboard.slice(0, 100);
  }
}

export function getLeaderboard(limit: number = 10): LeaderboardEntry[] {
  return stats.leaderboard.slice(0, limit);
}

// Reset daily stats (call this at midnight)
export function resetDailyStats(): void {
  stats.games_today = 0;
  stats.total_pot_today = 0;
  stats.total_won_today = 0;
}

// Hot games tracking
interface HotGame {
  game_id: string;
  mode: 'arena' | 'lobby';
  pot: number;
  spectators: number;
  phase: string;
  players_alive: number;
  total_players: number;
  heat_score: number; // Combined score for sorting
}

const activeGames: Map<string, HotGame> = new Map();

export function updateHotGame(
  game_id: string, 
  mode: 'arena' | 'lobby',
  pot: number,
  spectators: number,
  phase: string,
  players_alive: number,
  total_players: number
): void {
  // Heat score = pot + (spectators * 0.1) + tension bonus
  const tensionBonus = players_alive <= 3 ? 50 : players_alive <= 4 ? 25 : 0;
  const phaseBonus = phase === 'voting' ? 30 : phase === 'discussion' ? 20 : 0;
  const heat_score = pot + (spectators * 0.1) + tensionBonus + phaseBonus;
  
  activeGames.set(game_id, {
    game_id,
    mode,
    pot,
    spectators,
    phase,
    players_alive,
    total_players,
    heat_score
  });
}

export function removeHotGame(game_id: string): void {
  activeGames.delete(game_id);
}

export function getHotGames(limit: number = 5): HotGame[] {
  return Array.from(activeGames.values())
    .sort((a, b) => b.heat_score - a.heat_score)
    .slice(0, limit);
}

export function getHottestGame(): HotGame | null {
  const games = getHotGames(1);
  return games.length > 0 ? games[0] : null;
}

// Quick play - finds best available game or creates one
export interface QuickPlayResult {
  action: 'join_lobby' | 'join_queue' | 'spectate';
  game_id?: string;
  lobby_id?: string;
  queue_position?: number;
  message: string;
}

export function getQuickPlayRecommendation(tier: string = 'bronze'): QuickPlayResult {
  // Check queue first
  const queue = matchmakingQueue.get(tier) || [];
  
  if (queue.length >= 2) {
    // Almost enough for a game, join queue
    return {
      action: 'join_queue',
      queue_position: queue.length + 1,
      message: `${queue.length} players waiting - game starting soon!`
    };
  }
  
  // Check for open lobbies with space
  // (In production, this would query the game engine)
  
  // Default: join queue
  return {
    action: 'join_queue',
    queue_position: queue.length + 1,
    message: queue.length > 0 
      ? `${queue.length} player${queue.length > 1 ? 's' : ''} waiting`
      : 'Join queue to start matchmaking'
  };
}

// Spectate recommendation
export function getSpectateRecommendation(): { game_id: string; reason: string } | null {
  const hottest = getHottestGame();
  
  if (!hottest) return null;
  
  let reason = '';
  if (hottest.players_alive <= 3) {
    reason = '🔥 Final 3 - Intense showdown!';
  } else if (hottest.phase === 'voting') {
    reason = '🗳️ Voting phase - Will they catch the impostor?';
  } else if (hottest.pot > 1) {
    reason = `💰 ${hottest.pot.toFixed(2)} SOL pot!`;
  } else if (hottest.spectators > 10) {
    reason = `👀 ${hottest.spectators} watching`;
  } else {
    reason = 'Most active game right now';
  }
  
  return {
    game_id: hottest.game_id,
    reason
  };
}
