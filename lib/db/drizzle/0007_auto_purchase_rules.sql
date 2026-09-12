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

DO $$
DECLARE
  app_owner name;
BEGIN
  SELECT tableowner INTO app_owner
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('orders', 'config', 'market_watches')
  ORDER BY CASE tablename WHEN 'orders' THEN 1 WHEN 'config' THEN 2 ELSE 3 END
  LIMIT 1;

  IF app_owner IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.auto_purchase_rules OWNER TO %I', app_owner);
    EXECUTE format('ALTER SEQUENCE public.auto_purchase_rules_id_seq OWNER TO %I', app_owner);
  END IF;
END $$;