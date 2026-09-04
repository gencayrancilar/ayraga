-- =============================================================================
-- AYRA · 0010 · Row Level Security
-- Varsayılan: her şey kapalı. Politikalar yalnızca gerekli olanı açar.
-- =============================================================================

alter table public.countries              enable row level security;
alter table public.cities                 enable row level security;
alter table public.districts              enable row level security;
alter table public.neighborhoods          enable row level security;
alter table public.report_categories      enable row level security;
alter table public.profiles               enable row level security;
alter table public.reports                enable row level security;
alter table public.report_media           enable row level security;
alter table public.report_supports        enable row level security;
alter table public.report_follows         enable row level security;
alter table public.report_status_history  enable row level security;
alter table public.report_events          enable row level security;
alter table public.report_views           enable row level security;
alter table public.authorities            enable row level security;
alter table public.category_authorities   enable row level security;
alter table public.authority_submissions  enable row level security;
alter table public.notifications          enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.moderation_reports     enable row level security;
alter table public.neighborhood_scores    enable row level security;
alter table public.score_settings         enable row level security;
alter table public.rate_limits            enable row level security;

-- ---------------------------------------------------------------------------
-- Referans veri: herkes okur, yalnızca admin yazar
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'countries','cities','districts','neighborhoods','report_categories',
    'authorities','category_authorities','neighborhood_scores','score_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Kullanıcı kendi rolünü veya ban durumunu değiştiremez
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_banned = (select p.is_banned from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_moderate on public.profiles;
create policy profiles_moderate on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bildirimler (reports)
-- ---------------------------------------------------------------------------
drop policy if exists reports_public_read on public.reports;
create policy reports_public_read on public.reports
  for select using (
    (not is_hidden and status <> 'rejected')
    or user_id = auth.uid()
    or public.is_moderator()
  );

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_banned()
    and status = 'new'
    and duplicate_of_id is null
    and not is_hidden
  );

-- Sahibi yalnızca 'new' durumundayken ve ilk 60 dakika içinde metin düzeltebilir
drop policy if exists reports_update_own on public.reports;
create policy reports_update_own on public.reports
  for update to authenticated
  using (
    user_id = auth.uid()
    and status = 'new'
    and created_at > now() - interval '60 minutes'
    and not public.is_banned()
  )
  with check (
    user_id = auth.uid()
    and status = 'new'
    and not is_hidden
    and duplicate_of_id is null
  );

drop policy if exists reports_moderate on public.reports;
create policy reports_moderate on public.reports
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Medya
-- ---------------------------------------------------------------------------
drop policy if exists media_read on public.report_media;
create policy media_read on public.report_media
  for select using (
    exists (select 1 from public.reports r where r.id = report_id
            and ((not r.is_hidden and r.status <> 'rejected') or r.user_id = auth.uid() or public.is_moderator()))
  );

drop policy if exists media_insert on public.report_media;
create policy media_insert on public.report_media
  for insert to authenticated
  with check (
    not public.is_banned()
    and (
      -- Sorun görseli: yalnızca sorunun sahibi, ilk 60 dakika içinde
      (kind = 'issue' and exists (
        select 1 from public.reports r
        where r.id = report_id and r.user_id = auth.uid()
          and r.created_at > now() - interval '60 minutes'))
      -- Çözüm görseli / belge: yalnızca moderatör
      or (kind in ('resolution','document') and public.is_moderator())
    )
  );

drop policy if exists media_moderate on public.report_media;
create policy media_moderate on public.report_media
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Destekler
-- ---------------------------------------------------------------------------
drop policy if exists supports_read on public.report_supports;
create policy supports_read on public.report_supports for select using (true);

drop policy if exists supports_write_own on public.report_supports;
create policy supports_write_own on public.report_supports
  for insert to authenticated with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists supports_delete_own on public.report_supports;
create policy supports_delete_own on public.report_supports
  for delete to authenticated using (user_id = auth.uid());

-- Takipler yalnızca sahibine görünür
drop policy if exists follows_own on public.report_follows;
create policy follows_own on public.report_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Durum geçmişi ve kanıt zinciri: herkes okur, yalnızca moderatör yazar
-- ---------------------------------------------------------------------------
drop policy if exists status_history_read on public.report_status_history;
create policy status_history_read on public.report_status_history for select using (true);

drop policy if exists status_history_write on public.report_status_history;
create policy status_history_write on public.report_status_history
  for insert to authenticated with check (public.is_moderator());

drop policy if exists events_read on public.report_events;
create policy events_read on public.report_events for select using (true);
-- INSERT yalnızca SECURITY DEFINER fonksiyonu üzerinden; doğrudan yazma politikası yok.

drop policy if exists views_no_read on public.report_views;
-- report_views tamamen kapalı; yalnızca SECURITY DEFINER register_view() yazar.

-- ---------------------------------------------------------------------------
-- Başvurular: kamuya açık şeffaflık kaydıdır
-- ---------------------------------------------------------------------------
drop policy if exists submissions_read on public.authority_submissions;
create policy submissions_read on public.authority_submissions for select using (true);

drop policy if exists submissions_write on public.authority_submissions;
create policy submissions_write on public.authority_submissions
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Bildirimler / push
-- ---------------------------------------------------------------------------
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Moderasyon ihbarları: kullanıcı kendi ihbarını görür, moderatör hepsini
-- ---------------------------------------------------------------------------
drop policy if exists moderation_insert on public.moderation_reports;
create policy moderation_insert on public.moderation_reports
  for insert to authenticated with check (reporter_id = auth.uid() and not public.is_banned());

drop policy if exists moderation_read on public.moderation_reports;
create policy moderation_read on public.moderation_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());

drop policy if exists moderation_manage on public.moderation_reports;
create policy moderation_manage on public.moderation_reports
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on
  public.reports, public.report_media, public.report_supports, public.report_follows,
  public.report_status_history, public.moderation_reports, public.notifications,
  public.push_subscriptions, public.profiles, public.authority_submissions,
  public.report_categories, public.authorities, public.category_authorities,
  public.neighborhoods, public.districts, public.cities, public.countries,
  public.score_settings, public.neighborhood_scores
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- report_views ve rate_limits doğrudan erişime kapalı
revoke all on public.report_views, public.rate_limits from anon, authenticated;
