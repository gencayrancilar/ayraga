-- =============================================================================
-- AYRA · 0022 · Gönderim kilidi
--
-- Haftalık kurum gönderimi arka arkaya iki kez tetiklenirse, ikinci çalışma
-- birincisi daha işini bitirmeden aynı listeyi okuyabiliyor: kuruma aynı
-- sorunlar ikinci kez postalanıyor. Bir kuruma iki kez yazı göndermek, bu
-- platformun ciddiyetine zarar veren bir hatadır.
--
-- Çözüm, veritabanında tutulan basit bir iş kilidi. Havuzlanmış bağlantılarda
-- oturum ömürlü advisory lock güvenilir değil (her işlem başka bağlantıya
-- düşebilir); bu yüzden kilit bir satır olarak tutulur.
-- =============================================================================

create table if not exists public.job_locks (
  name       text primary key,
  locked_at  timestamptz,
  locked_by  text,
  updated_at timestamptz not null default now()
);

alter table public.job_locks enable row level security;
-- Tabloya yalnızca sistem rolü (servis tarafı) dokunur; kimseye policy açılmıyor.

insert into public.job_locks (name) values ('haftalik_kurum_gonderimi')
  on conflict (name) do nothing;

/**
 * Kilidi almayı dener. Alabildiyse true döner.
 *
 * p_bayat: bir çalışma yarıda kalıp kilidi bırakamazsa, bu süre sonunda kilit
 * kendiliğinden düşmüş sayılır. Aksi hâlde tek bir çökme gönderimi kalıcı
 * olarak durdururdu.
 */
create or replace function public.is_kilitle(p_ad text, p_bayat interval default interval '15 minutes')
returns boolean language sql volatile set search_path = public as $$
  with denenen as (
    update public.job_locks
       set locked_at = now(), locked_by = current_setting('application_name', true), updated_at = now()
     where name = p_ad
       and (locked_at is null or locked_at < now() - p_bayat)
    returning 1
  )
  select exists (select 1 from denenen)
$$;

create or replace function public.is_kilidi_coz(p_ad text)
returns void language sql volatile set search_path = public as $$
  update public.job_locks set locked_at = null, locked_by = null, updated_at = now()
   where name = p_ad
$$;
