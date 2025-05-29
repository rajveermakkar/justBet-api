-- Add auction type column
ALTER TABLE auctions
ADD COLUMN type VARCHAR(20) DEFAULT 'standard' NOT NULL,
ADD CONSTRAINT check_auction_type 
    CHECK (type IN ('standard', 'live', 'dutch', 'sealed'));

-- Update existing auctions to have a default type
UPDATE auctions
SET type = 'standard'
WHERE type IS NULL; 