import { Pool } from 'pg';
import cron from 'node-cron';
import SocketService from './socket.service';
import NotificationService from './notification.service';
import { Auction } from '../models/auction.model';
import EarningsService from './earnings.service';

class CronService {
  private pool: Pool;
  private socketService: SocketService;
  private notificationService: NotificationService;
  private earningsService: EarningsService;

  constructor(socketService: SocketService) {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT),
    });
    this.socketService = socketService;
    this.notificationService = new NotificationService();
    this.earningsService = new EarningsService();
    this.initializeCronJobs();
  }

  private initializeCronJobs() {
    // Check for ended auctions every minute
    cron.schedule('* * * * *', async () => {
      await this.processEndedAuctions();
    });

    // Check for auctions ending soon (every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
      await this.checkEndingAuctions();
    });
  }

  private async processEndedAuctions() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get active auctions that have ended
      const result = await client.query(
        `SELECT * FROM auctions 
         WHERE status = 'active' 
         AND end_time <= NOW()`
      );

      for (const auction of result.rows) {
        // Get highest bid
        const highestBidResult = await client.query(
          `SELECT * FROM bids 
           WHERE auction_id = $1 
           ORDER BY amount DESC 
           LIMIT 1`,
          [auction.id]
        );

        if (highestBidResult.rows.length > 0) {
          const highestBid = highestBidResult.rows[0];

          // Update auction status and winner
          await client.query(
            `UPDATE auctions 
             SET status = 'ended',
                 winner_id = $1,
                 final_price = $2,
                 settlement_time = NOW()
             WHERE id = $3`,
            [highestBid.bidder_id, highestBid.amount, auction.id]
          );

          // Settle earnings
          await this.earningsService.settleAuctionEarnings(auction.id);

          // For live auctions, emit end event
          if (auction.type === 'live') {
            this.socketService.emitToRoom(
              `auction_${auction.id}`,
              'auction:ended',
              {
                auctionId: auction.id,
                winnerId: highestBid.bidder_id,
                finalPrice: highestBid.amount,
              }
            );
          }
        } else {
          // No bids, mark as cancelled
          await client.query(
            `UPDATE auctions 
             SET status = 'cancelled' 
             WHERE id = $1`,
            [auction.id]
          );

          // For live auctions, emit cancellation event
          if (auction.type === 'live') {
            this.socketService.emitToRoom(
              `auction_${auction.id}`,
              'auction:cancelled',
              {
                auctionId: auction.id,
                reason: 'No bids received',
              }
            );
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Process ended auctions error:', error);
    } finally {
      client.release();
    }
  }

  private async checkEndingAuctions() {
    try {
      // Get live auctions ending in the next 15 minutes
      const result = await this.pool.query(
        `SELECT * FROM auctions 
         WHERE status = 'active' 
         AND type = 'live'
         AND end_time <= NOW() + INTERVAL '15 minutes'
         AND end_time > NOW()`
      );

      for (const auction of result.rows) {
        this.socketService.emitToRoom(
          `auction_${auction.id}`,
          'auction:endingSoon',
          {
            auctionId: auction.id,
            endTime: auction.end_time,
            timeRemaining: new Date(auction.end_time).getTime() - Date.now(),
          }
        );
      }
    } catch (error) {
      console.error('Check ending auctions error:', error);
    }
  }
}

export default CronService; 