import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  createTicket,
  getUserTickets,
} from '../controllers/ticket.controller';

const router = Router();

// All ticket routes require authentication
router.use(authenticateToken);

// Create ticket for live auction
router.post('/', createTicket);

// Get user's tickets
router.get('/my-tickets', getUserTickets);

export default router; 