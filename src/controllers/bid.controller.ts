import { Request, Response } from 'express';
import { Pool } from 'pg';
import SocketService from '../services/socket.service';
import EarningsService from '../services/earnings.service';

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

const earningsService = new EarningsService();
let socketService: SocketService;

export const setSocketService = (service: SocketService) => {
  socketService = service;
};

export const placeBid = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { auction_id, amount } = req.body;
    const bidder_id = (req as any).user.id;

    // Get auction details
    const auctionResult = await client.query(
      'SELECT * FROM auctions WHERE id = $1',
      [auction_id]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('Auction not found');
    }

    const auction = auctionResult.rows[0];

    // Validate auction status
    if (auction.status !== 'active') {
      throw new Error('Auction is not active');
    }

    // Check if auction has ended
    if (new Date(auction.end_time) <= new Date()) {
      throw new Error('Auction has ended');
    }

    // For live auctions, check if user has a ticket
    if (auction.type === 'live') {
      const ticketResult = await client.query(
        `SELECT * FROM auction_tickets 
         WHERE auction_id = $1 AND user_id = $2 AND status = 'active'`,
        [auction_id, bidder_id]
      );

      if (ticketResult.rows.length === 0) {
        throw new Error('Ticket required for live auction participation');
      }
    }

    // Get bidder's wallet
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [bidder_id]
    );

    if (walletResult.rows.length === 0) {
      throw new Error('Bidder wallet not found');
    }

    const wallet = walletResult.rows[0];

    // Calculate total cost including buyer premium
    const buyerPremium = (amount * auction.buyer_premium_percentage) / 100;
    const totalCost = amount + buyerPremium;

    // Check minimum bid amount for live auctions
    if (auction.type === 'live' && amount < auction.minimum_bid_amount) {
      throw new Error(`Minimum bid amount is $${auction.minimum_bid_amount}`);
    }

    // Check minimum bid increment
    if (amount < auction.current_price + auction.minimum_bid_increment) {
      throw new Error(`Minimum bid increment is $${auction.minimum_bid_increment}`);
    }

    // Check wallet balance
    if (wallet.balance < totalCost) {
      throw new Error(`Insufficient balance. Required: $${totalCost} (including buyer premium)`);
    }

    // Create wallet transaction for the bid
    const transactionResult = await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, type, amount, status, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [wallet.id, 'bid', totalCost, 'completed', `Bid on auction #${auction_id}`]
    );

    // Create the bid
    const bidResult = await client.query(
      `INSERT INTO bids 
       (auction_id, bidder_id, amount, wallet_transaction_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [auction_id, bidder_id, amount, transactionResult.rows[0].id]
    );

    // Update auction current price and bidder
    await client.query(
      `UPDATE auctions 
       SET current_price = $1,
           current_bidder_id = $2,
           last_bid_time = NOW()
       WHERE id = $3`,
      [amount, bidder_id, auction_id]
    );

    // Deduct amount from bidder's wallet
    await client.query(
      `UPDATE wallets 
       SET balance = balance - $1
       WHERE id = $2`,
      [totalCost, wallet.id]
    );

    // If there was a previous bidder, refund their bid
    if (auction.current_bidder_id && auction.current_bidder_id !== bidder_id) {
      const previousBidResult = await client.query(
        `SELECT * FROM bids 
         WHERE auction_id = $1 
         ORDER BY amount DESC 
         LIMIT 1 OFFSET 1`,
        [auction_id]
      );

      if (previousBidResult.rows.length > 0) {
        const previousBid = previousBidResult.rows[0];
        const previousTotalCost = previousBid.amount + 
          (previousBid.amount * auction.buyer_premium_percentage / 100);

        // Create refund transaction
        await client.query(
          `INSERT INTO wallet_transactions 
           (wallet_id, type, amount, status, description)
           SELECT id, 'refund', $1, 'completed', $2
           FROM wallets WHERE user_id = $3`,
          [previousTotalCost, `Refund for outbid on auction #${auction_id}`, auction.current_bidder_id]
        );

        // Update previous bidder's wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance + $1
           WHERE user_id = $2`,
          [previousTotalCost, auction.current_bidder_id]
        );
      }
    }

    await client.query('COMMIT');

    // For live auctions, emit bid event
    if (auction.type === 'live' && socketService) {
      socketService.emitToRoom(
        `auction_${auction_id}`,
        'auction:newBid',
        {
          auctionId: auction_id,
          bidderId: bidder_id,
          amount: amount,
          totalCost: totalCost,
          buyerPremium: buyerPremium,
          timestamp: new Date()
        }
      );
    }

    res.json({
      success: true,
      data: {
        bid: bidResult.rows[0],
        totalCost: totalCost,
        buyerPremium: buyerPremium
      },
      message: 'Bid placed successfully'
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Place bid error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error placing bid'
    });
  } finally {
    client.release();
  }
};

export const getAuctionBids = async (req: Request, res: Response) => {
  try {
    const { auction_id } = req.params;
    const result = await pool.query(
      `SELECT b.*, 
              u.username as bidder_name,
              (b.amount * (1 + a.buyer_premium_percentage / 100)) as total_cost
       FROM bids b
       JOIN users u ON b.bidder_id = u.id
       JOIN auctions a ON b.auction_id = a.id
       WHERE b.auction_id = $1
       ORDER BY b.amount DESC`,
      [auction_id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get auction bids error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving bids'
    });
  }
};

export const getUserBids = async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user.id;
    const result = await pool.query(
      `SELECT b.*, 
              a.title as auction_title,
              a.type as auction_type,
              (b.amount * (1 + a.buyer_premium_percentage / 100)) as total_cost
       FROM bids b
       JOIN auctions a ON b.auction_id = a.id
       WHERE b.bidder_id = $1
       ORDER BY b.created_at DESC`,
      [user_id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get user bids error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user bids'
    });
  }
}; 