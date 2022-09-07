CREATE TABLE sharing_permission (
	id serial PRIMARY KEY,
	share_type share_type_enum not null DEFAULT 'RESTRICTED'
);
-- by making the link a seperate table, the link can be checked if its unique in edit and view access_type
CREATE TABLE sharing_permission_link (
	id serial PRIMARY KEY,
	sharing_permission_id int,
	access_type access_type_enum not null,
	link varchar(50) not null unique, 
	CONSTRAINT sharing_permission_link_fk_sharing_permission
		FOREIGN KEY(sharing_permission_id) 
		REFERENCES sharing_permission(id) ON DELETE CASCADE
);
CREATE TABLE sharing_permission_link_user (
	id serial PRIMARY KEY,
	sharing_permission_link_id int,
	user_id varchar(50) not null,
	CONSTRAINT sharing_permission_link_user_fk_sharing_permission_link
		FOREIGN KEY(sharing_permission_link_id) 
		REFERENCES sharing_permission_link(id) ON DELETE CASCADE
);
CREATE TABLE meta (
	id serial PRIMARY KEY,
	user_id varchar(50) not null,
	created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	sharing_permission_id int unique, -- unique here makes it a one to one relationship
	CONSTRAINT meta_fk_sharing_permission
		FOREIGN KEY(sharing_permission_id) 
		REFERENCES sharing_permission(id) ON DELETE CASCADE
);

CREATE TABLE folder (
	id serial PRIMARY KEY,
	folder_name varchar(50) not null,
	meta_id int unique,
	parent_folder_id int,
	CONSTRAINT folder_fk_meta
		FOREIGN KEY(meta_id) 
		REFERENCES meta(id) ON DELETE CASCADE,
	CONSTRAINT folder_fk_folder
		FOREIGN KEY(parent_folder_id) 
		REFERENCES folder(id) ON DELETE CASCADE
);

CREATE TABLE file (
	id serial PRIMARY KEY,
	file_name varchar(50) not null,
	stored_file_name varchar(50) not null,
	size int not null,
	meta_id int unique,
	folder_id int,
	CONSTRAINT file_fk_meta
		FOREIGN KEY(meta_id) 
		REFERENCES meta(id) ON DELETE CASCADE,
	CONSTRAINT file_fk_folder
		FOREIGN KEY(folder_id) 
		REFERENCES folder(id) ON DELETE CASCADE
);
