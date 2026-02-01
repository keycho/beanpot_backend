import { Router, Request, Response } from 'express';
import * as token from '../token/utility';

const router = Router();

// Get holder benefits for a wallet
router.get('/token/benefits/:wallet', async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet as string;
    const benefits = await token.getWalletBenefits(wallet);
    res.json(benefits);
  } catch (error) {
    console.error('Error getting token benefits:', error);
    res.status(500).json({ error: 'Failed to get benefits' });
  }
});

// Get all tier info
router.get('/token/tiers', async (req: Request, res: Response) => {
  try {
    const tiers = token.getTierInfo();
    res.json({ tiers });
  } catch (error) {
    console.error('Error getting tiers:', error);
    res.status(500).json({ error: 'Failed to get tiers' });
  }
});

// Stake tokens
router.post('/token/stake', async (req: Request, res: Response) => {
  try {
    const { wallet_address, amount } = req.body;
    
    if (!wallet_address || !amount) {
      res.status(400).json({ error: 'wallet_address and amount required' });
      return;
    }
    
    const position = token.stake(wallet_address, amount);
    const info = token.getStakingInfo(wallet_address);
    
    res.json({
      success: true,
      position,
      staking_info: info
    });
  } catch (error) {
    console.error('Error staking:', error);
    res.status(500).json({ error: 'Failed to stake' });
  }
});

// Unstake tokens
router.post('/token/unstake', async (req: Request, res: Response) => {
  try {
    const { wallet_address, amount } = req.body;
    
    if (!wallet_address || !amount) {
      res.status(400).json({ error: 'wallet_address and amount required' });
      return;
    }
    
    const success = token.unstake(wallet_address, amount);
    
    if (!success) {
      res.status(400).json({ error: 'Insufficient staked balance' });
      return;
    }
    
    const info = token.getStakingInfo(wallet_address);
    res.json({
      success: true,
      staking_info: info
    });
  } catch (error) {
    console.error('Error unstaking:', error);
    res.status(500).json({ error: 'Failed to unstake' });
  }
});

// Get staking info
router.get('/token/staking/:wallet', async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet as string;
    const info = token.getStakingInfo(wallet);
    res.json(info);
  } catch (error) {
    console.error('Error getting staking info:', error);
    res.status(500).json({ error: 'Failed to get staking info' });
  }
});

// Claim staking rewards
router.post('/token/claim', async (req: Request, res: Response) => {
  try {
    const { wallet_address } = req.body;
    
    if (!wallet_address) {
      res.status(400).json({ error: 'wallet_address required' });
      return;
    }
    
    const claimed = token.claimRewards(wallet_address);
    const info = token.getStakingInfo(wallet_address);
    
    res.json({
      success: true,
      claimed_amount: claimed,
      staking_info: info
    });
  } catch (error) {
    console.error('Error claiming rewards:', error);
    res.status(500).json({ error: 'Failed to claim rewards' });
  }
});

export default router;
