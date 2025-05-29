export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  created_at: Date;
  updated_at: Date;
}

export interface Auction {
  id: number;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  end_time: Date;
  status: 'active' | 'ended' | 'cancelled';
  seller_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface Bid {
  id: number;
  auction_id: number;
  bidder_id: number;
  amount: number;
  created_at: Date;
}

export interface CreateAuctionDTO {
  title: string;
  description: string;
  starting_price: number;
  end_time: Date;
}

export interface CreateBidDTO {
  auction_id: number;
  amount: number;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RegisterDTO {
  username: string;
  email: string;
  password: string;
} 