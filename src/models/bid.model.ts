export interface Bid {
  id: number;
  auction_id: number;
  bidder_id: number;
  amount: number;
  created_at: Date;
}

export interface CreateBidDTO {
  auction_id: number;
  amount: number;
}

export interface LiveBidEvent {
  auction_id: number;
  bidder_id: number;
  amount: number;
  timestamp: Date;
  type: 'new_bid' | 'auction_ended' | 'time_extended';
  time_remaining?: number;
} 