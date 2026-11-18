ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS character_data JSONB;
