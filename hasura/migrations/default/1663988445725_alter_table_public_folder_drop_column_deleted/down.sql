alter table "public"."folder" alter column "deleted" set default false;
alter table "public"."folder" alter column "deleted" drop not null;
alter table "public"."folder" add column "deleted" bool;
