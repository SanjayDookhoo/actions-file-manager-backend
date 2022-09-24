CREATE OR REPLACE FUNCTION updateMetaModified()
  RETURNS TRIGGER 
  LANGUAGE PLPGSQL
  AS
$$
BEGIN
	UPDATE meta set modified = now() where id = OLD.meta_id;
	return NEW;
END;
$$;
