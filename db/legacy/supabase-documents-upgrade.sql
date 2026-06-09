-- Documents table upgrades
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS tags TEXT[];

CREATE INDEX IF NOT EXISTS idx_docs_client ON contact_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_docs_project ON contact_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_user_cat ON contact_documents(user_id, document_category);
