ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_reset_token_idx ON users (reset_token_hash);