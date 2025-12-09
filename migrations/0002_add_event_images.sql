-- Event images table for multiple images per event
CREATE TABLE IF NOT EXISTS event_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_key TEXT NOT NULL,
  is_cover INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id);
CREATE INDEX IF NOT EXISTS idx_event_images_cover ON event_images(event_id, is_cover);
