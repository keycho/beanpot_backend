import { v4 as uuidv4 } from 'uuid';
import {
  Game, Player, GameState, GamePhase, GameMode, Winner,
  Room, ROOMS, ROOM_CONNECTIONS, Color, COLORS, PlayerRole
} from '../types';
import * as db from '../db';
import { generateAIMovement, generateAIChat, generateAIVote } from '../ai';
import { io } from '../index';

// Timing constants (in ms)
const ROAMING_DURATION = 30000; // 30 seconds
const DISCUSSION_DURATION = 45000; // 45 seconds
const VOTING_DURATION = 20000; // 20 seconds
const LOBBY_COUNTDOWN = 60000; // 60 seconds

// In-memory game states (for fast access)
const gameStates: Map<string, GameState> = new Map();
const gameTimers: Map<string, NodeJS.Timeout> = new Map();
const lobbyCountdowns: Map<string, NodeJS.Timeout> = new Map();
const firstDeaths: Map<string, string> = new Map(); // game_id -> player_id

export function getGameState(game_id: string): GameState | undefined {
  return gameStates.get(game_id);
}

export async function createNewGame(mode: GameMode, entry_fee: number = 0): Promise<Game> {
  const game: Partial<Game> = {
    id: uuidv4(),
    mode,
    status: 'waiting',
    phase: 'lobby',
    created_at: new Date(),
    impostor_id: null,
    winner: null,
    entry_fee,
    pot: 0,
    phase_end_time: null,
    round_number: 0,
    dead_body_location: null,
    dead_body_player_id: null
  };

  const created = await db.createGame(game);
  
  gameStates.set(created.id, {
    game: created,
    players: [],
    chat_messages: [],
    time_remaining: 0
  });

  return created;
}

export async function addPlayerToGame(
  game_id: string,
  wallet_address: string | null,
  is_ai: boolean
): Promise<Player> {
  const state = gameStates.get(game_id);
  if (!state) throw new Error('Game not found');
  if (state.players.length >= 5) throw new Error('Game is full');

  // Assign color
  const usedColors = state.players.map(p => p.color);
  const availableColors = COLORS.filter(c => !usedColors.includes(c));
  const color = availableColors[Math.floor(Math.random() * availableColors.length)];

  // Random starting room
  const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];

  const player: Partial<Player> = {
    id: uuidv4(),
    game_id,
    wallet_address,
    color,
    role: 'crewmate', // Will be assigned when game starts
    is_ai,
    is_alive: true,
    current_room: room,
    has_voted: false,
    vote_target: null
  };

  const created = await db.createPlayer(player);
  state.players.push(created);

  // Update pot for human players
  if (!is_ai && state.game.entry_fee > 0) {
    state.game.pot += state.game.entry_fee;
    await db.updateGame(game_id, { pot: state.game.pot });
  }

  return created;
}

export async function fillWithAI(game_id: string): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  while (state.players.length < 5) {
    await addPlayerToGame(game_id, null, true);
  }
}

export async function startGame(game_id: string): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) throw new Error('Game not found');
  if (state.players.length < 5) throw new Error('Not enough players');

  // Assign impostor randomly
  const impostorIndex = Math.floor(Math.random() * state.players.length);
  const impostor = state.players[impostorIndex];
  
  for (let i = 0; i < state.players.length; i++) {
    const role: PlayerRole = i === impostorIndex ? 'impostor' : 'crewmate';
    state.players[i].role = role;
    await db.updatePlayer(state.players[i].id, { role });
  }

  state.game.impostor_id = impostor.id;
  state.game.status = 'playing';
  state.game.round_number = 1;
  
  await db.updateGame(game_id, {
    impostor_id: impostor.id,
    status: 'playing'
  });

  // Start roaming phase
  await startPhase(game_id, 'roaming');
}

async function startPhase(game_id: string, phase: GamePhase): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  // Clear any existing timer
  const existingTimer = gameTimers.get(game_id);
  if (existingTimer) clearTimeout(existingTimer);

  state.game.phase = phase;
  
  let duration: number;
  switch (phase) {
    case 'roaming':
      duration = ROAMING_DURATION;
      // Clear dead body
      state.game.dead_body_location = null;
      state.game.dead_body_player_id = null;
      break;
    case 'discussion':
      duration = DISCUSSION_DURATION;
      // Clear chat messages for new round
      state.chat_messages = [];
      break;
    case 'voting':
      duration = VOTING_DURATION;
      // Reset votes
      for (const player of state.players) {
        player.has_voted = false;
        player.vote_target = null;
      }
      break;
    default:
      duration = 0;
  }

  state.game.phase_end_time = Date.now() + duration;
  state.time_remaining = duration;

  await db.updateGame(game_id, {
    phase,
    phase_end_time: state.game.phase_end_time
  });

  // Broadcast phase change
  io?.to(game_id).emit('game:phase_change', {
    phase,
    end_time: state.game.phase_end_time
  });

  broadcastGameState(game_id);

  // Schedule phase end
  const timer = setTimeout(() => onPhaseEnd(game_id), duration);
  gameTimers.set(game_id, timer);

  // AI actions during phase
  if (phase === 'roaming') {
    scheduleAIMovements(game_id);
  } else if (phase === 'discussion') {
    scheduleAIChats(game_id);
  } else if (phase === 'voting') {
    scheduleAIVotes(game_id);
  }
}

async function onPhaseEnd(game_id: string): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  switch (state.game.phase) {
    case 'roaming':
      // If no body was found, continue roaming
      // Check win condition first
      if (checkWinCondition(game_id)) return;
      await startPhase(game_id, 'roaming');
      break;
    case 'discussion':
      await startPhase(game_id, 'voting');
      break;
    case 'voting':
      await processVotes(game_id);
      break;
  }
}

async function processVotes(game_id: string): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  // Count votes
  const votes: Record<string, number> = {};
  let skipVotes = 0;

  for (const player of state.players) {
    if (!player.is_alive) continue;
    
    if (player.vote_target === null) {
      skipVotes++;
    } else {
      votes[player.vote_target] = (votes[player.vote_target] || 0) + 1;
    }
  }

  // Find player with most votes
  let maxVotes = skipVotes;
  let ejectedId: string | null = null;

  for (const [playerId, voteCount] of Object.entries(votes)) {
    if (voteCount > maxVotes) {
      maxVotes = voteCount;
      ejectedId = playerId;
    } else if (voteCount === maxVotes) {
      ejectedId = null; // Tie = no ejection
    }
  }

  // Eject player
  if (ejectedId) {
    const ejected = state.players.find(p => p.id === ejectedId);
    if (ejected) {
      ejected.is_alive = false;
      await db.updatePlayer(ejectedId, { is_alive: false });
    }
  }

  // Broadcast vote results
  io?.to(game_id).emit('game:vote_results', { votes, ejected_id: ejectedId });

  // Check win condition
  if (checkWinCondition(game_id)) return;

  // Continue to next round
  state.game.round_number++;
  await startPhase(game_id, 'roaming');
}

function checkWinCondition(game_id: string): boolean {
  const state = gameStates.get(game_id);
  if (!state) return false;

  const alivePlayers = state.players.filter(p => p.is_alive);
  const aliveImpostors = alivePlayers.filter(p => p.role === 'impostor');
  const aliveCrewmates = alivePlayers.filter(p => p.role === 'crewmate');

  let winner: Winner = null;

  if (aliveImpostors.length === 0) {
    winner = 'crewmates';
  } else if (aliveImpostors.length >= aliveCrewmates.length) {
    winner = 'impostor';
  }

  if (winner) {
    endGame(game_id, winner);
    return true;
  }

  return false;
}

async function endGame(game_id: string, winner: Winner): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  state.game.status = 'finished';
  state.game.winner = winner;

  await db.updateGame(game_id, { status: 'finished', winner });

  // Resolve bets
  const firstDeathId = firstDeaths.get(game_id) || null;
  await db.resolveBets(game_id, state.game.impostor_id!, firstDeathId);

  // Broadcast game end
  io?.to(game_id).emit('game:end', {
    winner,
    impostor_id: state.game.impostor_id!
  });

  // Clear timers
  const timer = gameTimers.get(game_id);
  if (timer) clearTimeout(timer);
  gameTimers.delete(game_id);
}

// Player actions
export async function movePlayer(game_id: string, player_id: string, room: Room): Promise<boolean> {
  const state = gameStates.get(game_id);
  if (!state) return false;
  if (state.game.phase !== 'roaming') return false;

  const player = state.players.find(p => p.id === player_id);
  if (!player || !player.is_alive) return false;

  // Check if room is adjacent
  const adjacent = ROOM_CONNECTIONS[player.current_room];
  if (!adjacent.includes(room)) return false;

  player.current_room = room;
  await db.updatePlayer(player_id, { current_room: room });

  // Check if player found a body
  if (state.game.dead_body_location === room && state.game.dead_body_player_id) {
    await reportBody(game_id, player_id);
  }

  broadcastGameState(game_id);
  return true;
}

export async function attemptKill(game_id: string, killer_id: string): Promise<boolean> {
  const state = gameStates.get(game_id);
  if (!state) return false;
  if (state.game.phase !== 'roaming') return false;

  const killer = state.players.find(p => p.id === killer_id);
  if (!killer || killer.role !== 'impostor' || !killer.is_alive) return false;

  // Find potential victim (alone in room with killer)
  const playersInRoom = state.players.filter(
    p => p.current_room === killer.current_room && p.is_alive && p.id !== killer_id
  );

  if (playersInRoom.length !== 1) return false; // Must be exactly one other person

  const victim = playersInRoom[0];
  victim.is_alive = false;
  
  await db.updatePlayer(victim.id, { is_alive: false });

  // Track first death for betting
  if (!firstDeaths.has(game_id)) {
    firstDeaths.set(game_id, victim.id);
  }

  // Leave body
  state.game.dead_body_location = victim.current_room;
  state.game.dead_body_player_id = victim.id;

  io?.to(game_id).emit('game:kill', {
    victim_id: victim.id,
    room: victim.current_room
  });

  // Check win condition
  checkWinCondition(game_id);

  broadcastGameState(game_id);
  return true;
}

async function reportBody(game_id: string, reporter_id: string): Promise<void> {
  const state = gameStates.get(game_id);
  if (!state) return;

  io?.to(game_id).emit('game:kill', {
    victim_id: state.game.dead_body_player_id!,
    room: state.game.dead_body_location!,
    reporter_id
  });

  // Start discussion
  await startPhase(game_id, 'discussion');
}

export async function sendChat(game_id: string, player_id: string, message: string): Promise<boolean> {
  const state = gameStates.get(game_id);
  if (!state) return false;
  if (state.game.phase !== 'discussion') return false;

  const player = state.players.find(p => p.id === player_id);
  if (!player || !player.is_alive) return false;

  const chatMessage = await db.createChatMessage({
    id: uuidv4(),
    game_id,
    player_id,
    player_color: player.color,
    message,
    created_at: new Date()
  });

  state.chat_messages.push(chatMessage);

  io?.to(game_id).emit('game:chat', chatMessage);
  return true;
}

export async function castVote(game_id: string, player_id: string, target_id: string | null): Promise<boolean> {
  const state = gameStates.get(game_id);
  if (!state) return false;
  if (state.game.phase !== 'voting') return false;

  const player = state.players.find(p => p.id === player_id);
  if (!player || !player.is_alive || player.has_voted) return false;

  player.has_voted = true;
  player.vote_target = target_id;

  await db.updatePlayer(player_id, { has_voted: true, vote_target: target_id });

  io?.to(game_id).emit('game:vote_update', { player_id, has_voted: true });

  // Check if all alive players have voted
  const alivePlayers = state.players.filter(p => p.is_alive);
  const allVoted = alivePlayers.every(p => p.has_voted);

  if (allVoted) {
    // Clear timer and process votes immediately
    const timer = gameTimers.get(game_id);
    if (timer) clearTimeout(timer);
    await processVotes(game_id);
  }

  return true;
}

// AI behavior scheduling
function scheduleAIMovements(game_id: string): void {
  const state = gameStates.get(game_id);
  if (!state) return;

  const aiPlayers = state.players.filter(p => p.is_ai && p.is_alive);

  for (const ai of aiPlayers) {
    // Random movements during roaming phase
    const moveInterval = setInterval(async () => {
      const currentState = gameStates.get(game_id);
      if (!currentState || currentState.game.phase !== 'roaming') {
        clearInterval(moveInterval);
        return;
      }

      const movement = await generateAIMovement(ai, currentState);
      if (movement.action === 'move' && movement.room) {
        await movePlayer(game_id, ai.id, movement.room);
      } else if (movement.action === 'kill') {
        await attemptKill(game_id, ai.id);
      }
    }, 3000 + Math.random() * 4000); // Move every 3-7 seconds

    // Clear interval when phase ends
    setTimeout(() => clearInterval(moveInterval), ROAMING_DURATION);
  }
}

function scheduleAIChats(game_id: string): void {
  const state = gameStates.get(game_id);
  if (!state) return;

  const aiPlayers = state.players.filter(p => p.is_ai && p.is_alive);

  for (const ai of aiPlayers) {
    // Each AI sends 1-3 messages during discussion
    const numMessages = 1 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numMessages; i++) {
      const delay = (i + 1) * (DISCUSSION_DURATION / (numMessages + 1)) + Math.random() * 3000;
      
      setTimeout(async () => {
        const currentState = gameStates.get(game_id);
        if (!currentState || currentState.game.phase !== 'discussion') return;

        const message = await generateAIChat(ai, currentState);
        if (message) {
          await sendChat(game_id, ai.id, message);
        }
      }, delay);
    }
  }
}

function scheduleAIVotes(game_id: string): void {
  const state = gameStates.get(game_id);
  if (!state) return;

  const aiPlayers = state.players.filter(p => p.is_ai && p.is_alive);

  for (const ai of aiPlayers) {
    const delay = 2000 + Math.random() * (VOTING_DURATION - 5000);
    
    setTimeout(async () => {
      const currentState = gameStates.get(game_id);
      if (!currentState || currentState.game.phase !== 'voting') return;

      const target = await generateAIVote(ai, currentState);
      await castVote(game_id, ai.id, target);
    }, delay);
  }
}

// Lobby management
export function startLobbyCountdown(game_id: string): void {
  const existing = lobbyCountdowns.get(game_id);
  if (existing) return; // Already counting down

  const countdown = setTimeout(async () => {
    const state = gameStates.get(game_id);
    if (!state || state.game.status !== 'waiting') return;

    // Fill with AI and start
    await fillWithAI(game_id);
    await startGame(game_id);
    
    lobbyCountdowns.delete(game_id);
  }, LOBBY_COUNTDOWN);

  lobbyCountdowns.set(game_id, countdown);

  // Broadcast countdown
  const endTime = Date.now() + LOBBY_COUNTDOWN;
  io?.to(game_id).emit('lobby:update', {
    players: gameStates.get(game_id)?.players || [],
    countdown: endTime
  });
}

export function broadcastGameState(game_id: string): void {
  const state = gameStates.get(game_id);
  if (!state) return;

  state.time_remaining = state.game.phase_end_time 
    ? Math.max(0, state.game.phase_end_time - Date.now())
    : 0;

  io?.to(game_id).emit('game:state', state);
}
