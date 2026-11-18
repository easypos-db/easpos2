CREATE TABLE `ingredients` (
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
CREATE UNIQUE INDEX `supplier_invoices_invoice_number_unique` ON `supplier_invoices` (`invoice_number`);