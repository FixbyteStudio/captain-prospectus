CREATE TABLE `visits_orphaned` (
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
	`reason` text NOT NULL,
	`quarantined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visits_orphaned_quarantined_idx` ON `visits_orphaned` (`quarantined_at`);