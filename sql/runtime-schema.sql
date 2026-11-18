-- Supplemental runtime D1 tables for the menu, hybrid offline support,
-- local print bridge, webhooks, and two-layer recipes.
-- Apply drizzle/0000..0008 first on a new database. The application also
-- creates these tables automatically when it first connects.

CREATE TABLE IF NOT EXISTS menu_products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  ys_price INTEGER NOT NULL, brand TEXT NOT NULL DEFAULT 'wingy',
  vat_rate INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vat_rates (rate INTEGER PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '', balance INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sub_recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, source_name TEXT NOT NULL,
  ingredient_id TEXT NOT NULL UNIQUE REFERENCES ingredients(id),
  yield_milli INTEGER NOT NULL, yield_unit TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sub_recipe_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sub_recipe_id TEXT NOT NULL REFERENCES sub_recipes(id),
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_milli INTEGER NOT NULL,
  base_unit TEXT NOT NULL, UNIQUE(sub_recipe_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS recipe_seed_state (
  seed_key TEXT PRIMARY KEY, seeded_at INTEGER NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS printer_devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  types TEXT NOT NULL DEFAULT '[]', main_channel TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS printer_discovery (name TEXT PRIMARY KEY, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS print_queue (
  id TEXT PRIMARY KEY, order_id INTEGER, printer_type TEXT NOT NULL, printer_name TEXT NOT NULL,
  content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
  claimed_at INTEGER, completed_at INTEGER, error TEXT
);
CREATE INDEX IF NOT EXISTS print_queue_status_created_idx ON print_queue(status, created_at);
CREATE TABLE IF NOT EXISTS print_bridge_tokens (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS webhook_tokens (
  platform TEXT PRIMARY KEY, token_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS external_orders (
  platform TEXT NOT NULL, external_id TEXT NOT NULL, order_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(platform, external_id)
);
CREATE TABLE IF NOT EXISTS request_idempotency (
  request_id TEXT PRIMARY KEY, response_json TEXT NOT NULL, status INTEGER NOT NULL, created_at INTEGER NOT NULL
);

-- On a database created directly from the original Drizzle migrations, the
-- API adds these compatibility columns automatically when missing:
-- ALTER TABLE ingredients ADD COLUMN ingredient_type TEXT NOT NULL DEFAULT 'raw';
-- ALTER TABLE ingredients ADD COLUMN linked_product_id TEXT;
-- ALTER TABLE recipes ADD COLUMN quantity_milli INTEGER NOT NULL DEFAULT 0;
