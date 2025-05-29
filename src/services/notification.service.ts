import { Pool } from 'pg';
import nodemailer from 'nodemailer';
import { Auction, LiveAuction, SettledAuction } from '../models/auction.model';

class NotificationService {
  private pool: Pool;
  private transporter: nodemailer.Transporter;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT),
    });

    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Notify when auction is created
  async notifyAuctionCreated(auction: Auction) {
    const seller = await this.getUserById(auction.seller_id);
    if (!seller) return;

    await this.sendEmail({
      to: seller.email,
      subject: 'Your Auction Has Been Created',
      html: `
        <h1>Your Auction "${auction.title}" Has Been Created</h1>
        <p>Type: ${auction.type === 'live' ? 'Live Auction' : 'Settled Auction'}</p>
        <p>Starting Price: $${auction.starting_price}</p>
        <p>End Time: ${new Date(auction.end_time).toLocaleString()}</p>
        ${auction.type === 'live' ? `
          <p>Minimum Bid Increment: $${(auction as LiveAuction).minimum_bid_increment}</p>
          <p>Time Extension: ${(auction as LiveAuction).time_extension} seconds</p>
        ` : ''}
      `,
    });
  }

  // Notify when a bid is placed
  async notifyNewBid(auction: Auction, bidderId: number, amount: number) {
    const [seller, bidder] = await Promise.all([
      this.getUserById(auction.seller_id),
      this.getUserById(bidderId),
    ]);

    if (!seller || !bidder) return;

    // Notify seller
    await this.sendEmail({
      to: seller.email,
      subject: 'New Bid on Your Auction',
      html: `
        <h1>New Bid on "${auction.title}"</h1>
        <p>Bidder: ${bidder.username}</p>
        <p>Amount: $${amount}</p>
        <p>Current Price: $${auction.current_price}</p>
      `,
    });

    // Notify outbid users
    if (auction.type === 'live') {
      const outbidUsers = await this.getOutbidUsers(auction.id, bidderId);
      for (const user of outbidUsers) {
        await this.sendEmail({
          to: user.email,
          subject: 'You Have Been Outbid',
          html: `
            <h1>You Have Been Outbid on "${auction.title}"</h1>
            <p>Current Price: $${auction.current_price}</p>
            <p>Place a new bid to stay in the auction!</p>
          `,
        });
      }
    }
  }

  // Notify when auction ends
  async notifyAuctionEnded(auction: Auction) {
    const seller = await this.getUserById(auction.seller_id);
    if (!seller) return;

    if (auction.winner_id) {
      const winner = await this.getUserById(auction.winner_id);
      if (!winner) return;

      // Notify winner
      await this.sendEmail({
        to: winner.email,
        subject: 'You Won the Auction!',
        html: `
          <h1>Congratulations! You Won "${auction.title}"</h1>
          <p>Final Price: $${auction.final_price}</p>
          <p>Please complete the payment process.</p>
        `,
      });

      // Notify seller
      await this.sendEmail({
        to: seller.email,
        subject: 'Your Auction Has Ended',
        html: `
          <h1>Your Auction "${auction.title}" Has Ended</h1>
          <p>Winner: ${winner.username}</p>
          <p>Final Price: $${auction.final_price}</p>
        `,
      });
    } else {
      // Notify seller if no bids
      await this.sendEmail({
        to: seller.email,
        subject: 'Your Auction Has Ended',
        html: `
          <h1>Your Auction "${auction.title}" Has Ended</h1>
          <p>No bids were placed on your auction.</p>
        `,
      });
    }
  }

  // Notify when auction is about to end (for live auctions)
  async notifyAuctionEnding(auction: LiveAuction) {
    const [seller, currentBidder] = await Promise.all([
      this.getUserById(auction.seller_id),
      auction.current_bidder_id ? this.getUserById(auction.current_bidder_id) : null,
    ]);

    if (!seller) return;

    // Notify seller
    await this.sendEmail({
      to: seller.email,
      subject: 'Your Live Auction is Ending Soon',
      html: `
        <h1>Your Live Auction "${auction.title}" is Ending Soon</h1>
        <p>Current Price: $${auction.current_price}</p>
        <p>Current Bidder: ${currentBidder ? currentBidder.username : 'None'}</p>
        <p>Time Remaining: ${this.getTimeRemaining(auction.end_time)}</p>
      `,
    });

    // Notify current bidder
    if (currentBidder) {
      await this.sendEmail({
        to: currentBidder.email,
        subject: 'Auction You\'re Leading is Ending Soon',
        html: `
          <h1>The Auction "${auction.title}" is Ending Soon</h1>
          <p>You are currently the highest bidder at $${auction.current_price}</p>
          <p>Time Remaining: ${this.getTimeRemaining(auction.end_time)}</p>
        `,
      });
    }
  }

  private async getUserById(userId: number) {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }

  private async getOutbidUsers(auctionId: number, currentBidderId: number) {
    const result = await this.pool.query(
      `SELECT DISTINCT u.* 
       FROM users u 
       JOIN bids b ON u.id = b.bidder_id 
       WHERE b.auction_id = $1 
       AND b.bidder_id != $2`,
      [auctionId, currentBidderId]
    );
    return result.rows;
  }

  private async sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  private getTimeRemaining(endTime: Date): string {
    const now = new Date();
    const diff = new Date(endTime).getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

export default NotificationService; 