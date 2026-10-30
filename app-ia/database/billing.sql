create table public.lv_billing_customers(
 organization_id uuid not null references public.lv_organizations(id),
 id uuid not null default gen_random_uuid(),
 name text not null check(char_length(btrim(name)) between 2 and 120),
 email text not null default '' check(char_length(email)<=254),
 phone text not null default '' check(char_length(phone)<=30),
 created_at timestamptz not null default now(),
 primary key(organization_id,id)
);
create table public.lv_billing_plans(
 organization_id uuid not null references public.lv_organizations(id),
 id uuid not null default gen_random_uuid(),
 name text not null check(char_length(btrim(name)) between 2 and 100),
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 cycle text not null check(cycle in('WEEKLY','BIWEEKLY','MONTHLY')),
 created_at timestamptz not null default now(),
 primary key(organization_id,id)
);
create table public.lv_billing_contracts(
 organization_id uuid not null references public.lv_organizations(id),
 id uuid not null default gen_random_uuid(),
 customer_id uuid not null,plan_id uuid not null,
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 cycle text not null check(cycle in('WEEKLY','BIWEEKLY','MONTHLY')),
 first_due_date date not null,
 reminder_days integer[] not null default '{-3,0,3}' check(cardinality(reminder_days)<=10 and reminder_days <@ array[-30,-15,-7,-5,-3,-2,-1,0,1,2,3,5,7,10,15,30]),
 status text not null default 'draft' check(status in('draft','paused')),
 created_at timestamptz not null default now(),
 primary key(organization_id,id),
 foreign key(organization_id,customer_id) references public.lv_billing_customers(organization_id,id),
 foreign key(organization_id,plan_id) references public.lv_billing_plans(organization_id,id)
);
create table public.lv_billing_rules(
 organization_id uuid not null references public.lv_organizations(id),
 id uuid not null default gen_random_uuid(),
 event text not null check(event in('issued','paid','overdue','negotiation')),
 target_step_id text not null check(char_length(target_step_id) between 1 and 100),
 responsible_id text not null default '' check(char_length(responsible_id)<=100),
 enabled boolean not null default false check(enabled=false),
 primary key(organization_id,id),unique(organization_id,event)
);
create table public.lv_billing_payments(
 organization_id uuid not null references public.lv_organizations(id),
 id uuid not null default gen_random_uuid(),
 contract_id uuid not null,
 provider text not null check(provider='asaas'),
 provider_payment_id text not null,
 amount_cents integer not null check(amount_cents>0),
 due_date date not null,
 status text not null check(status in('pending','overdue','confirmed','received','refunded','cancelled')),
 created_at timestamptz not null default now(),
 primary key(organization_id,id),unique(provider,provider_payment_id),
 foreign key(organization_id,contract_id) references public.lv_billing_contracts(organization_id,id)
);

alter table public.lv_billing_customers enable row level security;
revoke all on public.lv_billing_customers from anon,authenticated;
grant select on public.lv_billing_customers to authenticated;
create policy lv_billing_customers_read on public.lv_billing_customers for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));

grant insert on public.lv_billing_customers to authenticated;
create policy lv_billing_customers_insert on public.lv_billing_customers for insert to authenticated with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));

alter table public.lv_billing_plans enable row level security;
revoke all on public.lv_billing_plans from anon,authenticated;
grant select on public.lv_billing_plans to authenticated;
create policy lv_billing_plans_read on public.lv_billing_plans for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));

grant insert on public.lv_billing_plans to authenticated;
create policy lv_billing_plans_insert on public.lv_billing_plans for insert to authenticated with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));

alter table public.lv_billing_contracts enable row level security;
revoke all on public.lv_billing_contracts from anon,authenticated;
grant select on public.lv_billing_contracts to authenticated;
create policy lv_billing_contracts_read on public.lv_billing_contracts for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));

grant insert on public.lv_billing_contracts to authenticated;
create policy lv_billing_contracts_insert on public.lv_billing_contracts for insert to authenticated with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));

alter table public.lv_billing_rules enable row level security;
revoke all on public.lv_billing_rules from anon,authenticated;
grant select on public.lv_billing_rules to authenticated;
create policy lv_billing_rules_read on public.lv_billing_rules for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));

grant insert on public.lv_billing_rules to authenticated;
create policy lv_billing_rules_insert on public.lv_billing_rules for insert to authenticated with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));

alter table public.lv_billing_payments enable row level security;
revoke all on public.lv_billing_payments from anon,authenticated;
grant select on public.lv_billing_payments to authenticated;
create policy lv_billing_payments_read on public.lv_billing_payments for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));
grant update(name,email,phone) on public.lv_billing_customers to authenticated;
grant update(name,amount_cents,cycle) on public.lv_billing_plans to authenticated;
grant update(customer_id,plan_id,amount_cents,cycle,first_due_date,reminder_days,status) on public.lv_billing_contracts to authenticated;
grant update(event,target_step_id,responsible_id) on public.lv_billing_rules to authenticated;
create policy lv_billing_customers_update on public.lv_billing_customers for update to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin'))) with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
create policy lv_billing_plans_update on public.lv_billing_plans for update to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin'))) with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
create policy lv_billing_contracts_update on public.lv_billing_contracts for update to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin'))) with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
create policy lv_billing_rules_update on public.lv_billing_rules for update to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin'))) with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
