import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  createAuction,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction
} from '../controllers/auction.controller';

const router = express.Router();

// Public routes
router.get('/', getAuctions);
router.get('/:id', getAuctionById);

// Protected routes
router.post('/', authenticateToken, createAuction);
router.put('/:id', authenticateToken, updateAuction);
router.delete('/:id', authenticateToken, deleteAuction);

export default router; 