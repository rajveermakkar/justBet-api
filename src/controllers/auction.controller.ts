import { Request, Response } from 'express';
import { Pool } from 'pg';
import { CreateAuctionDTO } from '../models/types';
import EarningsService from '../services/earnings.service';
import pool from '../config/database';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
  };
}

const earningsService = new EarningsService();

export const createAuction = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      title,
      description,
      starting_price,
      end_time,
      type = 'settled',
      minimum_bid_increment = 1.00,
      time_extension = 30,
      minimum_wallet_balance = 50.00,
      minimum_bid_amount,
      platform_fee_percentage = type === 'live' ? 20.00 : 10.00,
      live_auction_fee_percentage = 20.00,
      buyer_premium_percentage = 5.00,
      listing_fee = 10.00
    } = req.body;

    const seller_id = (req as any).user.id;

    // Validate minimum bid amount
    if (minimum_bid_amount && minimum_bid_amount < starting_price) {
      throw new Error('Minimum bid amount cannot be less than starting price');
    }

    // Check seller's wallet balance for listing fee
    const walletResult = await client.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [seller_id]
    );

    if (walletResult.rows.length === 0) {
      throw new Error('Seller wallet not found');
    }

    const sellerBalance = walletResult.rows[0].balance;
    if (sellerBalance < listing_fee) {
      throw new Error(`Insufficient balance to pay listing fee of $${listing_fee}`);
    }

    // Create auction
    const auctionResult = await client.query(
      `INSERT INTO auctions (
        title, description, starting_price, current_price, end_time,
        seller_id, type, minimum_bid_increment, time_extension,
        minimum_wallet_balance, minimum_bid_amount, platform_fee_percentage,
        live_auction_fee_percentage, buyer_premium_percentage, listing_fee
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        title, description, starting_price, starting_price, end_time,
        seller_id, type, minimum_bid_increment, time_extension,
        minimum_wallet_balance, minimum_bid_amount || starting_price,
        platform_fee_percentage, live_auction_fee_percentage,
        buyer_premium_percentage, listing_fee
      ]
    );

    const auction = auctionResult.rows[0];

    // Process listing fee
    await earningsService.processListingFee(auction.id);

    // Deduct listing fee from seller's wallet
    await client.query(
      `UPDATE wallets 
       SET balance = balance - $1
       WHERE user_id = $2`,
      [listing_fee, seller_id]
    );

    // Create wallet transaction for listing fee
    await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, type, amount, status, description)
       SELECT id, 'platform_fee', $1, 'completed', $2
       FROM wallets WHERE user_id = $3`,
      [listing_fee, `Listing fee for auction #${auction.id}`, seller_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: auction,
      message: 'Auction created successfully'
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create auction error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error creating auction'
    });
  } finally {
    client.release();
  }
};

export const getAuctions = async (req: Request, res: Response) => {
  try {
    const { type, status, seller_id } = req.query;
    let query = `
      SELECT a.*, 
             u.username as seller_name,
             (SELECT COUNT(*) FROM auction_tickets WHERE auction_id = a.id) as ticket_count
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (type) {
      query += ` AND a.type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (status) {
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (seller_id) {
      query += ` AND a.seller_id = $${paramCount}`;
      params.push(seller_id);
      paramCount++;
    }

    query += ' ORDER BY a.created_at DESC';

    const result = await pool.query(query, params);

    // Calculate total cost for each auction
    const auctions = result.rows.map(auction => ({
      ...auction,
      total_cost: auction.current_price 
        ? auction.current_price * (1 + auction.buyer_premium_percentage / 100)
        : null
    }));

    res.json({
      success: true,
      data: auctions
    });
  } catch (error) {
    console.error('Get auctions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving auctions'
    });
  }
};

export const getAuctionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT a.*, u.username as seller_name 
       FROM auctions a 
       JOIN users u ON a.seller_id = u.id 
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({ message: 'Error fetching auction' });
  }
};

export const updateAuction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, end_time } = req.body;
    const seller_id = req.user!.id;

    // Check if auction exists and belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM auctions WHERE id = $1 AND seller_id = $2',
      [id, seller_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or unauthorized' });
    }

    const result = await pool.query(
      `UPDATE auctions 
       SET title = $1, description = $2, end_time = $3 
       WHERE id = $4 AND seller_id = $5 
       RETURNING *`,
      [title, description, end_time, id, seller_id]
    );

    res.json({
      message: 'Auction updated successfully',
      auction: result.rows[0],
    });
  } catch (error) {
    console.error('Update auction error:', error);
    res.status(500).json({ message: 'Error updating auction' });
  }
};

export const deleteAuction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const seller_id = req.user?.id;

    const result = await pool.query(
      'DELETE FROM auctions WHERE id = $1 AND seller_id = $2 RETURNING *',
      [id, seller_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Auction not found or unauthorized' });
    }

    res.json({ message: 'Auction deleted successfully' });
  } catch (error) {
    console.error('Delete auction error:', error);
    res.status(500).json({ message: 'Error deleting auction' });
  }
}; 