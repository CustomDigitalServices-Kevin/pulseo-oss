'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OrgLogo,
  type LogoBackground,
  type LogoShape,
  dbSizeToInternal,
} from './org-logo';

const BG_OPTIONS: Array<{ value: LogoBackground; label: string }> = [
  { value: 'auto', label: 'Détection automatique' },
  { value: 'light', label: 'Fond clair' },
  { value: 'dark', label: 'Fond sombre' },
  { value: 'transparent', label: 'Transparent' },
];

const SHAPE_OPTIONS: Array<{ value: LogoShape; label: string }> = [
  { value: 'square', label: 'Carré' },
  { value: 'rect', label: 'Rectangle (3:1)' },
];

type DbLogoSize = 'sm' | 'md' | 'lg';

const SIZE_OPTIONS: Array<{ value: DbLogoSize; label: string }> = [
  { value: 'sm', label: 'Petit' },
  { value: 'md', label: 'Moyen' },
  { value: 'lg', label: 'Grand' },
];

export interface LogoUploaderProps {
  organizationId: string;
  initialLogoUrl: string | null;
  initialLogoBackground: LogoBackground;
  initialLogoShape: LogoShape;
  initialLogoSize: DbLogoSize;
  organizationName: string;
  /** Couleur primaire de l'org pour le placeholder lettre. */
  fallbackColor?: string | null;
}

export function LogoUploader({
  organizationId,
  initialLogoUrl,
  initialLogoBackground,
  initialLogoShape,
  initialLogoSize,
  organizationName,
  fallbackColor,
}: LogoUploaderProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [background, setBackground] = useState<LogoBackground>(initialLogoBackground);
  const [shape, setShape] = useState<LogoShape>(initialLogoShape);
  const [size, setSize] = useState<DbLogoSize>(initialLogoSize);
  const [busy, setBusy] = useState<'upload' | 'meta' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLogoUrl(initialLogoUrl);
    setBackground(initialLogoBackground);
    setShape(initialLogoShape);
    setSize(initialLogoSize);
  }, [initialLogoUrl, initialLogoBackground, initialLogoShape, initialLogoSize]);

  const onPickFile = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        logo_url?: string;
        logo_background?: LogoBackground;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Erreur lors de l'upload");
        return;
      }
      setLogoUrl(data.logo_url ?? null);
      if (data.logo_background) setBackground(data.logo_background);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload");
    } finally {
      setBusy(null);
    }
  };

  const patchMeta = async (
    payload: Partial<{ logo_background: LogoBackground; logo_shape: LogoShape; logo_size: DbLogoSize }>,
  ) => {
    setBusy('meta');
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Erreur enregistrement');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  };

  const onChangeBackground = (next: LogoBackground) => {
    setBackground(next);
    void patchMeta({ logo_background: next });
  };

  const onChangeShape = (next: LogoShape) => {
    setShape(next);
    void patchMeta({ logo_shape: next });
  };

  const onChangeSize = (next: DbLogoSize) => {
    setSize(next);
    void patchMeta({ logo_size: next });
  };

  const onDelete = async () => {
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Erreur lors de la suppression');
        return;
      }
      setLogoUrl(null);
      setBackground('auto');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <OrgLogo
          name={organizationName}
          logoUrl={logoUrl}
          background={background}
          shape={shape}
          size={dbSizeToInternal(size)}
          fallbackColor={fallbackColor}
        />
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onFileChange}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={onPickFile}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === 'upload' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
            {logoUrl ? 'Remplacer le logo' : 'Téléverser un logo'}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={busy !== null}
              className="gap-2"
            >
              {busy === 'delete' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Retirer le logo
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[820px]">
        <div className="space-y-1.5">
          <Label htmlFor="logo-bg">Fond d&apos;affichage</Label>
          <Select
            value={background}
            onValueChange={(v) => onChangeBackground(v as LogoBackground)}
            disabled={busy !== null || !logoUrl}
          >
            <SelectTrigger id="logo-bg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BG_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="logo-shape">Forme</Label>
          <Select
            value={shape}
            onValueChange={(v) => onChangeShape(v as LogoShape)}
            disabled={busy !== null}
          >
            <SelectTrigger id="logo-shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHAPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="logo-size">Taille</Label>
          <Select
            value={size}
            onValueChange={(v) => onChangeSize(v as DbLogoSize)}
            disabled={busy !== null}
          >
            <SelectTrigger id="logo-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[13px] text-foreground-muted max-w-[820px]">
        Formats acceptés : PNG, JPEG, WebP, SVG (max 2 Mo). Le mode automatique
        du fond détecte la teinte pour les bitmaps ; les SVG retombent sur
        &laquo;&nbsp;Fond clair&nbsp;&raquo;, ajustez manuellement si besoin.
        La forme rectangle (3:1) convient aux logos paysage. La taille est
        appliquée sur l&apos;en-tête de l&apos;espace client.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
