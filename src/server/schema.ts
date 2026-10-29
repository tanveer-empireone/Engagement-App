/** Postgres schema for roster, records, and Drive upload sessions. No token column. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS people (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  site text NOT NULL,
  shift text NOT NULL DEFAULT 'Peak',
  active boolean NOT NULL DEFAULT true,
  avatar text
);

CREATE TABLE IF NOT EXISTS config (
  id integer PRIMARY KEY CHECK (id = 1),
  sheet_id text NOT NULL,
  drive_root_id text NOT NULL,
  clickup_team_id text NOT NULL,
  clickup_space_id text NOT NULL,
  apps_script_url text NOT NULL DEFAULT '',
  show_capture_for_admin boolean NOT NULL DEFAULT false,
  sync_health jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS uploads (
  id text PRIMARY KEY,
  officer_email text NOT NULL,
  drive_file_id text,
  drive_folder_id text,
  media_status text NOT NULL CHECK (media_status IN ('pending', 'stored', 'unrecoverable')),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS uploads_officer_idx ON uploads (officer_email);

CREATE TABLE IF NOT EXISTS directions (
  feedback_id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  report_id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_uploads (
  id text PRIMARY KEY,
  officer_email text NOT NULL,
  folder_id text NOT NULL,
  folder_path text NOT NULL,
  file_name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
