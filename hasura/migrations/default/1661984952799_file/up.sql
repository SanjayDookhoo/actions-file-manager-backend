CREATE TABLE file (
	id serial PRIMARY KEY,
	file_name varchar(50) not null,
	s3_file_name varchar(50) not null,
	size int not null
);
