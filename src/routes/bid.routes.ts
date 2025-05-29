import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  placeBid,
  getAuctionBids,
  getUserBids
} from '../controllers/bid.controller';

const router = express.Router();

// All bid routes require authentication
router.post('/:auctionId', authenticateToken, placeBid);
router.get('/auction/:auctionId', authenticateToken, getAuctionBids);
router.get('/user', authenticateToken, getUserBids);

export default router; 