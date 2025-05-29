import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { LiveBidEvent } from '../models/bid.model';

class SocketService {
  private io: Server;
  private auctionTimers: Map<number, NodeJS.Timeout> = new Map();

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Join auction room
      socket.on('joinAuction', (auctionId: number) => {
        socket.join(`auction_${auctionId}`);
        console.log(`Client ${socket.id} joined auction ${auctionId}`);
      });

      // Leave auction room
      socket.on('leaveAuction', (auctionId: number) => {
        socket.leave(`auction_${auctionId}`);
        console.log(`Client ${socket.id} left auction ${auctionId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  // Emit bid event to all clients in the auction room
  public emitBidEvent(auctionId: number, event: LiveBidEvent) {
    this.io.to(`auction_${auctionId}`).emit('bid_event', event);
  }

  // Start auction timer
  public startAuctionTimer(auctionId: number, endTime: Date, timeExtension: number) {
    const now = new Date();
    const timeRemaining = endTime.getTime() - now.getTime();

    if (timeRemaining <= 0) {
      this.emitBidEvent(auctionId, {
        auction_id: auctionId,
        bidder_id: 0,
        amount: 0,
        timestamp: new Date(),
        type: 'auction_ended'
      });
      return;
    }

    const timer = setTimeout(() => {
      this.emitBidEvent(auctionId, {
        auction_id: auctionId,
        bidder_id: 0,
        amount: 0,
        timestamp: new Date(),
        type: 'auction_ended'
      });
      this.auctionTimers.delete(auctionId);
    }, timeRemaining);

    this.auctionTimers.set(auctionId, timer);
  }

  // Extend auction time
  public extendAuctionTime(auctionId: number, timeExtension: number) {
    const currentTimer = this.auctionTimers.get(auctionId);
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const newEndTime = new Date(Date.now() + timeExtension * 1000);
    this.startAuctionTimer(auctionId, newEndTime, timeExtension);

    this.emitBidEvent(auctionId, {
      auction_id: auctionId,
      bidder_id: 0,
      amount: 0,
      timestamp: new Date(),
      type: 'time_extended',
      time_remaining: timeExtension
    });
  }

  // Stop auction timer
  public stopAuctionTimer(auctionId: number) {
    const timer = this.auctionTimers.get(auctionId);
    if (timer) {
      clearTimeout(timer);
      this.auctionTimers.delete(auctionId);
    }
  }

  emitToRoom(room: string, event: string, data: any) {
    this.io.to(room).emit(event, data);
  }
}

export default SocketService; 