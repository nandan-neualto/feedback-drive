CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT 'default' NOT NULL,
	`answers` text NOT NULL,
	`questions_snapshot` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`kiosk_id` text DEFAULT 'K-01' NOT NULL,
	`area` text DEFAULT 'Experience Zone' NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `responses_survey_idx` ON `responses` (`survey_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `responses_board_idx` ON `responses` (`featured`,`consent`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `responses_request_idx` ON `responses` (`survey_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`questions` text NOT NULL,
	`allow_photos` integer DEFAULT true NOT NULL,
	`require_name` integer DEFAULT false NOT NULL,
	`show_on_board` integer DEFAULT true NOT NULL,
	`cover_image` text,
	`closes_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `surveys_status_idx` ON `surveys` (`status`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`purpose` text DEFAULT 'response' NOT NULL,
	`response_id` text,
	`survey_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `uploads_response_idx` ON `uploads` (`response_id`);--> statement-breakpoint
CREATE INDEX `uploads_survey_idx` ON `uploads` (`survey_id`);