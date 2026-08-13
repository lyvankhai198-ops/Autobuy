CREATE TABLE "market_watches" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"keywords" text,
	"markup_type" text DEFAULT 'fixed' NOT NULL,
	"markup_value" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_market_product_id" text,
	"current_market_product_name" text,
	"current_seller_product_id" text,
	"last_market_price" integer,
	"last_switched_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
