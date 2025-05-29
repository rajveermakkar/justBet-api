import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getWalletBalance,
  getWalletTransactions,
  depositFunds,
  confirmDeposit,
  withdrawFunds
} from '../controllers/wallet.controller';

const router = express.Router();

// All wallet routes require authentication
router.get('/balance', authenticateToken, getWalletBalance);
router.get('/transactions', authenticateToken, getWalletTransactions);
router.post('/deposit', authenticateToken, depositFunds);
router.post('/deposit/confirm', authenticateToken, confirmDeposit);
router.post('/withdraw', authenticateToken, withdrawFunds);

export default router; 