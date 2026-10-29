'use client';

import { useState } from 'react';
import { useDesign } from '@/store/design';
import { buildExportZip, type ExportStep } from '@/features/export/zip';
import { downloadBlob } from '@/features/storage/json';
import { Button, Dialog, WarningItem } from '@/features/editor/ui';
import { WarningsList } from '@/features/editor/panels';
import { getWarnings } from '@/lib/quality';
import { fr } from '@/i18n/fr';

const t = fr.export;

type Status = { kind: 'ready' } | { kind: 'running'; step: ExportStep } | { kind: 'done'; filename: string } | { kind: 'error' };

const ROWS = [
  [t.previews, t.previewsHelp],
  [t.sheet, t.sheetHelp],
  [t.sources, t.sourcesHelp],
  [t.glb, t.glbHelp],
  [t.json, t.jsonHelp],
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const design = useDesign((s) => s.design)!;
  const assets = useDesign((s) => s.assets);
  const [status, setStatus] = useState<Status>({ kind: 'ready' });
  const hasWarnings = getWarnings(design, assets).length > 0;

  const run = async () => {
    setStatus({ kind: 'running', step: 'previews' });
    try {
      const { blob, filename } = await buildExportZip(design, assets, (step) => setStatus({ kind: 'running', step }));
      downloadBlob(blob, filename);
      setStatus({ kind: 'done', filename });
    } catch (e) {
      console.warn('export', e);
      setStatus({ kind: 'error' });
    }
  };

  const running = status.kind === 'running';
  const steps: ExportStep[] = ['previews', 'pdf', 'sources', 'zip'];

  return (
    <Dialog
      title={t.title}
      closeLabel={fr.common.close}
      onClose={() => !running && onClose()}
      footer={
        status.kind === 'done' ? (
          <Button variant="primary" onClick={onClose}>{fr.common.close}</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={running}>{fr.common.cancel}</Button>
            <Button variant="primary" onClick={run} disabled={running} busy={running}>
              {status.kind === 'error' ? fr.common.retry : t.download}
            </Button>
          </>
        )
      }
    >
      <ul className="divide-y divide-line">
        {ROWS.map(([a, b]) => (
          <li key={a} className="flex min-h-h-row items-center gap-s4 py-s2">
            <span aria-hidden="true" className="grid size-6 place-items-center rounded border border-line text-xs">✓</span>
            <span>
              <span className="block text-sm font-medium">{a}</span>
              <span className="block text-xs text-muted">{b}</span>
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mt-s1 mb-s2 text-xs font-semibold tracking-wide text-muted uppercase">{t.warnings}</h3>
      {hasWarnings ? <WarningsList /> : <p className="text-sm text-muted">{t.noWarnings}</p>}
      <div className="mt-s1" aria-live="polite">
        {running && (
          <div>
            <div className="h-2 overflow-hidden rounded-full border border-ink/50">
              <div className="h-full bg-ink transition-all" style={{ width: `${((steps.indexOf(status.step) + 1) / steps.length) * 100}%` }} />
            </div>
            <p className="mt-s2 text-sm">{t.generating} {t.steps[status.step]}</p>
          </div>
        )}
        {status.kind === 'done' && <p className="text-sm font-medium">{t.done} · {status.filename}</p>}
        {status.kind === 'error' && <WarningItem>{t.error}</WarningItem>}
      </div>
    </Dialog>
  );
}
