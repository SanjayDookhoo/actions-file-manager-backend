SET check_function_bodies = false;
CREATE TYPE public.access_type_enum AS ENUM (
    'VIEW',
    'EDIT'
);
CREATE TYPE public.share_type_enum AS ENUM (
    'RESTRICTED',
    'ANYONE'
);
CREATE FUNCTION public.updatemetamodified() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	UPDATE meta set modified = now() where folder_id = OLD.id;
	return NEW;
END;
$$;
CREATE TABLE public.file (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    stored_name character varying(50) NOT NULL,
    size bigint NOT NULL,
    folder_id integer,
    deleted_in_root_user_folder_id character varying(50),
    mime_type character varying(255) NOT NULL
);
CREATE SEQUENCE public.file_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.file_id_seq OWNED BY public.file.id;
CREATE TABLE public.folder (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    folder_id integer,
    deleted_in_root_user_folder_id character varying(50),
    size bigint DEFAULT 0,
    trash_size bigint
);
CREATE SEQUENCE public.folder_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.folder_id_seq OWNED BY public.folder.id;
CREATE TABLE public.meta (
    id integer NOT NULL,
    user_id character varying(50) NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL,
    modified timestamp with time zone DEFAULT now() NOT NULL,
    last_accessed timestamp with time zone DEFAULT now() NOT NULL,
    folder_id integer,
    file_id integer
);
CREATE SEQUENCE public.meta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.meta_id_seq OWNED BY public.meta.id;
CREATE TABLE public.shared_with_me (
    id integer NOT NULL,
    user_id character varying(50) NOT NULL,
    collection text DEFAULT '[]'::text
);
CREATE SEQUENCE public.shared_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.shared_id_seq OWNED BY public.shared_with_me.id;
CREATE TABLE public.sharing_permission (
    id integer NOT NULL,
    share_type public.share_type_enum DEFAULT 'ANYONE'::public.share_type_enum NOT NULL,
    meta_id integer
);
CREATE SEQUENCE public.sharing_permission_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sharing_permission_id_seq OWNED BY public.sharing_permission.id;
CREATE TABLE public.sharing_permission_link (
    id integer NOT NULL,
    sharing_permission_id integer,
    access_type public.access_type_enum NOT NULL,
    link character varying(50) NOT NULL
);
CREATE SEQUENCE public.sharing_permission_link_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sharing_permission_link_id_seq OWNED BY public.sharing_permission_link.id;
CREATE TABLE public.sharing_permission_link_user (
    id integer NOT NULL,
    sharing_permission_link_id integer,
    user_id character varying(50) NOT NULL
);
CREATE SEQUENCE public.sharing_permission_link_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.sharing_permission_link_user_id_seq OWNED BY public.sharing_permission_link_user.id;
ALTER TABLE ONLY public.file ALTER COLUMN id SET DEFAULT nextval('public.file_id_seq'::regclass);
ALTER TABLE ONLY public.folder ALTER COLUMN id SET DEFAULT nextval('public.folder_id_seq'::regclass);
ALTER TABLE ONLY public.meta ALTER COLUMN id SET DEFAULT nextval('public.meta_id_seq'::regclass);
ALTER TABLE ONLY public.shared_with_me ALTER COLUMN id SET DEFAULT nextval('public.shared_id_seq'::regclass);
ALTER TABLE ONLY public.sharing_permission ALTER COLUMN id SET DEFAULT nextval('public.sharing_permission_id_seq'::regclass);
ALTER TABLE ONLY public.sharing_permission_link ALTER COLUMN id SET DEFAULT nextval('public.sharing_permission_link_id_seq'::regclass);
ALTER TABLE ONLY public.sharing_permission_link_user ALTER COLUMN id SET DEFAULT nextval('public.sharing_permission_link_user_id_seq'::regclass);
ALTER TABLE ONLY public.file
    ADD CONSTRAINT file_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.folder
    ADD CONSTRAINT folder_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meta
    ADD CONSTRAINT meta_file_id_key UNIQUE (file_id);
ALTER TABLE ONLY public.meta
    ADD CONSTRAINT meta_folder_id_key UNIQUE (folder_id);
ALTER TABLE ONLY public.meta
    ADD CONSTRAINT meta_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shared_with_me
    ADD CONSTRAINT shared_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shared_with_me
    ADD CONSTRAINT shared_user_id_key UNIQUE (user_id);
ALTER TABLE ONLY public.sharing_permission_link
    ADD CONSTRAINT sharing_permission_link_link_key UNIQUE (link);
ALTER TABLE ONLY public.sharing_permission_link
    ADD CONSTRAINT sharing_permission_link_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sharing_permission_link_user
    ADD CONSTRAINT sharing_permission_link_user_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sharing_permission
    ADD CONSTRAINT sharing_permission_meta_id_key UNIQUE (meta_id);
ALTER TABLE ONLY public.sharing_permission
    ADD CONSTRAINT sharing_permission_pkey PRIMARY KEY (id);
CREATE TRIGGER updatemetamodifiedtrigger BEFORE UPDATE ON public.file FOR EACH ROW EXECUTE FUNCTION public.updatemetamodified();
CREATE TRIGGER updatemetamodifiedtrigger BEFORE UPDATE ON public.folder FOR EACH ROW EXECUTE FUNCTION public.updatemetamodified();
ALTER TABLE ONLY public.file
    ADD CONSTRAINT file_fk_folder FOREIGN KEY (folder_id) REFERENCES public.folder(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.folder
    ADD CONSTRAINT folder_fk_folder FOREIGN KEY (folder_id) REFERENCES public.folder(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meta
    ADD CONSTRAINT meta_fk_file FOREIGN KEY (file_id) REFERENCES public.file(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meta
    ADD CONSTRAINT meta_fk_folder FOREIGN KEY (folder_id) REFERENCES public.folder(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sharing_permission_link
    ADD CONSTRAINT sharing_permission_link_fk_sharing_permission FOREIGN KEY (sharing_permission_id) REFERENCES public.sharing_permission(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sharing_permission_link_user
    ADD CONSTRAINT sharing_permission_link_user_fk_sharing_permission_link FOREIGN KEY (sharing_permission_link_id) REFERENCES public.sharing_permission_link(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sharing_permission
    ADD CONSTRAINT sharing_permission_meta FOREIGN KEY (meta_id) REFERENCES public.meta(id) ON DELETE CASCADE;
