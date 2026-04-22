import { useState, useEffect, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import {
  updateFile,
  getFileDownloadUrl,
  getFilePreviewGeometryUrl,
  getSignedUrl,
  getBambuStudioUrl,
  type MvFile,
  type MvTag,
  type MvProject,
} from '../api/mvApi';

// ── Error boundary ────────────────────────────────────────────────────────────

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorInfo: ErrorInfo | null }> {
  state = { hasError: false, errorInfo: null };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_: Error, info: ErrorInfo) { this.setState({ errorInfo: info }); }
  render() {
    if (this.state.hasError) {
      return <div className="preview-unsupported"><p>Could not render 3D preview.</p></div>;
    }
    return this.props.children;
  }
}

// ── 3D components ─────────────────────────────────────────────────────────────

function STLModel({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url) as THREE.BufferGeometry;
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const scale = 3 / maxDim;
  const lift = -box.min.y * scale;
  return (
    <mesh geometry={geometry} scale={[scale, scale, scale]} position={[0, lift, 0]}>
      <meshStandardMaterial color="#f97316" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

function STLPreview({ url }: { url: string }) {
  return (
    <div className="viewer-canvas">
      <ViewerErrorBoundary>
        <Canvas camera={{ position: [5, 5, 5] as [number, number, number], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5] as [number, number, number]} intensity={1} />
          <directionalLight position={[-5, -5, -3] as [number, number, number]} intensity={0.3} />
          <Suspense fallback={null}>
            <STLModel url={url} />
            <Environment preset="studio" />
          </Suspense>
          <OrbitControls enableDamping dampingFactor={0.1} target={[0, 1.5, 0] as [number, number, number]} />
          <gridHelper args={[10, 10, '#444', '#333']} />
        </Canvas>
      </ViewerErrorBoundary>
    </div>
  );
}

function ThreeMFPreview({ fileId }: { fileId: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setStatus('loading');
    setGeometry(null);
    setErrorMsg('');
    const url = getFilePreviewGeometryUrl(fileId);
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(`Server error ${res.status}`); return res.json(); })
      .then((data: { positions?: number[] }) => {
        if (!data.positions?.length) throw new Error('No geometry found in file');
        const positions = new Float32Array(data.positions);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
        geo.translate(-cx, -box.min.y, -cz);
        geo.computeBoundingBox();
        const sz = new THREE.Vector3(); geo.boundingBox!.getSize(sz);
        const s = 3 / Math.max(sz.x, sz.y, sz.z); geo.scale(s, s, s);
        setGeometry(geo); setStatus('ready');
      })
      .catch((err: Error) => { setErrorMsg(err.message || 'Unknown error'); setStatus('error'); });
  }, [fileId]);

  if (status === 'error') return <div className="preview-unsupported"><p>Could not load 3MF preview.</p><p style={{ fontSize: '0.75rem', color: '#888' }}>{errorMsg}</p></div>;
  if (status === 'loading') return <div className="viewer-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#888' }}>Loading 3MF preview…</p></div>;
  return (
    <div className="viewer-canvas">
      <Canvas camera={{ position: [5, 5, 5] as [number, number, number], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5] as [number, number, number]} intensity={1} />
        <directionalLight position={[-5, -5, -3] as [number, number, number]} intensity={0.3} />
        <Suspense fallback={null}>
          {geometry && <mesh geometry={geometry}><meshStandardMaterial color="#f97316" roughness={0.4} metalness={0.1} side={THREE.DoubleSide} /></mesh>}
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.1} target={[0, 1.5, 0] as [number, number, number]} />
        <gridHelper args={[10, 10, '#444', '#333']} />
      </Canvas>
    </div>
  );
}

function ModelPreview({ file }: { file: MvFile }) {
  const url = getFileDownloadUrl(file.id);
  if (file.file_type === 'stl') return <STLPreview url={url} />;
  if (file.file_type === '3mf') return <ThreeMFPreview fileId={file.id} />;
  if (file.file_type === 'svg') return <div className="viewer-canvas" style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}><img src={url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" /></div>;
  const appHint = file.file_type === 'crv' ? 'VCarve' : file.file_type === 'scad' ? 'OpenSCAD' : file.file_type === 'gcode' ? 'your printer software' : 'your CAD/CAM application';
  return <div className="preview-unsupported"><p>No preview for .{file.file_type} files.</p><p>Download and open in {appHint}.</p></div>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Main FileViewer ───────────────────────────────────────────────────────────

interface Props {
  file: MvFile;
  tags: MvTag[];
  projects: MvProject[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: () => void;
}

export function MvFileViewer({ file, tags, projects, onClose, onDelete, onUpdate }: Props) {
  const [description, setDescription] = useState(file.description || '');
  const [fileTags, setFileTags] = useState(file.tags.map((t) => t.id));
  const [projectId, setProjectId] = useState(file.project_id || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDescription(file.description || '');
    setFileTags(file.tags.map((t) => t.id));
    setProjectId(file.project_id || '');
  }, [file]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFile(file.id, { description, tag_ids: fileTags, project_id: projectId || null });
      onUpdate();
    } finally { setSaving(false); }
  };

  const toggleTag = (id: string) =>
    setFileTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const parents = projects.filter((p) => !p.parent_id);
  const childrenOf = (id: string) => projects.filter((p) => p.parent_id === id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{file.original_filename}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body viewer-body">
          <ModelPreview file={file} />
          <div className="viewer-sidebar">
            <div className="file-detail">
              <div className="detail-row"><span className="detail-label">Type</span><span>.{file.file_type}</span></div>
              <div className="detail-row"><span className="detail-label">Size</span><span>{formatSize(file.file_size)}</span></div>
              <div className="detail-row"><span className="detail-label">Uploaded</span><span>{new Date(file.uploaded_at).toLocaleString()}</span></div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="form-group">
              <label>Tags</label>
              <div className="tag-selector">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    className={`tag-chip ${fileTags.includes(t.id) ? 'selected' : ''}`}
                    style={{ '--tag-color': t.color } as React.CSSProperties}
                    onClick={() => toggleTag(t.id)}
                    type="button"
                  >{t.name}</button>
                ))}
              </div>
            </div>
            {projects.length > 0 && (
              <div className="form-group">
                <label>Project</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">— Uncategorized —</option>
                  {parents.map((p) => [
                    <option key={p.id} value={p.id}>📁 {p.name}</option>,
                    ...childrenOf(p.id).map((c) => <option key={c.id} value={c.id}>&nbsp;&nbsp;↳ {c.name}</option>),
                  ])}
                </select>
              </div>
            )}
            <div className="viewer-actions">
              <button className="btn btn-primary btn-full" onClick={async () => { const u = await getSignedUrl(file.id); window.location.href = u; }}>Open in OrcaSlicer</button>
              <button className="btn btn-primary btn-full" onClick={async () => { const u = await getBambuStudioUrl(file.id); window.location.href = u; }}>Open in Bambu Studio</button>
              <a href={getFileDownloadUrl(file.id)} className="btn btn-full" download>Download</a>
              <button className="btn btn-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              <button className="btn btn-danger btn-full" onClick={() => onDelete(file.id)}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
