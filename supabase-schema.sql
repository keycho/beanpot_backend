-- BEANPOT Database Schema
-- Run this in your Supabase SQL editor

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('arena', 'lobby')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  phase TEXT NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby', 'roaming', 'discussion', 'voting')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  impostor_id UUID,
  winner TEXT CHECK (winner IN ('crewmates', 'impostor', NULL)),
  entry_fee DECIMAL(10, 4) DEFAULT 0,
  pot DECIMAL(10, 4) DEFAULT 0,
  phase_end_time BIGINT,
  round_number INTEGER DEFAULT 0,
  dead_body_location TEXT,
  dead_body_player_id UUID
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  wallet_address TEXT,
  color TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'crewmate' CHECK (role IN ('crewmate', 'impostor')),
  is_ai BOOLEAN DEFAULT FALSE,
  is_alive BOOLEAN DEFAULT TRUE,
  current_room TEXT NOT NULL,
  has_voted BOOLEAN DEFAULT FALSE,
  vote_target UUID
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  player_color TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('impostor', 'first_death')),
  pick UUID NOT NULL,
  amount DECIMAL(10, 4) NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  payout DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_mode_status ON games(mode, status);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_chat_game_id ON chat_messages(game_id);
CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id);

-- Row Level Security (optional but recommended)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust as needed)
CREATE POLICY "Allow public read on games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow public read on players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read on chat_messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow public read on bets" ON bets FOR SELECT USING (true);

-- Allow insert/update from service role (backend)
CREATE POLICY "Allow service insert on games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update on games" ON games FOR UPDATE USING (true);
CREATE POLICY "Allow service insert on players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update on players" ON players FOR UPDATE USING (true);
CREATE POLICY "Allow service insert on chat_messages" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert on bets" ON bets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update on bets" ON bets FOR UPDATE USING (true);
