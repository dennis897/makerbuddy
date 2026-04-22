import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile, importFromUrl, createProject, type MvTag, type MvProject } from '../api/mvApi';
import { MACHINE_TYPES, machineIcon, isTextIcon } from './machineTypes';

const ALLOWED_EXTS = new Set(['stl', '3mf', 'obj', 'step', 'stp', 'gcode', 'scad', 'svg', 'crv']);

function TagSelector({ tags, selected, onToggle }: { tags: MvTag[]; selected: string[]; onToggle: (id: string) => void }) {
  if (!tags.length) return null;
  return (
    <div className="form-group">
      <label>Tags</label>
      <div className="tag-selector">
        {tags.map((t) => (
          <button
            key={t.id}
            className={`tag-chip ${selected.includes(t.id) ? 'selected' : ''}`}
            style={{ '--tag-color': t.color } as React.CSSProperties}
            onClick={() => onToggle(t.id)}
            type="button"
          >{t.name}</button>
        ))}
      </div>
    </div>
  );
}

function ProjectSelect({
  projects, value, onChange, onProjectCreated,
}: {
  projects: MvProject[]; value: string; onChange: (v: string) => void; onProjectCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMachineType, setNewMachineType] = useState('3dprint');
  const [newParentId, setNewParentId] = useState('');
  const [saving, setSaving] = useState(false);

  const parents = projects.filter((p) => !p.parent_id);
  const childrenOf = (id: string) => projects.filter((p) => p.parent_id === id);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const p = await createProject({ name: newName.trim(), machine_type: newMachineType, parent_id: newParentId || null });
      await onProjectCreated();
      onChange(p.id);
      setCreating(false); setNewName(''); setNewMachineType('3dprint'); setNewParentId('');
    } finally { setSaving(false); }
  };

  return (
    <div className="form-group">
      <label>Project (optional)</label>
      {!creating ? (
        <select value={value} onChange={(e) => { if (e.target.value === '__create__') setCreating(true); else onChange(e.target.value); }}>
          <option value="">— Uncategorized —</option>
          {parents.map((p) => [
            <option key={p.id} value={p.id}>{machineIcon(p.machine_type)} {p.name}</option>,
            ...childrenOf(p.id).map((c) => <option key={c.id} value={c.id}>&nbsp;&nbsp;↳ {c.name}</option>),
          ])}
          <option value="__create__">＋ Create new project…</option>
        </select>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          <div className="machine-type-selector">
            {MACHINE_TYPES.map((m) => (
              <button key={m.value} type="button" className={`machine-type-btn ${newMachineType === m.value ? 'active' : ''}`} onClick={() => setNewMachineType(m.value)}>
                {!isTextIcon(m.icon) && <span>{m.icon}</span>}
                {m.label}
              </button>
            ))}
          </div>
          <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
            <option value="">— No parent —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{machineIcon(p.machine_type)} {p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim() || saving}>{saving ? 'Creating…' : 'Create'}</button>
            <button className="btn btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadTab({ tags, projects, defaultProjectId, onUploaded, onClose, onProjectCreated }: {
  tags: MvTag[]; projects: MvProject[]; defaultProjectId: string;
  onUploaded: () => void; onClose: () => void; onProjectCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => { if (accepted.length > 0) setFile(accepted[0]); }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: {
      'model/stl': ['.stl'], 'model/3mf': ['.3mf'], 'model/obj': ['.obj'],
      'application/step': ['.step', '.stp'], 'text/x.gcode': ['.gcode'],
      'application/x-openscad': ['.scad'], 'image/svg+xml': ['.svg'], 'application/x-vcarve': ['.crv'],
    },
  });

  const toggleTag = (id: string) => setSelectedTags((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError('');
    try { await uploadFile(file, description, selectedTags, projectId); onUploaded(); }
    catch (err) { setError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <>
      <div className="modal-body">
        {error && <div className="error-msg">{error}</div>}
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {file ? <p><strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
            : <p>Drag & drop a file here, or click to browse<br /><small>Supports: STL, 3MF, OBJ, STEP, GCODE, SCAD, SVG, CRV</small></p>}
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this file for?" />
        </div>
        <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} onProjectCreated={onProjectCreated} />
        <TagSelector tags={tags} selected={selectedTags} onToggle={toggleTag} />
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
      </div>
    </>
  );
}

function ImportUrlTab({ tags, projects, defaultProjectId, onUploaded, onClose, onProjectCreated }: {
  tags: MvTag[]; projects: MvProject[]; defaultProjectId: string;
  onUploaded: () => void; onClose: () => void; onProjectCreated: () => void;
}) {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (id: string) => setSelectedTags((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);

  const handleImport = async () => {
    if (!url.trim()) return;
    setImporting(true); setError('');
    try { await importFromUrl(url.trim(), description, selectedTags, projectId); onUploaded(); }
    catch (err) { setError((err as Error).message); }
    finally { setImporting(false); }
  };

  return (
    <>
      <div className="modal-body">
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>File URL</label>
          <input type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/model.stl" onKeyDown={(e) => e.key === 'Enter' && handleImport()} />
          <p className="muted" style={{ marginTop: '6px' }}>Paste a direct link to an STL, 3MF, OBJ, STEP, GCODE, SCAD, SVG, or CRV file.</p>
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this file for?" />
        </div>
        <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} onProjectCreated={onProjectCreated} />
        <TagSelector tags={tags} selected={selectedTags} onToggle={toggleTag} />
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleImport} disabled={!url.trim() || importing}>{importing ? 'Importing…' : 'Import'}</button>
      </div>
    </>
  );
}

function BulkImportTab({ projects, defaultProjectId, onUploaded, onClose, onProjectCreated }: {
  projects: MvProject[]; defaultProjectId: string;
  onUploaded: () => void; onClose: () => void; onProjectCreated: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (inputRef.current) inputRef.current.setAttribute('webkitdirectory', ''); }, []);

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files || []);
    const supported = all.filter((f) => { const ext = f.name.split('.').pop()?.toLowerCase(); return ext && ALLOWED_EXTS.has(ext); });
    setFiles(supported); setDone(0); setFailed(new Set()); setFinished(false);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true); setDone(0);
    const failedNames = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      try { await uploadFile(files[i], '', [], projectId); }
      catch { failedNames.add(files[i].name); setFailed(new Set(failedNames)); }
      setDone(i + 1);
    }
    setUploading(false); setFinished(true);
  };

  const pct = files.length ? Math.round((done / files.length) * 100) : 0;
  const succeeded = done - failed.size;

  return (
    <>
      <div className="modal-body">
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFolderChange} />
        <div className="form-group">
          <button className="btn btn-full" onClick={() => inputRef.current?.click()} type="button" disabled={uploading}>📁 Browse Folder…</button>
          {files.length > 0 && <p className="muted" style={{ marginTop: 8 }}>{files.length} supported file{files.length !== 1 ? 's' : ''} ready to upload</p>}
        </div>
        {files.length > 0 && (
          <div className="bulk-file-list">
            {files.map((f, i) => (
              <div key={i} className="bulk-file-item">
                <span className="bulk-file-name" title={f.name}>{f.name}</span>
                {(uploading || finished) && i < done && <span style={{ color: failed.has(f.name) ? '#ef4444' : '#22c55e', flexShrink: 0 }}>{failed.has(f.name) ? '✗' : '✓'}</span>}
              </div>
            ))}
          </div>
        )}
        {(uploading || finished) && (
          <div className="form-group">
            <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
            <p className="muted" style={{ marginTop: 6, textAlign: 'center' }}>
              {finished ? `Done — ${succeeded} of ${files.length} uploaded${failed.size ? `, ${failed.size} failed` : ''}` : `Uploading… ${done} of ${files.length}`}
            </p>
          </div>
        )}
        <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} onProjectCreated={onProjectCreated} />
      </div>
      <div className="modal-footer">
        {!finished ? (
          <>
            <button className="btn" onClick={onClose} disabled={uploading}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={!files.length || uploading}>
              {uploading ? `Uploading… (${done}/${files.length})` : `Upload ${files.length || ''} File${files.length !== 1 ? 's' : ''}`}
            </button>
          </>
        ) : <button className="btn btn-primary" onClick={onUploaded}>Done</button>}
      </div>
    </>
  );
}

interface Props {
  tags: MvTag[];
  projects: MvProject[];
  defaultProjectId: string;
  onClose: () => void;
  onUploaded: () => void;
  onProjectCreated: () => void;
}

export function MvFileUpload({ tags, projects, defaultProjectId, onClose, onUploaded, onProjectCreated }: Props) {
  const [tab, setTab] = useState<'upload' | 'url' | 'bulk'>('upload');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add File</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')} type="button">Upload File</button>
          <button className={`modal-tab ${tab === 'url' ? 'active' : ''}`} onClick={() => setTab('url')} type="button">Import from URL</button>
          <button className={`modal-tab ${tab === 'bulk' ? 'active' : ''}`} onClick={() => setTab('bulk')} type="button">Import Folder</button>
        </div>
        {tab === 'upload' ? <UploadTab tags={tags} projects={projects} defaultProjectId={defaultProjectId} onUploaded={onUploaded} onClose={onClose} onProjectCreated={onProjectCreated} />
          : tab === 'url' ? <ImportUrlTab tags={tags} projects={projects} defaultProjectId={defaultProjectId} onUploaded={onUploaded} onClose={onClose} onProjectCreated={onProjectCreated} />
            : <BulkImportTab projects={projects} defaultProjectId={defaultProjectId} onUploaded={onUploaded} onClose={onClose} onProjectCreated={onProjectCreated} />}
      </div>
    </div>
  );
}
