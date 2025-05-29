import { Request, Response } from 'express';
import { CreateTicketDTO, TicketValidationResult } from '../models/ticket.model';
import pool from '../config/database';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
  };
}

export const createTicket = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { auction_id }: CreateTicketDTO = req.body;

    // Check if auction exists and is live
    const auctionResult = await client.query(
      'SELECT * FROM auctions WHERE id = $1 AND type = $2',
      [auction_id, 'live']
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Live auction not found' });
    }

    const auction = auctionResult.rows[0];

    // Check if user already has a ticket
    const existingTicketResult = await client.query(
      'SELECT * FROM auction_tickets WHERE auction_id = $1 AND user_id = $2',
      [auction_id, userId]
    );

    if (existingTicketResult.rows.length > 0) {
      return res.status(400).json({ message: 'Ticket already exists' });
    }

    // Validate wallet balance
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return res.status(400).json({ message: 'Wallet not found' });
    }

    const wallet = walletResult.rows[0];

    if (wallet.balance < auction.minimum_wallet_balance) {
      return res.status(400).json({
        message: 'Insufficient wallet balance',
        required_balance: auction.minimum_wallet_balance,
        current_balance: wallet.balance,
      });
    }

    // Create ticket
    const ticket = await client.query(
      `INSERT INTO auction_tickets 
       (auction_id, user_id, status) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [auction_id, userId, 'active']
    );

    res.json(ticket.rows[0]);
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ message: 'Error creating ticket' });
  } finally {
    client.release();
  }
};

export const validateTicket = async (
  auctionId: number,
  userId: number
): Promise<TicketValidationResult> => {
  try {
    // Check if auction exists and is live
    const auctionResult = await pool.query(
      'SELECT * FROM auctions WHERE id = $1 AND type = $2',
      [auctionId, 'live']
    );

    if (auctionResult.rows.length === 0) {
      return {
        isValid: false,
        message: 'Live auction not found',
      };
    }

    const auction = auctionResult.rows[0];

    // Check if user has an active ticket
    const ticketResult = await pool.query(
      'SELECT * FROM auction_tickets WHERE auction_id = $1 AND user_id = $2 AND status = $3',
      [auctionId, userId, 'active']
    );

    if (ticketResult.rows.length === 0) {
      return {
        isValid: false,
        message: 'No active ticket found',
        minimumBalance: auction.minimum_wallet_balance,
      };
    }

    // Check wallet balance
    const walletResult = await pool.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return {
        isValid: false,
        message: 'Wallet not found',
      };
    }

    const wallet = walletResult.rows[0];

    if (wallet.balance < auction.minimum_wallet_balance) {
      return {
        isValid: false,
        message: 'Insufficient wallet balance',
        minimumBalance: auction.minimum_wallet_balance,
        currentBalance: wallet.balance,
      };
    }

    return {
      isValid: true,
      message: 'Ticket is valid',
    };
  } catch (error) {
    console.error('Validate ticket error:', error);
    return {
      isValid: false,
      message: 'Error validating ticket',
    };
  }
};

export const getUserTickets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT at.*, a.title as auction_title, a.type as auction_type 
       FROM auction_tickets at 
       JOIN auctions a ON at.auction_id = a.id 
       WHERE at.user_id = $1 
       ORDER BY at.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({ message: 'Error fetching tickets' });
  }
}; 