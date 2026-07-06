ALTER TABLE "bracket_seeds" ADD COLUMN "player_id" varchar(64);--> statement-breakpoint
ALTER TABLE "brackets" ADD COLUMN "season_id" integer;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;