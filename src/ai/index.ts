import Anthropic from '@anthropic-ai/sdk';
import { Player, GameState, Room, ROOM_CONNECTIONS } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

interface AIMovementDecision {
  action: 'move' | 'kill' | 'stay';
  room?: Room;
}

export async function generateAIMovement(
  player: Player,
  state: GameState
): Promise<AIMovementDecision> {
  const adjacentRooms = ROOM_CONNECTIONS[player.current_room];
  
  if (player.role === 'impostor') {
    // Impostor logic: hunt for isolated targets
    const playersInCurrentRoom = state.players.filter(
      p => p.current_room === player.current_room && p.is_alive && p.id !== player.id
    );

    // If alone with one person, try to kill
    if (playersInCurrentRoom.length === 1) {
      return { action: 'kill' };
    }

    // Find a room with exactly one player
    for (const room of adjacentRooms) {
      const playersInRoom = state.players.filter(
        p => p.current_room === room && p.is_alive && p.id !== player.id
      );
      if (playersInRoom.length === 1) {
        return { action: 'move', room };
      }
    }
  }

  // Random movement for crewmates or when impostor has no target
  if (Math.random() > 0.3) { // 70% chance to move
    const randomRoom = adjacentRooms[Math.floor(Math.random() * adjacentRooms.length)];
    return { action: 'move', room: randomRoom };
  }

  return { action: 'stay' };
}

export async function generateAIChat(
  player: Player,
  state: GameState
): Promise<string | null> {
  try {
    const alivePlayers = state.players.filter(p => p.is_alive);
    const deadPlayers = state.players.filter(p => !p.is_alive);
    
    const chatHistory = state.chat_messages
      .slice(-10) // Last 10 messages
      .map(m => `${m.player_color}: ${m.message}`)
      .join('\n');

    const playersList = alivePlayers
      .map(p => `${p.color} - ${p.current_room}${p.id === player.id ? ' (you)' : ''}`)
      .join('\n');

    const deadList = deadPlayers
      .map(p => `${p.color} - died in ${p.current_room}`)
      .join('\n');

    const prompt = `You are ${player.color} in a game of Among Us.
Your role: ${player.role.toUpperCase()}
You are: ALIVE

Players alive:
${playersList}

${deadList ? `Players dead:\n${deadList}` : 'No one has died yet.'}

${chatHistory ? `Chat so far:\n${chatHistory}` : 'No one has spoken yet.'}

${player.role === 'impostor' 
  ? "As the IMPOSTOR: Deflect suspicion. Accuse others subtly. Act natural. Don't be obvious."
  : "As a CREWMATE: Try to identify who the impostor might be. Share what you've seen. Be suspicious but not accusatory without reason."}

Write a short chat message (1-2 sentences max). Be casual, use lowercase, sound like a real player. Don't say anything obviously bot-like. Don't reveal your role.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      // Clean up the response
      let message = content.text.trim();
      // Remove quotes if present
      message = message.replace(/^["']|["']$/g, '');
      // Ensure it's not too long
      if (message.length > 200) {
        message = message.substring(0, 200);
      }
      return message;
    }

    return null;
  } catch (error) {
    console.error('AI chat generation error:', error);
    // Fallback messages
    const fallbacks = player.role === 'impostor'
      ? ["where was the body?", "idk seems sus", "i was doing tasks", "who was near reactor?"]
      : ["anyone see anything?", "where was everyone?", "this is tough", "i was in cafeteria"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

export async function generateAIVote(
  player: Player,
  state: GameState
): Promise<string | null> {
  try {
    const alivePlayers = state.players.filter(p => p.is_alive && p.id !== player.id);
    
    if (alivePlayers.length === 0) return null;

    const chatHistory = state.chat_messages
      .slice(-15)
      .map(m => `${m.player_color}: ${m.message}`)
      .join('\n');

    const playersList = alivePlayers
      .map(p => `${p.id}: ${p.color}`)
      .join('\n');

    const prompt = `You are ${player.color} in a game of Among Us.
Your role: ${player.role.toUpperCase()}

Players you can vote for:
${playersList}

Chat during discussion:
${chatHistory || 'No discussion happened.'}

${player.role === 'impostor'
  ? "As IMPOSTOR: Vote for someone who seems suspicious to others. Blend in. Don't vote for yourself."
  : "As CREWMATE: Vote for who you think is most suspicious based on the discussion and behavior."}

Respond with ONLY the player ID to vote for, or "skip" to skip. Nothing else.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const vote = content.text.trim().toLowerCase();
      
      if (vote === 'skip') return null;
      
      // Check if it's a valid player ID
      const targetPlayer = alivePlayers.find(p => 
        p.id === vote || p.color.toLowerCase() === vote
      );
      
      return targetPlayer?.id || null;
    }

    return null;
  } catch (error) {
    console.error('AI vote generation error:', error);
    // Fallback: vote for random player or skip
    const alivePlayers = state.players.filter(p => p.is_alive && p.id !== player.id);
    if (Math.random() > 0.2 && alivePlayers.length > 0) {
      return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
    }
    return null;
  }
}
