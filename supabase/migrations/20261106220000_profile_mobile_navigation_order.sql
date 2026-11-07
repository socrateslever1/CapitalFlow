-- Per-profile mobile navigation order, independent of desktop top/hub menus.
-- Permission to update remains governed by existing owner-scoped perfis RLS.
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS ui_mobile_nav_order jsonb
  NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.perfis'::regclass
      AND conname = 'perfis_ui_mobile_nav_order_array'
  ) THEN
    ALTER TABLE public.perfis ADD CONSTRAINT perfis_ui_mobile_nav_order_array
      CHECK (jsonb_typeof(ui_mobile_nav_order) = 'array'
        AND jsonb_array_length(ui_mobile_nav_order) <= 12);
  END IF;
END $$;
