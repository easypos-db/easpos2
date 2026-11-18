ALTER TABLE `orders` ADD `service_type` text DEFAULT 'package' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `table_no` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `phone` text DEFAULT '' NOT NULL;