-- Bind a hung artefact to a citadel door. JSON: { door, still, trans, citadel, hall }
alter table artifacts add column if not exists room text;
