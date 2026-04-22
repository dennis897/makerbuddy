import '../mv-styles.css';
import { useState, useEffect, useCallback } from 'react';
import {
  getFiles, getTags, deleteFile, getProjects, createProject, deleteProject,
  type MvFile, type MvTag, type MvProject,
} from '../api/mvApi';
import { MvFileGrid } from '../mv/MvFileGrid';
import { MvFileViewer } from '../mv/MvFileViewer';
import { MvFileUpload } from '../mv/MvFileUpload';
import { MvTagManager } from '../mv/MvTagManager';
import { MACHINE_TYPES, machineIcon, isTextIcon } from '../mv/machineTypes';

// ── Project modal ─────────────────────────────────────────────────────────────

function ProjectModal({ projects, onSave, onClose, existing }: {
  projects: MvProject[]; existing: MvProject | null;
  onSave: (d: { name: string; machine_type: string; parent_id: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const parents = projects.filter((p) => !p.parent_id);
  const [name, setName] = useState(existing?.name || '');
  const [machineType, setMachineType] = useState(existing?.machine_type || '3dprint');
  const [parentId, setParentId] = useState(existing?.parent_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true); setError('');
    try { await onSave({ name: name.trim(), machine_type: machineType, parent_id: parentId || null }); onClose(); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existing ? 'Edit Project' : 'New Project'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label>Project Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Printer Upgrades" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
          </div>
          <div className="form-group">
            <label>Machine Type</label>
            <div className="machine-type-selector">
              {MACHINE_TYPES.map((m) => (
                <button key={m.value} type="button" className={`machine-type-btn ${machineType === m.value ? 'active' : ''}`} onClick={() => setMachineType(m.value)}>
                  {!isTextIcon(m.icon) && <span>{m.icon}</span>}
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {!existing && (
            <div className="form-group">
              <label>Parent Project (optional)</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— None (top-level) —</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{machineIcon(p.machine_type)} {p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ projects, activeProject, onSelect, onNewProject, onRename, onDelete }: {
  projects: MvProject[]; activeProject: string | null;
  onSelect: (id: string | null) => void; onNewProject: () => void;
  onRename: (p: MvProject) => void; onDelete: (p: MvProject) => void;
}) {
  const parents = projects.filter((p) => !p.parent_id);
  const childrenOf = (id: string) => projects.filter((p) => p.parent_id === id);

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <button className={`sidebar-item ${activeProject === null ? 'active' : ''}`} onClick={() => onSelect(null)}>All Files</button>
        <button className={`sidebar-item ${activeProject === 'none' ? 'active' : ''}`} onClick={() => onSelect('none')}>Uncategorized</button>
      </div>
      {MACHINE_TYPES.map((mt) => {
        const group = parents.filter((p) => p.machine_type === mt.value);
        if (!group.length) return null;
        return (
          <div key={mt.value}>
            <div className="sidebar-divider" />
            <div className="sidebar-label">{mt.label}</div>
            <div className="sidebar-section">
              {group.map((p) => (
                <div key={p.id}>
                  <div className="sidebar-project-row">
                    <button className={`sidebar-item sidebar-project-btn ${activeProject === p.id ? 'active' : ''}`} onClick={() => onSelect(p.id)}>
                      <span className="sidebar-project-icon">{isTextIcon(machineIcon(p.machine_type)) ? <span className="machine-icon-text">{machineIcon(p.machine_type)}</span> : machineIcon(p.machine_type)}</span>
                      {p.name}
                    </button>
                    <div className="sidebar-project-actions">
                      <button className="sidebar-action-btn" title="Rename" onClick={() => onRename(p)}>✏️</button>
                      <button className="sidebar-action-btn" title="Delete" onClick={() => onDelete(p)}>🗑️</button>
                    </div>
                  </div>
                  {childrenOf(p.id).map((c) => (
                    <div key={c.id} className="sidebar-project-row">
                      <button className={`sidebar-item sidebar-project-btn sidebar-child ${activeProject === c.id ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
                        <span className="sidebar-project-icon">📂</span>{c.name}
                      </button>
                      <div className="sidebar-project-actions">
                        <button className="sidebar-action-btn" title="Rename" onClick={() => onRename(c)}>✏️</button>
                        <button className="sidebar-action-btn" title="Delete" onClick={() => onDelete(c)}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="sidebar-footer">
        <div className="sidebar-divider" />
        <button className="btn btn-sm btn-full" onClick={onNewProject} style={{ marginBottom: 8 }}>+ New Project</button>
      </div>
    </aside>
  );
}

// ── Projects overview grid ────────────────────────────────────────────────────

function ProjectsOverview({ projects, files, onSelect }: { projects: MvProject[]; files: MvFile[]; onSelect: (id: string) => void }) {
  const parents = projects.filter((p) => !p.parent_id);
  const totalCount = (p: MvProject) => (p.file_count || 0) + projects.filter((c) => c.parent_id === p.id).reduce((s, c) => s + (c.file_count || 0), 0);
  const uncategorizedCount = files.filter((f) => !f.project_id).length;

  const projectCard = (p: MvProject) => {
    const count = totalCount(p);
    return (
      <div key={p.id} className="project-card" onClick={() => onSelect(p.id)}>
        <span className="project-card-icon">{isTextIcon(machineIcon(p.machine_type)) ? <span className="machine-icon-text">{machineIcon(p.machine_type)}</span> : machineIcon(p.machine_type)}</span>
        <div>
          <div className="project-card-name">{p.name}</div>
          <div className="project-card-meta">{count} file{count !== 1 ? 's' : ''}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="projects-overview">
      {MACHINE_TYPES.map((mt) => {
        const group = parents.filter((p) => p.machine_type === mt.value);
        if (!group.length) return null;
        return <div key={mt.value} style={{ marginBottom: 28 }}><div className="section-label">{mt.label}</div><div className="project-grid">{group.map(projectCard)}</div></div>;
      })}
      {uncategorizedCount > 0 && (
        <div>
          <div className="section-label">Uncategorized</div>
          <div className="project-grid">
            <div className="project-card" onClick={() => onSelect('none')}>
              <span className="project-card-icon">📂</span>
              <div><div className="project-card-name">Uncategorized</div><div className="project-card-meta">{uncategorizedCount} file{uncategorizedCount !== 1 ? 's' : ''}</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function MakerVaultFilesPage() {
  const [files, setFiles] = useState<MvFile[]>([]);
  const [tags, setTags] = useState<MvTag[]>([]);
  const [projects, setProjects] = useState<MvProject[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<MvFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [projectModal, setProjectModal] = useState<'new' | MvProject | null>(null);

  const loadFiles = useCallback(async () => {
    const params: Record<string, string> = {};
    if (activeTag) params.tag = activeTag;
    if (search) params.search = search;
    if (activeProject !== null) params.project = activeProject;
    setFiles(await getFiles(params));
  }, [activeTag, search, activeProject]);

  const loadTags = useCallback(async () => setTags(await getTags()), []);
  const loadProjects = useCallback(async () => setProjects(await getProjects()), []);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await deleteFile(id);
    setSelectedFile(null);
    loadFiles();
  };

  const handleNewProject = async (data: { name: string; machine_type: string; parent_id: string | null }) => {
    await createProject(data);
    await loadProjects();
  };

  const handleDeleteProject = async (project: MvProject) => {
    if (!confirm(`Delete project "${project.name}"? Files inside will become uncategorized.`)) return;
    await deleteProject(project.id);
    if (activeProject === project.id) setActiveProject(null);
    await loadProjects();
    loadFiles();
  };

  const activeProjectLabel = () => {
    if (activeProject === null) return 'All Files';
    if (activeProject === 'none') return 'Uncategorized';
    return projects.find((p) => p.id === activeProject)?.name || 'Project';
  };

  return (
    <div className="dashboard">
      <Sidebar
        projects={projects}
        activeProject={activeProject}
        onSelect={setActiveProject}
        onNewProject={() => setProjectModal('new')}
        onRename={(p) => setProjectModal(p)}
        onDelete={handleDeleteProject}
      />

      <div className="main-content">
        <div className="toolbar">
          <div className="toolbar-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>{activeProjectLabel()}</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search files…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="tag-filters">
              <button className={`tag-chip ${!activeTag ? 'active' : ''}`} onClick={() => setActiveTag(null)}>All Tags</button>
              {tags.map((t) => (
                <button key={t.id} className={`tag-chip ${activeTag === t.name ? 'active' : ''}`} style={{ '--tag-color': t.color } as React.CSSProperties} onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}>{t.name}</button>
              ))}
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-sm" onClick={() => setShowTags(true)}>Manage Tags</button>
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>Upload File</button>
          </div>
        </div>

        {activeProject === null && !search && !activeTag && projects.length > 0
          ? <ProjectsOverview projects={projects} files={files} onSelect={setActiveProject} />
          : <MvFileGrid files={files} onSelect={setSelectedFile} />}
      </div>

      {selectedFile && (
        <MvFileViewer file={selectedFile} tags={tags} projects={projects} onClose={() => setSelectedFile(null)} onDelete={handleDelete} onUpdate={() => { loadFiles(); setSelectedFile(null); }} />
      )}
      {showUpload && (
        <MvFileUpload tags={tags} projects={projects} defaultProjectId={activeProject !== null && activeProject !== 'none' ? activeProject : ''} onClose={() => setShowUpload(false)} onUploaded={() => { setShowUpload(false); loadFiles(); }} onProjectCreated={loadProjects} />
      )}
      {showTags && <MvTagManager tags={tags} onClose={() => setShowTags(false)} onUpdate={loadTags} />}
      {projectModal && (
        <ProjectModal
          projects={projects}
          existing={projectModal === 'new' ? null : projectModal}
          onSave={projectModal === 'new' ? handleNewProject : async (data) => { if (typeof projectModal !== 'string') { await deleteProject(projectModal.id); await createProject(data); await loadProjects(); } }}
          onClose={() => setProjectModal(null)}
        />
      )}
    </div>
  );
}
