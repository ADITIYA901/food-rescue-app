-- Run in the Supabase SQL editor. The public/anon key is safe to use with RLS;
-- never put a service-role key in the browser.
create extension if not exists pgcrypto;

create type public.app_role as enum ('donor', 'ngo', 'admin');
create type public.listing_status as enum ('available', 'reserved', 'collected', 'expired');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'collected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.app_role not null default 'donor',
  location text,
  verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ngo_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  registration_number text,
  food_requirements text[] not null default '{}',
  max_quantity numeric not null default 50 check (max_quantity > 0),
  latitude double precision,
  longitude double precision,
  review_status text not null default 'pending' check (review_status in ('pending','approved','declined')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.food_listings (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  donor_display_name text not null default 'Community donor',
  category text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  description text not null default '',
  pickup_location text not null,
  latitude double precision,
  longitude double precision,
  image_url text,
  prepared_at timestamptz,
  expires_at timestamptz not null,
  collection_deadline timestamptz not null,
  status public.listing_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (collection_deadline <= expires_at)
);
create table public.donation_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.food_listings(id) on delete cascade,
  ngo_id uuid not null references public.profiles(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  status public.request_status not null default 'pending',
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, ngo_id)
);
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.donation_requests(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete restrict,
  ngo_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'scheduled' check (status in ('scheduled','ready_for_pickup','collected','cancelled')),
  scheduled_for timestamptz,
  collected_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.platform_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.food_listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','reviewed','resolved')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index food_listings_available_idx on public.food_listings(status, collection_deadline) where status = 'available';
create index food_listings_donor_idx on public.food_listings(donor_id, created_at desc);
create index food_listings_category_idx on public.food_listings(category);
create index donation_requests_listing_idx on public.donation_requests(listing_id, status);
create index donation_requests_ngo_idx on public.donation_requests(ngo_id, created_at desc);
create index collections_parties_idx on public.collections(donor_id, ngo_id, status);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index platform_reports_status_idx on public.platform_reports(status, created_at desc);

grant select on public.food_listings to anon, authenticated;
grant insert, delete on public.food_listings to authenticated;
revoke update on public.food_listings, public.profiles, public.ngo_details, public.notifications from authenticated;
grant update(name,category,quantity,unit,description,pickup_location,latitude,longitude,image_url,prepared_at,expires_at,collection_deadline) on public.food_listings to authenticated;
grant select on public.profiles to authenticated;
grant update(name,location) on public.profiles to authenticated;
grant select, insert on public.ngo_details to authenticated;
grant update(registration_number,food_requirements,max_quantity,latitude,longitude) on public.ngo_details to authenticated;
grant select, insert on public.donation_requests to authenticated;
grant select on public.collections, public.notifications to authenticated;
grant select, insert on public.platform_reports to authenticated;
grant update(read_at) on public.notifications to authenticated;

create function public.set_listing_donor_display_name() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select name into new.donor_display_name from public.profiles where id=new.donor_id;
  return new;
end $$;
create trigger food_listing_donor_display_name before insert or update of donor_id on public.food_listings for each row execute function public.set_listing_donor_display_name();

-- Clients cannot self-assign the privileged admin role. NGOs start unverified.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_role text := lower(coalesce(new.raw_user_meta_data->>'role','donor'));
begin
  insert into public.profiles(id, name, role, location, verified)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    case when requested_role = 'ngo' then 'ngo'::public.app_role else 'donor'::public.app_role end,
    new.raw_user_meta_data->>'location', false);
  if requested_role = 'ngo' then insert into public.ngo_details(profile_id) values(new.id); end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
alter table public.profiles enable row level security;
alter table public.ngo_details enable row level security;
alter table public.food_listings enable row level security;
alter table public.donation_requests enable row level security;
alter table public.collections enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_reports enable row level security;

create policy "Users and admins read profiles" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin() or (role='ngo' and verified));
create policy "Users update own non-privileged profile fields" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and role <> 'admin' and role = (select role from public.profiles p where p.id = (select auth.uid())));
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "NGO details are visible to signed-in community" on public.ngo_details for select to authenticated using (true);
create policy "NGOs manage own application details" on public.ngo_details for insert to authenticated with check (profile_id = (select auth.uid()) and exists(select 1 from public.profiles p where p.id=profile_id and p.role='ngo'));
create policy "NGOs update own details until verified" on public.ngo_details for update to authenticated using (profile_id = (select auth.uid()) and verified_at is null) with check (profile_id = (select auth.uid()) and verified_at is null);
create policy "Admins manage NGO verification" on public.ngo_details for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Available listings visible to community" on public.food_listings for select to anon, authenticated using (status = 'available' or donor_id = (select auth.uid()) or public.is_admin());
create policy "Donors create own listings" on public.food_listings for insert to authenticated with check (donor_id = (select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='donor' and p.is_active));
create policy "Donors manage own available listings" on public.food_listings for update to authenticated using ((donor_id = (select auth.uid()) and status='available' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active)) or public.is_admin()) with check (donor_id = (select auth.uid()) or public.is_admin());
create policy "Donors remove own available listings" on public.food_listings for delete to authenticated using ((donor_id = (select auth.uid()) and status='available' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active)) or public.is_admin());

create policy "Request parties and admins read requests" on public.donation_requests for select to authenticated using (
 ngo_id = (select auth.uid()) or public.is_admin() or exists(select 1 from public.food_listings f where f.id=listing_id and f.donor_id=(select auth.uid())));
create policy "Verified NGOs request available food" on public.donation_requests for insert to authenticated with check (
 ngo_id = (select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='ngo' and p.verified and p.is_active)
 and exists(select 1 from public.food_listings f where f.id=listing_id and f.status='available' and quantity <= f.quantity));
-- Request status transitions go through respond_to_request so the listing and collection
-- rows change atomically. Direct table updates are denied to application roles below.

create policy "Collection parties and admins read collections" on public.collections for select to authenticated using (donor_id=(select auth.uid()) or ngo_id=(select auth.uid()) or public.is_admin());
create policy "Request parties create collections" on public.collections for insert to authenticated with check ((donor_id=(select auth.uid()) or ngo_id=(select auth.uid())) and exists(select 1 from public.donation_requests r where r.id=request_id and r.status='approved'));
create policy "Admins manage collections" on public.collections for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id=(select auth.uid()) or public.is_admin());
create policy "Users mark own notifications read" on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "Admins create notifications" on public.notifications for insert to authenticated with check (public.is_admin());
create policy "Users read own reports and admins read all" on public.platform_reports for select to authenticated using (reporter_id=(select auth.uid()) or public.is_admin());
create policy "Active users report visible listings" on public.platform_reports for insert to authenticated with check (reporter_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active) and exists(select 1 from public.food_listings f where f.id=listing_id));

revoke update on public.donation_requests from authenticated;
revoke update on public.collections from authenticated;
revoke update on public.platform_reports from authenticated;

create function public.notify_request_parties() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  donor_user_id uuid;
  food_name text;
begin
  if tg_op='INSERT' then
    select donor_id,name into donor_user_id,food_name from public.food_listings where id=new.listing_id;
    insert into public.notifications(user_id,title,body) values(donor_user_id,'New food request',new.quantity::text || ' portions requested for ' || food_name || '.');
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved','rejected','collected') then
    select name into food_name from public.food_listings where id=new.listing_id;
    insert into public.notifications(user_id,title,body) values(new.ngo_id,'Request ' || new.status,food_name || ' is now ' || new.status || '.');
  end if;
  return new;
end $$;
create trigger notify_request_change after insert or update of status on public.donation_requests for each row execute function public.notify_request_parties();

-- Create the `food-images` bucket as public for image rendering; uploads remain owner-scoped.
insert into storage.buckets(id,name,public) values ('food-images','food-images',true) on conflict(id) do nothing;
create policy "Public can view food images" on storage.objects for select to public using (bucket_id='food-images');
create policy "Signed-in users upload food images to own folder" on storage.objects for insert to authenticated with check (bucket_id='food-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users update own food images" on storage.objects for update to authenticated using (bucket_id='food-images' and owner_id=(select auth.uid())::text) with check (bucket_id='food-images' and owner_id=(select auth.uid())::text);
create policy "Users delete own food images" on storage.objects for delete to authenticated using (bucket_id='food-images' and owner_id=(select auth.uid())::text);

-- Atomically approve a request and reserve its listing, or close collection.
create function public.respond_to_request(p_request_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_row public.donation_requests%rowtype;
  listing_row public.food_listings%rowtype;
begin
  if p_status not in ('approved','rejected','collected') then raise exception 'Unsupported request status'; end if;
  select * into request_row from public.donation_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into listing_row from public.food_listings where id=request_row.listing_id for update;
  if listing_row.donor_id <> (select auth.uid()) and not public.is_admin() then raise exception 'Only the donor can respond'; end if;
  if p_status='approved' then
    if listing_row.status <> 'available' then raise exception 'This listing is no longer available'; end if;
    if request_row.quantity > listing_row.quantity then raise exception 'Requested quantity exceeds the remaining food'; end if;
    update public.food_listings set status='reserved',updated_at=now() where id=listing_row.id;
    insert into public.collections(request_id,donor_id,ngo_id,status) values(request_row.id,listing_row.donor_id,request_row.ngo_id,'scheduled')
      on conflict(request_id) do nothing;
  elsif p_status='collected' then
    if request_row.status <> 'approved' then raise exception 'Only approved requests can be collected'; end if;
    update public.food_listings set status='collected',updated_at=now() where id=listing_row.id;
    update public.collections set status='collected',collected_at=now(),updated_at=now() where request_id=request_row.id;
  end if;
  update public.donation_requests set status=p_status::public.request_status,updated_at=now() where id=request_row.id;
end $$;
grant execute on function public.respond_to_request(uuid,text) to authenticated;

create function public.admin_verify_ngo(p_profile_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id and role='ngo') then raise exception 'NGO profile not found'; end if;
  update public.profiles set verified=p_approved,updated_at=now() where id=p_profile_id;
  update public.ngo_details set verified_at=case when p_approved then now() else null end,review_status=case when p_approved then 'approved' else 'declined' end where profile_id=p_profile_id;
end $$;
grant execute on function public.admin_verify_ngo(uuid,boolean) to authenticated;

create function public.admin_update_report(p_report_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('reviewed','resolved') then raise exception 'Unsupported report status'; end if;
  update public.platform_reports set status=p_status,resolved_by=(select auth.uid()),updated_at=now() where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
end $$;
grant execute on function public.admin_update_report(uuid,text) to authenticated;

create function public.admin_set_user_active(p_profile_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_profile_id=(select auth.uid()) then raise exception 'Administrators cannot suspend their own account'; end if;
  update public.profiles set is_active=p_active,updated_at=now() where id=p_profile_id;
  if not found then raise exception 'User not found'; end if;
end $$;
grant execute on function public.admin_set_user_active(uuid,boolean) to authenticated;

create function public.get_impact_summary() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'food_kg',coalesce((select sum(quantity) from public.food_listings where status='collected' and lower(unit)='kg'),0),
   'meals',coalesce((select sum(quantity) from public.food_listings where status='collected' and lower(unit) in ('meal','meals','portion','portions')),0),
   'completed',coalesce((select count(*) from public.food_listings where status='collected'),0),
   'ngos',coalesce((select count(*) from public.profiles where role='ngo' and verified),0),
   'members',coalesce((select count(*) from public.profiles),0)
 )
$$;
grant execute on function public.get_impact_summary() to anon, authenticated;

create function public.get_ngo_matching_profiles()
returns table(id uuid,name text,location text,food_requirements text[],max_quantity numeric,latitude double precision,longitude double precision,acceptance_rate numeric,history_count bigint)
language sql stable security definer set search_path = '' as $$
 select p.id,p.name,p.location,n.food_requirements,n.max_quantity,n.latitude,n.longitude,
   coalesce((count(r.id) filter (where r.status in ('approved','collected')))::numeric /
     nullif(count(r.id) filter (where r.status in ('approved','rejected','collected')),0),.5) as acceptance_rate,
   count(r.id) filter (where r.status in ('approved','rejected','collected')) as history_count
 from public.profiles p join public.ngo_details n on n.profile_id=p.id
 left join public.donation_requests r on r.ngo_id=p.id
 where p.role='ngo' and p.verified and n.review_status='approved'
 group by p.id,p.name,p.location,n.food_requirements,n.max_quantity
$$;
grant execute on function public.get_ngo_matching_profiles() to anon, authenticated;

-- To approve an NGO, an administrator reviews its registration and then runs:
-- update public.profiles set verified=true where id='NGO_PROFILE_UUID';
-- update public.ngo_details set verified_at=now() where profile_id='NGO_PROFILE_UUID';
