import * as engine from '../game/engine';
import * as db from '../db';
import { io } from '../index';

const GAME_COOLDOWN = 30000; // 30 seconds between games
let arenaRunning = false;

export async function startArenaLoop(): Promise<void> {
  if (arenaRunning) return;
  arenaRunning = true;
  
  console.log('Starting AI Arena loop...');
  runArenaGame();
}

async function runArenaGame(): Promise<void> {
  try {
    // Check for existing active arena game
    const existingGame = await db.getCurrentArenaGame();
    
    if (existingGame && existingGame.status === 'playing') {
      console.log(`Arena game ${existingGame.id} already in progress, waiting...`);
      // Check again in 10 seconds
      setTimeout(runArenaGame, 10000);
      return;
    }

    // Create new arena game
    console.log('Creating new arena game...');
    const game = await engine.createNewGame('arena', 0);
    
    // Fill with AI players
    await engine.fillWithAI(game.id);
    
    // Notify spectators
    io?.emit('arena:new_game', { game_id: game.id });
    
    // Start game after short delay (let spectators join)
    setTimeout(async () => {
      try {
        await engine.startGame(game.id);
        console.log(`Arena game ${game.id} started`);
        
        // Monitor game completion
        monitorGameCompletion(game.id);
      } catch (error) {
        console.error('Error starting arena game:', error);
        setTimeout(runArenaGame, GAME_COOLDOWN);
      }
    }, 5000);
    
  } catch (error) {
    console.error('Error in arena loop:', error);
    setTimeout(runArenaGame, GAME_COOLDOWN);
  }
}

function monitorGameCompletion(game_id: string): void {
  const checkInterval = setInterval(async () => {
    const state = engine.getGameState(game_id);
    
    if (!state || state.game.status === 'finished') {
      clearInterval(checkInterval);
      console.log(`Arena game ${game_id} finished`);
      
      // Start new game after cooldown
      console.log(`Next arena game in ${GAME_COOLDOWN / 1000} seconds...`);
      setTimeout(runArenaGame, GAME_COOLDOWN);
    }
  }, 5000);
}

export function stopArenaLoop(): void {
  arenaRunning = false;
  console.log('Arena loop stopped');
}
