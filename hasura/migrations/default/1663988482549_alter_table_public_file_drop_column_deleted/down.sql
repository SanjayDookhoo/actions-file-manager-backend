alter table "public"."file" alter column "deleted" set default false;
alter table "public"."file" alter column "deleted" drop not null;
alter table "public"."file" add column "deleted" bool;
