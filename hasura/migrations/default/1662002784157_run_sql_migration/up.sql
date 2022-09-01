CREATE TABLE sharing_permission (
	id serial PRIMARY KEY,
	access_type access_type_enum not null DEFAULT 'RESTRICTED',
	viewer_shared_id varchar(50) not null,
	editor_shared_id varchar(50) not null,
	users_restricted_list varchar(250) not null DEFAULT '[]'
);
CREATE TABLE meta (
	id serial PRIMARY KEY,
	created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	path text not null
);
CREATE TABLE file (
	id serial PRIMARY KEY,
	user_id varchar(50) not null,
	file_name varchar(50) not null,
	s3_file_name varchar(50) not null,
	size int not null,
	sharing_permission_id int,
	meta_id int,
	CONSTRAINT file_fk_sharing_permission
		FOREIGN KEY(sharing_permission_id) 
		REFERENCES sharing_permission(id),
	CONSTRAINT file_fk_meta
		FOREIGN KEY(meta_id) 
		REFERENCES meta(id)
);
CREATE TABLE folder (
	id serial PRIMARY KEY,
	user_id varchar(50) not null,
	folder_name varchar(50) not null,
	sharing_permission_id int,
	meta_id int,
	CONSTRAINT file_fk_sharing_permission
		FOREIGN KEY(sharing_permission_id) 
		REFERENCES sharing_permission(id),
	CONSTRAINT file_fk_meta
		FOREIGN KEY(meta_id) 
		REFERENCES meta(id)
);
