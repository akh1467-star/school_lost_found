-- 우리학교 분실물함 데이터베이스 설정 (이미 Supabase에 적용되어 있음, 기록용)

create or replace function public.today_kst() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 담당자(업로드 권한) 이메일 목록
create table public.staff (email text primary key, note text, created_at timestamptz not null default now());
alter table public.staff enable row level security;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where lower(email) = lower(coalesce(auth.jwt()->>'email','')))
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
create policy "staff can read staff" on public.staff for select to authenticated using (public.is_staff());

-- 분실물
create table public.items (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 30),
  description text check (char_length(description) <= 80),
  category text not null check (category in ('clothes','bottle','stationery','book','bag','idcard','card','accessory','cosmetic','device','umbrella','etc')),
  place text not null check (place in ('1학년 1교무실','1학년 2교무실','2학년 1교무실','2학년 2교무실','3학년 교무실')),
  received_on date not null default public.today_kst(),
  photo_path text,
  claimed boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index items_received_on_idx on public.items (received_on);
alter table public.items enable row level security;
create policy "public can view active items" on public.items for select to anon, authenticated
  using (claimed = false and received_on >= public.today_kst() - 7);
create policy "staff view all" on public.items for select to authenticated using (public.is_staff());
create policy "staff insert" on public.items for insert to authenticated with check (public.is_staff());
create policy "staff update" on public.items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete" on public.items for delete to authenticated using (public.is_staff());

-- 교무실별 요일 담당 명단 (1=월 … 5=금), 담당자만 열람
create table public.roster (
  place text not null check (place in ('1학년 1교무실','1학년 2교무실','2학년 1교무실','2학년 2교무실','3학년 교무실')),
  weekday smallint not null check (weekday between 1 and 5),
  names text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (place, weekday)
);
alter table public.roster enable row level security;
create policy "staff read roster" on public.roster for select to authenticated using (public.is_staff());
create policy "staff write roster" on public.roster for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 사진 저장소
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos','photos', true, 2097152, array['image/jpeg','image/png','image/webp']);
create policy "staff upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_staff());
create policy "staff delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_staff());

-- 매일 19:00(한국 시간) 만료 물건 삭제: Edge Function cleanup-expired 호출
-- select cron.schedule('cleanup-expired-daily', '0 10 * * *', $$ select net.http_post(
--   url := 'https://<project>.supabase.co/functions/v1/cleanup-expired',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon key>'),
--   body := '{}'::jsonb) $$);

-- 날짜별 담당 명단 (구글 시트 동기화, Edge Function sync-roster가 기록)
create table public.roster_dates (
  duty_date date not null,
  place text not null check (place in ('1학년 1교무실','1학년 2교무실','2학년 1교무실','2학년 2교무실','3학년 교무실')),
  names text[] not null default '{}',
  primary key (duty_date, place)
);
alter table public.roster_dates enable row level security;
create policy "staff read roster_dates" on public.roster_dates for select to authenticated using (public.is_staff());
create table public.sync_status (id smallint primary key default 1 check (id = 1), last_run_at timestamptz, ok boolean, message text, rows_loaded int);
insert into public.sync_status (id) values (1);
alter table public.sync_status enable row level security;
create policy "staff read sync_status" on public.sync_status for select to authenticated using (public.is_staff());
-- 매일 06:30(한국 시간) sync-roster 호출: cron '30 21 * * *'

-- 서버 전용 설정 (정책 없음 → 서버 함수만 읽음). 구글 시트 게시 주소를 여기에 저장
create table public.app_config (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
-- insert into public.app_config (key, value) values ('roster_sheet_csv_url', '<구글 시트 CSV 게시 주소>');

-- 역할: teacher / student
alter table public.staff add column role text not null default 'teacher' check (role in ('teacher','student'));
-- my_role(), is_teacher() 함수와 정책: 삭제는 선생님 전체·학생은 오늘 올린 물건만, 요일 명단 수정과 담당자 목록 보기는 선생님만
-- revoke_user_sessions(uid): 학생 계정 비밀번호 변경 시 기존 로그인 해제 (service_role 전용)

-- 담당 학생 개인 계정
alter table public.staff add column student_no text unique, add column student_name text,
  add column active boolean not null default true, add column must_change_pw boolean not null default false;
-- my_profile(), mark_password_changed(), my_role()/is_staff()는 active인 계정만 인정
-- items.uploader: 트리거 set_uploader가 "학번 이름" 또는 "선생님"으로 기록
-- 학생용(anon)에는 uploader·created_by 열을 보이지 않음:
revoke select on public.items from anon;
grant select (id, name, description, category, place, received_on, photo_path, claimed, created_at) on public.items to anon;
