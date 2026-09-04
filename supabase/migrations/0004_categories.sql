-- =============================================================================
-- AYRA · 0004 · Kategori mimarisi
-- İki seviyeli, yönetim panelinden düzenlenebilir.
-- weight: AYRA Skor hesabında kategorinin ağırlığı (1.0 = nötr)
-- =============================================================================

create table if not exists public.report_categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.report_categories(id) on delete cascade,
  name         text not null,
  slug         text not null unique,
  description  text,
  icon         text not null default 'dot',      -- ikon anahtarı (SVG seti)
  color        text not null default '#0E7C86',  -- harita pin rengi
  weight       numeric(3,2) not null default 1.00 check (weight between 0.10 and 3.00),
  -- Bu kategori için varsayılan hedef çözüm süresi (gün) — sessizlik sayacı eşiği
  sla_days     smallint not null default 30 check (sla_days > 0),
  sort_order   smallint not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_categories_parent on public.report_categories(parent_id);
create index if not exists idx_categories_active on public.report_categories(is_active, sort_order);

drop trigger if exists trg_categories_touch on public.report_categories;
create trigger trg_categories_touch before update on public.report_categories
  for each row execute function public.touch_updated_at();
