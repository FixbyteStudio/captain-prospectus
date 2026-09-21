CREATE TABLE `overpass_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`lat` real,
	`lng` real,
	`address` text,
	`phone` text,
	`website` text,
	`cuisine` text,
	`source` text NOT NULL,
	`source_ref` text,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assigned_to` text,
	`last_visit_at` integer,
	`next_visit_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_dedupe_key_idx` ON `prospects` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `prospects_assigned_status_idx` ON `prospects` (`assigned_to`,`status`);--> statement-breakpoint
CREATE INDEX `prospects_status_idx` ON `prospects` (`status`);--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`questions` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scripts_active_idx` ON `scripts` (`is_active`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`prospect_id` text NOT NULL,
	`agent_email` text NOT NULL,
	`visited_at` integer NOT NULL,
	`client_visited_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`lat` real,
	`lng` real,
	`flyer_given` integer DEFAULT false NOT NULL,
	`outcome` text NOT NULL,
	`follow_up_at` integer,
	`notes` text,
	`script_id` integer,
	`answers` text DEFAULT '{}' NOT NULL,
	`client_version` integer NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visits_prospect_visited_idx` ON `visits` (`prospect_id`,`visited_at`);--> statement-breakpoint
CREATE INDEX `visits_received_idx` ON `visits` (`received_at`);--> statement-breakpoint
CREATE INDEX `visits_agent_visited_idx` ON `visits` (`agent_email`,`visited_at`);