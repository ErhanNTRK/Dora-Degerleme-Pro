import { useRef } from 'react';
import { TrashIcon } from './icons';

interface Props {
  label: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  aspectHint?: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageUploadField({ label, value, onChange, aspectHint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onChange(dataUrl);
  }

  return (
    <div className="field">
      <label className="field__label">{label}</label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={value} alt={label} style={{ maxWidth: 100, maxHeight: 60, borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', objectFit: 'contain' }} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current?.click()}>
            Değiştir
          </button>
          <button type="button" className="remove-btn" onClick={() => onChange(undefined)}>
            <TrashIcon width={15} height={15} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current?.click()}>
          Görsel Yükle
        </button>
      )}
      {aspectHint && <span className="field__hint">{aspectHint}</span>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={handleFile} />
    </div>
  );
}
