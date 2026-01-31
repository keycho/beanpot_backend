import { createClient } from '@supabase/supabase-js';
import { Game, Player, ChatMessage, Bet } from '../types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Games
export async function createGame(game: Partial<Game>): Promise<Game> {
  const { data, error } = await supabase
    .from('games')
    .insert(game)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getGame(id: string): Promise<Game | null> {
  const { data, error } = await supabase
    .from('games')
    .select()
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

export async function updateGame(id: string, updates: Partial<Game>): Promise<Game> {
  const { data, error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getOpenLobbies(): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select()
    .eq('mode', 'lobby')
    .eq('status', 'waiting');
  
  if (error) throw error;
  return data || [];
}

export async function getCurrentArenaGame(): Promise<Game | null> {
  const { data, error } = await supabase
    .from('games')
    .select()
    .eq('mode', 'arena')
    .in('status', ['waiting', 'playing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) return null;
  return data;
}

// Players
export async function createPlayer(player: Partial<Player>): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .insert(player)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getPlayer(id: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from('players')
    .select()
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

export async function getGamePlayers(game_id: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select()
    .eq('game_id', game_id);
  
  if (error) throw error;
  return data || [];
}

export async function updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getPlayerByWalletAndGame(wallet_address: string, game_id: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from('players')
    .select()
    .eq('wallet_address', wallet_address)
    .eq('game_id', game_id)
    .single();
  
  if (error) return null;
  return data;
}

// Chat messages
export async function createChatMessage(message: Partial<ChatMessage>): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(message)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getGameChatMessages(game_id: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select()
    .eq('game_id', game_id)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

// Bets
export async function createBet(bet: Partial<Bet>): Promise<Bet> {
  const { data, error } = await supabase
    .from('bets')
    .insert(bet)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getGameBets(game_id: string): Promise<Bet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select()
    .eq('game_id', game_id);
  
  if (error) throw error;
  return data || [];
}

export async function updateBet(id: string, updates: Partial<Bet>): Promise<Bet> {
  const { data, error } = await supabase
    .from('bets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function resolveBets(game_id: string, impostor_id: string, first_death_id: string | null): Promise<void> {
  const bets = await getGameBets(game_id);
  
  for (const bet of bets) {
    let payout = 0;
    
    if (bet.bet_type === 'impostor' && bet.pick === impostor_id) {
      payout = bet.amount * 5;
    } else if (bet.bet_type === 'first_death' && bet.pick === first_death_id) {
      payout = bet.amount * 5;
    }
    
    await updateBet(bet.id, { resolved: true, payout });
  }
}
