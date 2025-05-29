-- Set default platform fees for existing auctions
DO $$
BEGIN
    -- Only proceed if there are auctions to update
    IF EXISTS (SELECT 1 FROM auctions LIMIT 1) THEN
        UPDATE auctions
        SET platform_fee_percentage = CASE
                WHEN type = 'live' THEN 20.00
                ELSE 10.00
            END,
            live_auction_fee_percentage = 20.00,
            buyer_premium_percentage = 5.00,
            listing_fee = 10.00
        WHERE platform_fee_percentage IS NULL
           OR live_auction_fee_percentage IS NULL
           OR buyer_premium_percentage IS NULL
           OR listing_fee IS NULL;
    END IF;
END $$; 