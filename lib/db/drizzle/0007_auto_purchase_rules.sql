CREATE TABLE IF NOT EXISTS "auto_purchase_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "source_product_id" text NOT NULL,
  "source_product_name" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_stock" integer,
  "last_checked_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "last_order_code" text,
  "last_purchased_amount" integer,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);