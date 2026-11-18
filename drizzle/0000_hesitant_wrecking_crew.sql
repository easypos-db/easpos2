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
