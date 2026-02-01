// Token utility system
// Benefits for token holders

interface HolderTier {
  name: string;
  min_tokens: number;
  rake_discount: number; // percentage off rake
  access_diamond: boolean;
  exclusive_emotes: boolean;
  revenue_share: number; // percentage of house rake
}

const HOLDER_TIERS: Record<string, HolderTier> = {
  none: {
    name: 'Non-holder',
    min_tokens: 0,
    rake_discount: 0,
    access_diamond: false,
    exclusive_emotes: false,
    revenue_share: 0
  },
  bronze: {
    name: 'Bronze Holder',
    min_tokens: 1000,
    rake_discount: 10, // 10% off rake (5% -> 4.5%)
    access_diamond: false,
    exclusive_emotes: false,
    revenue_share: 0
  },
  silver: {
    name: 'Silver Holder',
    min_tokens: 10000,
    rake_discount: 20,
    access_diamond: false,
    exclusive_emotes: true,
    revenue_share: 0
  },
  gold: {
    name: 'Gold Holder',
    min_tokens: 50000,
    rake_discount: 30,
    access_diamond: true,
    exclusive_emotes: true,
    revenue_share: 0
  },
  diamond: {
    name: 'Diamond Holder',
    min_tokens: 100000,
    rake_discount: 50, // Half rake
    access_diamond: true,
    exclusive_emotes: true,
    revenue_share: 1 // 1% of house rake
  },
  whale: {
    name: 'Whale',
    min_tokens: 500000,
    rake_discount: 75,
    access_diamond: true,
    exclusive_emotes: true,
    revenue_share: 5 // 5% of house rake
  }
};

// Mock token balance checker (replace with actual Solana RPC call)
// In production: query SPL token balance for wallet
async function getTokenBalance(wallet_address: string): Promise<number> {
  // TODO: Implement actual Solana token balance check
  // const connection = new Connection(process.env.SOLANA_RPC_URL);
  // const tokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, new PublicKey(wallet_address));
  // const balance = await connection.getTokenAccountBalance(tokenAccount);
  // return balance.value.uiAmount || 0;
  
  // For now, return mock data
  return 0;
}

export function getHolderTier(token_balance: number): HolderTier {
  if (token_balance >= 500000) return HOLDER_TIERS.whale;
  if (token_balance >= 100000) return HOLDER_TIERS.diamond;
  if (token_balance >= 50000) return HOLDER_TIERS.gold;
  if (token_balance >= 10000) return HOLDER_TIERS.silver;
  if (token_balance >= 1000) return HOLDER_TIERS.bronze;
  return HOLDER_TIERS.none;
}

export async function getWalletBenefits(wallet_address: string): Promise<{
  wallet_address: string;
  token_balance: number;
  tier: HolderTier;
  effective_rake: number;
  can_access_diamond: boolean;
}> {
  const balance = await getTokenBalance(wallet_address);
  const tier = getHolderTier(balance);
  
  const baseRake = 5; // 5% base rake
  const effectiveRake = baseRake * (1 - tier.rake_discount / 100);
  
  return {
    wallet_address,
    token_balance: balance,
    tier,
    effective_rake: effectiveRake,
    can_access_diamond: tier.access_diamond
  };
}

export function calculateRake(amount: number, rake_discount: number): { rake: number; player_payout: number } {
  const baseRake = 0.05; // 5%
  const discountedRake = baseRake * (1 - rake_discount / 100);
  const rake = amount * discountedRake;
  const player_payout = amount - rake;
  
  return { rake, player_payout };
}

// Staking system
interface StakedPosition {
  wallet_address: string;
  amount: number;
  staked_at: Date;
  last_claim: Date;
}

const stakedPositions: Map<string, StakedPosition> = new Map();
let totalStaked = 0;
let houseRakePool = 0;

export function stake(wallet_address: string, amount: number): StakedPosition {
  const existing = stakedPositions.get(wallet_address);
  
  if (existing) {
    existing.amount += amount;
    totalStaked += amount;
    return existing;
  }
  
  const position: StakedPosition = {
    wallet_address,
    amount,
    staked_at: new Date(),
    last_claim: new Date()
  };
  
  stakedPositions.set(wallet_address, position);
  totalStaked += amount;
  
  return position;
}

export function unstake(wallet_address: string, amount: number): boolean {
  const position = stakedPositions.get(wallet_address);
  if (!position || position.amount < amount) return false;
  
  position.amount -= amount;
  totalStaked -= amount;
  
  if (position.amount === 0) {
    stakedPositions.delete(wallet_address);
  }
  
  return true;
}

export function addToRakePool(amount: number): void {
  houseRakePool += amount;
}

export function getStakingInfo(wallet_address: string): {
  staked: number;
  total_staked: number;
  share_percentage: number;
  pending_rewards: number;
} {
  const position = stakedPositions.get(wallet_address);
  const staked = position?.amount || 0;
  const sharePercentage = totalStaked > 0 ? (staked / totalStaked) * 100 : 0;
  
  // Simple reward calculation (in production, use time-weighted)
  const pendingRewards = houseRakePool * (sharePercentage / 100) * 0.3; // 30% of rake goes to stakers
  
  return {
    staked,
    total_staked: totalStaked,
    share_percentage: sharePercentage,
    pending_rewards: pendingRewards
  };
}

export function claimRewards(wallet_address: string): number {
  const info = getStakingInfo(wallet_address);
  const position = stakedPositions.get(wallet_address);
  
  if (!position || info.pending_rewards === 0) return 0;
  
  const claimed = info.pending_rewards;
  position.last_claim = new Date();
  
  // Reduce rake pool
  houseRakePool -= claimed;
  
  return claimed;
}

// Export tier info for API
export function getTierInfo(): typeof HOLDER_TIERS {
  return HOLDER_TIERS;
}
