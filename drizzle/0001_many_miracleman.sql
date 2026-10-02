CREATE TABLE `graph_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_graph_annotations_node` ON `graph_annotations` (`user_id`,`node_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `graph_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_graph_batches_revision` ON `graph_batches` (`user_id`,`base_revision`);--> statement-breakpoint
CREATE INDEX `idx_graph_batches_fingerprint` ON `graph_batches` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `graph_node_states` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`state` text NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`)
);
--> statement-breakpoint
CREATE TABLE `graph_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
