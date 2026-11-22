CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`created` integer NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_id_unique` ON `members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand` text NOT NULL,
	`platform` text NOT NULL,
	`customer` text NOT NULL,
	`area` text NOT NULL,
	`items` text NOT NULL,
	`note` text NOT NULL,
	`total` integer NOT NULL,
	`payment` text NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`courier_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`departed` integer,
	`delivered` integer,
	`business_day` text NOT NULL,
	`demo` integer DEFAULT 1 NOT NULL
);
CREATE TABLE `courier_roster` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`username` text NOT NULL,
	`pin_hash` text,
	`pin_salt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courier_roster_username_unique` ON `courier_roster` (`username`);--> statement-breakpoint
CREATE TABLE `courier_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`courier_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_limits` (
	`username` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL
);
CREATE TABLE `price_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`old_price` integer NOT NULL,
	`new_price` integer NOT NULL,
	`actor` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_prices` (
	`product_id` text PRIMARY KEY NOT NULL,
	`ys_price` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE TABLE `admin_login` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_login_username_unique` ON `admin_login` (`username`);ALTER TABLE `orders` ADD `service_type` text DEFAULT 'package' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `table_no` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `phone` text DEFAULT '' NOT NULL;ALTER TABLE `orders` ADD `adjustments` text DEFAULT '[]' NOT NULL;ALTER TABLE `orders` ADD `subtotal` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `refund_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payments` text DEFAULT '[]' NOT NULL;ALTER TABLE `orders` ADD `bill_requested` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_item_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `merged_into` integer;CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`purchase_unit` text NOT NULL,
	`base_unit` text NOT NULL,
	`base_quantity` integer NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`stock_base` integer DEFAULT 0 NOT NULL,
	`critical_base` integer DEFAULT 0 NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `manager_pin` (
	`id` integer PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_cost_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`line_index` integer NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`revenue_minor` integer NOT NULL,
	`cost_minor` integer NOT NULL,
	`missing_recipe` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order_costs`(`order_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_costs` (
	`order_id` integer PRIMARY KEY NOT NULL,
	`revenue_minor` integer NOT NULL,
	`cost_minor` integer NOT NULL,
	`profit_minor` integer NOT NULL,
	`has_missing_recipe` integer DEFAULT 0 NOT NULL,
	`calculated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity_base` integer NOT NULL,
	`base_unit` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`source_id` text NOT NULL,
	`quantity_base` integer NOT NULL,
	`unit_cost_minor` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_product_ingredient_unique` ON `recipes` (`product_id`,`ingredient_id`);--> statement-breakpoint
CREATE TABLE `supplier_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_number` text NOT NULL,
	`supplier` text NOT NULL,
	`total_minor` integer NOT NULL,
	`invoice_date` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_invoices_invoice_number_unique` ON `supplier_invoices` (`invoice_number`);-- Supplemental runtime D1 tables for the menu, hybrid offline support,
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
