import { useState } from 'react';
import { createTag, deleteTag, type MvTag } from '../api/mvApi';

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

interface Props {
  tags: MvTag[];
  onClose: () => void;
  onUpdate: () => void;
}

export function MvTagManager({ tags, onClose, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    try {
      await createTag(name.trim(), color);
      setName('');
      onUpdate();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tag?')) return;
    await deleteTag(id);
    onUpdate();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Tags</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleCreate} className="tag-form">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New tag name..."
              className="tag-input"
            />
            <div className="color-picker">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button type="submit" className="btn btn-primary">Add Tag</button>
          </form>
          <div className="tag-list">
            {tags.map((t) => (
              <div key={t.id} className="tag-list-item">
                <span className="tag-badge" style={{ backgroundColor: t.color }}>{t.name}</span>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Remove</button>
              </div>
            ))}
            {tags.length === 0 && <p className="muted">No tags yet. Create one above.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
