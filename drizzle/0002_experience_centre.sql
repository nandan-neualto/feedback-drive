ALTER TABLE `feedback` ADD `visit_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback` ADD `visit_zone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback` ADD `team_reply` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback` ADD `team_reply_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback` ADD `is_demo` integer DEFAULT false NOT NULL;
