-- Vidéos de la page d'accueil et de la galerie (fichier envoyé dans R2, ou adresse https://).
CREATE TABLE videos (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT);
