CREATE TABLE "poll_ballot_rankings_archive" (
	"id" integer NOT NULL,
	"ballot_id" integer NOT NULL,
	"option_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_ballots_archive" (
	"id" integer NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp,
	"archive_reason" text,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
