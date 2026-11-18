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
