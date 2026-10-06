CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT 'default' NOT NULL,
	`category` text DEFAULT 'Others' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`suggestion` text DEFAULT '' NOT NULL,
	`rating` integer,
	`photos` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`kiosk_id` text DEFAULT 'K-01' NOT NULL,
	`area` text DEFAULT 'Experience Zone' NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_board_idx` ON `feedback` (`published`,`consent`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_category_idx` ON `feedback` (`category`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_request_idx` ON `feedback` (`request_id`);--> statement-breakpoint
ALTER TABLE `uploads` ADD `feedback_id` text REFERENCES feedback(id);--> statement-breakpoint
CREATE INDEX `uploads_feedback_idx` ON `uploads` (`feedback_id`);