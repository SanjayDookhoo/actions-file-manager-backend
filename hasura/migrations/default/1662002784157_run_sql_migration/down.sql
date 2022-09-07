-- ALTER TABLE sharing_permission_link DROP CONSTRAINT sharing_permission_link_fk_sharing_permission
-- ALTER TABLE sharing_permission_link_user DROP CONSTRAINT sharing_permission_link_user_fk_sharing_permission_link
-- ALTER TABLE meta DROP CONSTRAINT meta_fk_sharing_permission;
-- ALTER TABLE folder DROP CONSTRAINT folder_fk_meta;
-- ALTER TABLE folder DROP CONSTRAINT folder_fk_folder;
-- ALTER TABLE file DROP CONSTRAINT file_fk_meta;
-- ALTER TABLE file DROP CONSTRAINT file_fk_folder;
drop table meta CASCADE;
drop table sharing_permission CASCADE;
drop table sharing_permission_link CASCADE;
drop table sharing_permission_link_user CASCADE;
drop table file CASCADE;
drop table folder CASCADE;