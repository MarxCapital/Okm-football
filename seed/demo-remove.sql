-- Retire les données de démonstration (identifiants commençant par demo-). Vos propres contenus ne sont pas touchés.
DELETE FROM categories WHERE id LIKE 'demo-%';
DELETE FROM teams WHERE id LIKE 'demo-%';
DELETE FROM competitions WHERE id LIKE 'demo-%';
DELETE FROM players WHERE id LIKE 'demo-%';
DELETE FROM consent_records WHERE id LIKE 'demo-%';
DELETE FROM matches WHERE id LIKE 'demo-%';
DELETE FROM trophies WHERE id LIKE 'demo-%';
DELETE FROM news WHERE id LIKE 'demo-%';
DELETE FROM albums WHERE id LIKE 'demo-%';
DELETE FROM videos WHERE id LIKE 'demo-%';
DELETE FROM partners WHERE id LIKE 'demo-%';
