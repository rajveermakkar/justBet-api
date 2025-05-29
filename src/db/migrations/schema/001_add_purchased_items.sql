-- Add purchased items table if it doesn't exist
CREATE TABLE IF NOT EXISTS purchased_items (
  id SERIAL PRIMARY KEY,
  auction_id INTEGER REFERENCES auctions(id),
  buyer_id INTEGER REFERENCES users(id),
  seller_id INTEGER REFERENCES users(id),
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_purchased_items_buyer_id ON purchased_items(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_seller_id ON purchased_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_purchased_items_auction_id ON purchased_items(auction_id); 