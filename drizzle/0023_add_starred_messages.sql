-- Add starred column to messages table
ALTER TABLE messages ADD COLUMN starred INTEGER DEFAULT 0;
