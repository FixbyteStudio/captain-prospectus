ALTER TABLE `prospects` ADD `merged_into` text REFERENCES prospects(id);--> statement-breakpoint
CREATE INDEX `prospects_merged_idx` ON `prospects` (`merged_into`);