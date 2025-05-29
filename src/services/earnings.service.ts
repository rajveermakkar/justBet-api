import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

class EarningsService {
  async settleAuctionEarnings(auctionId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get auction details
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      if (auction.status !== 'ended' || !auction.winner_id) {
        throw new Error('Auction not ended or no winner');
      }

      const finalPrice = auction.final_price;
      const platformFeePercentage = auction.type === 'live' 
        ? auction.live_auction_fee_percentage 
        : auction.platform_fee_percentage;
      const buyerPremium = (finalPrice * auction.buyer_premium_percentage) / 100;
      
      // Calculate fees
      const platformFee = (finalPrice * platformFeePercentage) / 100;
      const sellerEarning = finalPrice - platformFee;
      const totalPlatformEarning = platformFee + buyerPremium;

      // Create platform fee record
      await client.query(
        `INSERT INTO platform_fees 
         (auction_id, amount, status) 
         VALUES ($1, $2, $3)`,
        [auctionId, totalPlatformEarning, 'settled']
      );

      // Create seller earning
      await client.query(
        `INSERT INTO earnings 
         (user_id, auction_id, amount, type, status) 
         VALUES ($1, $2, $3, $4, $5)`,
        [auction.seller_id, auctionId, sellerEarning, 'seller', 'settled']
      );

      // Update seller's wallet
      await client.query(
        `UPDATE wallets 
         SET pending_earnings = pending_earnings + $1,
             total_earnings = total_earnings + $1
         WHERE user_id = $2`,
        [sellerEarning, auction.seller_id]
      );

      // Create seller earning transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, type, amount, status, description) 
         SELECT id, 'seller_earning', $1, 'completed', $2
         FROM wallets WHERE user_id = $3`,
        [sellerEarning, `Earning from auction #${auctionId}`, auction.seller_id]
      );

      // Create platform fee transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, type, amount, status, description) 
         SELECT id, 'platform_fee', $1, 'completed', $2
         FROM wallets WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [totalPlatformEarning, `Platform fee and buyer premium from auction #${auctionId}`]
      );

      // Update superadmin's wallet
      await client.query(
        `UPDATE wallets 
         SET pending_earnings = pending_earnings + $1,
             total_earnings = total_earnings + $1
         WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [totalPlatformEarning]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async processListingFee(auctionId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get auction details
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];
      const listingFee = auction.listing_fee;

      // Create listing fee record
      await client.query(
        `INSERT INTO listing_fees 
         (auction_id, amount, status) 
         VALUES ($1, $2, $3)`,
        [auctionId, listingFee, 'settled']
      );

      // Create platform fee transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, type, amount, status, description) 
         SELECT id, 'platform_fee', $1, 'completed', $2
         FROM wallets WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [listingFee, `Listing fee from auction #${auctionId}`]
      );

      // Update superadmin's wallet
      await client.query(
        `UPDATE wallets 
         SET pending_earnings = pending_earnings + $1,
             total_earnings = total_earnings + $1
         WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [listingFee]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async processTicketFee(auctionId: number, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get auction details
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Check if it's a live auction
      if (auction.type !== 'live') {
        throw new Error('Tickets are only required for live auctions');
      }

      // Get user's wallet balance
      const walletResult = await client.query(
        `SELECT balance FROM wallets WHERE user_id = $1`,
        [userId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error('User wallet not found');
      }

      const userBalance = walletResult.rows[0].balance;

      // Validate minimum wallet balance
      if (userBalance < auction.minimum_wallet_balance) {
        throw new Error(`Insufficient wallet balance. Minimum required: $${auction.minimum_wallet_balance}`);
      }

      // Validate minimum bid amount
      if (userBalance < auction.minimum_bid_amount) {
        throw new Error(`Wallet balance must be at least $${auction.minimum_bid_amount} to participate in this auction`);
      }

      const ticketFee = 5.00; // Base ticket price

      // Check if user already has a ticket
      const existingTicketResult = await client.query(
        `SELECT id FROM auction_tickets 
         WHERE auction_id = $1 AND user_id = $2`,
        [auctionId, userId]
      );

      if (existingTicketResult.rows.length > 0) {
        throw new Error('User already has a ticket for this auction');
      }

      // Create ticket fee record
      await client.query(
        `INSERT INTO ticket_fees 
         (auction_id, user_id, amount, status) 
         VALUES ($1, $2, $3, $4)`,
        [auctionId, userId, ticketFee, 'settled']
      );

      // Create platform fee transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, type, amount, status, description) 
         SELECT id, 'platform_fee', $1, 'completed', $2
         FROM wallets WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [ticketFee, `Ticket fee from auction #${auctionId}`]
      );

      // Update superadmin's wallet
      await client.query(
        `UPDATE wallets 
         SET pending_earnings = pending_earnings + $1,
             total_earnings = total_earnings + $1
         WHERE user_id = (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1)`,
        [ticketFee]
      );

      // Create auction ticket
      await client.query(
        `INSERT INTO auction_tickets 
         (auction_id, user_id, status) 
         VALUES ($1, $2, $3)`,
        [auctionId, userId, 'active']
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getEarnings(userId: number) {
    try {
      const result = await pool.query(
        `SELECT e.*, a.title as auction_title 
         FROM earnings e 
         JOIN auctions a ON e.auction_id = a.id 
         WHERE e.user_id = $1 
         ORDER BY e.created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  async getPlatformFees() {
    try {
      const result = await pool.query(
        `SELECT pf.*, a.title as auction_title 
         FROM platform_fees pf 
         JOIN auctions a ON pf.auction_id = a.id 
         ORDER BY pf.created_at DESC`
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  async getEarningsSummary(userId: number) {
    try {
      const result = await pool.query(
        `SELECT 
           SUM(CASE WHEN type = 'seller' THEN amount ELSE 0 END) as total_seller_earnings,
           SUM(CASE WHEN type = 'admin' THEN amount ELSE 0 END) as total_admin_earnings,
           COUNT(*) as total_transactions
         FROM earnings 
         WHERE user_id = $1`,
        [userId]
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

export default EarningsService; 