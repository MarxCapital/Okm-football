-- Authentification Supabase : identifiant du compte Supabase correspondant à chaque utilisateur de l'administration.
-- Les mots de passe sont alors gérés par Supabase ; la colonne password_hash contient simplement « supabase ».
ALTER TABLE users ADD COLUMN supabase_id TEXT;
