CREATE TABLE shared (
	id serial PRIMARY KEY,
	user_id varchar(50) not null,
	sharing_id_list text default '[]'
);
