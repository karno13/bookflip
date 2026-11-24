-- Availability of the offer at the moment its deal alert was marked seen (for the "are we first?"
-- measurement: was the offer still buyable when the owner looked). NULL until seen.
ALTER TABLE deal_alerts ADD COLUMN seen_availability TEXT;
