CREATE TABLE `admin_login` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_login_username_unique` ON `admin_login` (`username`);