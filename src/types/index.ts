// Game types

export type GameMode = 'arena' | 'lobby';
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type GamePhase = 'lobby' | 'roaming' | 'discussion' | 'voting';
export type PlayerRole = 'crewmate' | 'impostor';
export type Winner = 'crewmates' | 'impostor' | null;
export type BetType = 'impostor' | 'first_death';

export const ROOMS = ['Cafeteria', 'Electrical', 'MedBay', 'Navigation', 'Reactor'] as const;
export type Room = typeof ROOMS[number];

export const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan'] as const;
export type Color = typeof COLORS[number];

// Room adjacency map
export const ROOM_CONNECTIONS: Record<Room, Room[]> = {
  'Cafeteria': ['Electrical', 'MedBay', 'Navigation'],
  'Electrical': ['Cafeteria', 'Reactor'],
  'MedBay': ['Cafeteria', 'Reactor'],
  'Navigation': ['Cafeteria', 'Reactor'],
  'Reactor': ['Electrical', 'MedBay', 'Navigation']
};

export interface Player {
  id: string;
  game_id: string;
  wallet_address: string | null;
  color: Color;
  role: PlayerRole;
  is_ai: boolean;
  is_alive: boolean;
  current_room: Room;
  has_voted: boolean;
  vote_target: string | null;
}

export interface Game {
  id: string;
  mode: GameMode;
  status: GameStatus;
  phase: GamePhase;
  created_at: Date;
  impostor_id: string | null;
  winner: Winner;
  entry_fee: number;
  pot: number;
  phase_end_time: number | null;
  round_number: number;
  dead_body_location: Room | null;
  dead_body_player_id: string | null;
}

export interface ChatMessage {
  id: string;
  game_id: string;
  player_id: string;
  player_color: Color;
  message: string;
  created_at: Date;
}

export interface Bet {
  id: string;
  game_id: string;
  wallet_address: string;
  bet_type: BetType;
  pick: string;
  amount: number;
  resolved: boolean;
  payout: number;
}

export interface GameState {
  game: Game;
  players: Player[];
  chat_messages: ChatMessage[];
  time_remaining: number;
}

// API request types
export interface JoinLobbyRequest {
  wallet_address: string;
}

export interface MoveRequest {
  room: Room;
}

export interface ChatRequest {
  message: string;
}

export interface VoteRequest {
  target_player_id: string | null;
}

export interface PlaceBetRequest {
  game_id: string;
  bet_type: BetType;
  pick: string;
  amount: number;
  wallet_address: string;
}

// Socket events
export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'game:kill': (data: { victim_id: string; room: Room; reporter_id?: string }) => void;
  'game:chat': (message: ChatMessage) => void;
  'game:vote_update': (data: { player_id: string; has_voted: boolean }) => void;
  'game:vote_results': (data: { votes: Record<string, number>; ejected_id: string | null }) => void;
  'game:end': (data: { winner: Winner; impostor_id: string }) => void;
  'game:phase_change': (data: { phase: GamePhase; end_time: number }) => void;
  'lobby:update': (data: { players: Player[]; countdown: number | null }) => void;
  'arena:new_game': (data: { game_id: string }) => void;
}

export interface ClientToServerEvents {
  'join:game': (game_id: string) => void;
  'leave:game': (game_id: string) => void;
}
