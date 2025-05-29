export type AuctionType = 'settled' | 'live';
export type AuctionStatus = 'active' | 'ended' | 'cancelled';

export interface BaseAuction {
  id: number;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  end_time: Date;
  status: AuctionStatus;
  seller_id: number;
  winner_id?: number;
  final_price?: number;
  settlement_time?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SettledAuction extends BaseAuction {
  type: 'settled';
}

export interface LiveAuction extends BaseAuction {
  type: 'live';
  current_bidder_id?: number;
  last_bid_time?: Date;
  minimum_bid_increment: number;
  time_extension: number; // in seconds
}

export type Auction = SettledAuction | LiveAuction;

export interface CreateAuctionDTO {
  title: string;
  description: string;
  starting_price: number;
  end_time: Date;
  type: AuctionType;
  minimum_bid_increment?: number;
  time_extension?: number;
}

export interface UpdateAuctionDTO {
  title?: string;
  description?: string;
  end_time?: Date;
  status?: AuctionStatus;
} 