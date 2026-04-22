import { useState, useEffect } from 'react';
import { thumbnailService } from './thumbnailService';
import { getFileDownloadUrl, getFilePreviewGeometryUrl, type MvFile } from '../api/mvApi';

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const FILE_ICONS: Record<string, string> = {
  stl: '🔷', '3mf': '📦', obj: '🔶', step: '⚙️', stp: '⚙️', gcode: '🖨️', scad: '📐',
  svg: '🎨', crv: '🔩',
};

const PREVIEW_TYPES = new Set(['stl', '3mf']);

function FileThumbnail({ file }: { file: MvFile }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!PREVIEW_TYPES.has(file.file_type)) return;
    let alive = true;
    thumbnailService
      .request(file.id, file.file_type, getFileDownloadUrl(file.id), getFilePreviewGeometryUrl(file.id))
      .then((url) => { if (alive && url) setSrc(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [file.id, file.file_type]);

  return (
    <div className="card-thumb">
      {src
        ? <img src={src} className="card-thumb-img" alt="" />
        : <span className="card-thumb-icon">{FILE_ICONS[file.file_type] || '📄'}</span>
      }
    </div>
  );
}

interface Props {
  files: MvFile[];
  onSelect: (file: MvFile) => void;
}

export function MvFileGrid({ files, onSelect }: Props) {
  if (files.length === 0) {
    return (
      <div className="empty-state">
        <p>No files here yet.</p>
      </div>
    );
  }

  return (
    <div className="file-grid">
      {files.map((f) => (
        <div key={f.id} className="file-card" onClick={() => onSelect(f)}>
          <FileThumbnail file={f} />
          <div className="file-card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="file-ext">.{f.file_type}</span>
            </div>
            <h3 className="file-name" title={f.original_filename}>{f.original_filename}</h3>
            <div className="file-meta">
              <span>{formatSize(f.file_size)}</span>
              <span>{formatDate(f.uploaded_at)}</span>
            </div>
            {f.tags.length > 0 && (
              <div className="file-tags">
                {f.tags.map((t) => (
                  <span key={t.id} className="tag-badge" style={{ backgroundColor: t.color }}>{t.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
