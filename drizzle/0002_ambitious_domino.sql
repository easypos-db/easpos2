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
