import { Pool } from 'pg';
import { DocumentService } from './document.service';
import EarningsService from './earnings.service';

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

const documentService = new DocumentService();
const earningsService = new EarningsService();

export class AuctionService {
  async settleAuction(auctionId: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get auction details
      const auctionResult = await client.query(
        `SELECT a.*, 
                u.username as seller_name,
                b.username as buyer_name
         FROM auctions a
         JOIN users u ON a.seller_id = u.id
         LEFT JOIN users b ON a.current_bidder_id = b.id
         WHERE a.id = $1`,
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Check if auction has a winner
      if (!auction.current_bidder_id) {
        // No winner, mark as unsold
        await client.query(
          `UPDATE auctions 
           SET status = 'unsold'
           WHERE id = $1`,
          [auctionId]
        );
        await client.query('COMMIT');
        return;
      }

      // Calculate buyer premium
      const buyerPremium = (auction.current_price * auction.buyer_premium_percentage) / 100;

      // Create purchased item record
      await documentService.createPurchasedItem(
        auctionId,
        auction.current_bidder_id,
        auction.seller_id,
        auction.current_price,
        buyerPremium
      );

      // Process earnings
      await earningsService.settleAuctionEarnings(auctionId);

      // Update auction status
      await client.query(
        `UPDATE auctions 
         SET status = 'completed'
         WHERE id = $1`,
        [auctionId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getSettledAuctions(): Promise<any[]> {
    const result = await pool.query(
      `SELECT a.*, 
              u.username as seller_name,
              b.username as buyer_name,
              pi.certificate_number,
              pi.invoice_number
       FROM auctions a
       JOIN users u ON a.seller_id = u.id
       LEFT JOIN users b ON a.current_bidder_id = b.id
       LEFT JOIN purchased_items pi ON a.id = pi.auction_id
       WHERE a.status = 'completed'
       ORDER BY a.end_time DESC`
    );

    return result.rows;
  }
} 