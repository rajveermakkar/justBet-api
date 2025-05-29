-- Add fee-related columns to auctions table
ALTER TABLE auctions
ADD COLUMN platform_fee_percentage DECIMAL(5,2) DEFAULT 10.00,
ADD COLUMN live_auction_fee_percentage DECIMAL(5,2) DEFAULT 20.00,
ADD COLUMN buyer_premium_percentage DECIMAL(5,2) DEFAULT 5.00,
ADD COLUMN listing_fee DECIMAL(10,2) DEFAULT 10.00;

-- Add constraints to ensure fees are within reasonable ranges
ALTER TABLE auctions
ADD CONSTRAINT check_platform_fee_percentage 
    CHECK (platform_fee_percentage >= 0 AND platform_fee_percentage <= 100),
ADD CONSTRAINT check_live_auction_fee_percentage 
    CHECK (live_auction_fee_percentage >= 0 AND live_auction_fee_percentage <= 100),
ADD CONSTRAINT check_buyer_premium_percentage 
    CHECK (buyer_premium_percentage >= 0 AND buyer_premium_percentage <= 100),
ADD CONSTRAINT check_listing_fee 
    CHECK (listing_fee >= 0); 