ALTER TABLE `orders` ADD `bill_requested` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_item_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `merged_into` integer;