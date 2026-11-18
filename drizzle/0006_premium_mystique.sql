ALTER TABLE `orders` ADD `subtotal` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `refund_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payments` text DEFAULT '[]' NOT NULL;