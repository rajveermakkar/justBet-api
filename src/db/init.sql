-- Drop existing tables in reverse order to handle dependencies
DROP TABLE IF EXISTS purchased_items CASCADE;
DROP TABLE IF EXISTS bids CASCADE;
DROP TABLE IF EXISTS auction_tickets CASCADE;
DROP TABLE IF EXISTS ticket_fees CASCADE;
DROP TABLE IF EXISTS listing_fees CASCADE;
DROP TABLE IF EXISTS platform_fees CASCADE;
DROP TABLE IF EXISTS earnings CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS auctions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (role IN ('user', 'seller', 'admin', 'superadmin'))
);

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) DEFAULT 0.00,
  pending_earnings DECIMAL(10,2) DEFAULT 0.00,
  total_earnings DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create auctions table
CREATE TABLE IF NOT EXISTS auctions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  starting_price DECIMAL(10,2) NOT NULL,
  current_price DECIMAL(10,2) NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'settled',
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  final_price DECIMAL(10,2),
  settlement_time TIMESTAMP,
  current_bidder_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_bid_time TIMESTAMP,
  minimum_bid_increment DECIMAL(10,2) DEFAULT 1.00,
  time_extension INTEGER DEFAULT 30, -- in seconds
  minimum_wallet_balance DECIMAL(10,2) NOT NULL, -- Minimum wallet balance required to participate
  minimum_bid_amount DECIMAL(10,2) NOT NULL, -- Minimum bid amount for live auctions
  platform_fee_percentage DECIMAL(5,2) DEFAULT 10.00, -- Default 10% for settled auctions
  live_auction_fee_percentage DECIMAL(5,2) DEFAULT 20.00, -- 20% for live auctions
  buyer_premium_percentage DECIMAL(5,2) DEFAULT 5.00, -- 5% buyer premium
  listing_fee DECIMAL(10,2) DEFAULT 10.00, -- Base listing fee
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('settled', 'live')),
  CHECK (status IN ('active', 'ended', 'cancelled')),
  CHECK (minimum_bid_amount >= starting_price)
);

-- Create wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  stripe_payment_id VARCHAR(255),
  bank_transfer_id VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('deposit', 'withdrawal', 'bid', 'refund', 'seller_earning', 'admin_earning', 'platform_fee')),
  CHECK (status IN ('pending', 'completed', 'failed'))
);

-- Create earnings table
CREATE TABLE IF NOT EXISTS earnings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (type IN ('seller', 'admin')),
  CHECK (status IN ('pending', 'settled', 'cancelled'))
);

-- Create platform fees table
CREATE TABLE IF NOT EXISTS platform_fees (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'settled', 'cancelled'))
);

-- Create listing fees table
CREATE TABLE IF NOT EXISTS listing_fees (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'settled', 'cancelled'))
);

-- Create ticket fees table
CREATE TABLE IF NOT EXISTS ticket_fees (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'settled', 'cancelled'))
);

-- Create auction tickets table
CREATE TABLE IF NOT EXISTS auction_tickets (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'used', 'expired')),
  UNIQUE(auction_id, user_id)
);

-- Create bids table
CREATE TABLE IF NOT EXISTS bids (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  wallet_transaction_id INTEGER REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create purchased items table
CREATE TABLE IF NOT EXISTS purchased_items (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
  buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purchase_price DECIMAL(10,2) NOT NULL,
  buyer_premium DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  certificate_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'archived', 'disputed'))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_type ON auctions(type);
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_auction_tickets_auction_id ON auction_tickets(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_tickets_user_id ON auction_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_user_id ON earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_auction_id ON earnings(auction_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_auction_id ON platform_fees(auction_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_buyer_id ON purchased_items(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_seller_id ON purchased_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_auction_id ON purchased_items(auction_id); 