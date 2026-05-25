'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganization } from '@/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Globe,
  Palette,
  Mail,
  Loader2,
  Send,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';

export function OrganizationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    color_primary: '#2563EB',
    color_secondary: '#1E40AF',
    qonto_client_email: '',
    responsible_name: '',
    responsible_email: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoBackground, setLogoBackground] = useState<'auto' | 'light' | 'dark' | 'transparent'>('auto');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (value: string) => {
    setFormData({
      ...formData,
      name: value,
      slug: generateSlug(value),
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('name', formData.name);
      form.append('slug', formData.slug);
      form.append('description', formData.description);
      form.append('color_primary', formData.color_primary);
      form.append('color_secondary', formData.color_secondary);
      form.append('qonto_client_email', formData.qonto_client_email);
      form.append('responsible_name', formData.responsible_name);
      form.append('responsible_email', formData.responsible_email);

      const result = await createOrganization(form);

      if (!result.success || !result.data) {
        setError('Erreur lors de la creation');
        return;
      }

      // Upload du logo en seconde étape : on a besoin de l'org.id retourné.
      // Si l'upload échoue, on prévient mais on ne bloque pas la redirection
      // car l'org est déjà créée et l'admin peut réessayer depuis l'édition.
      if (logoFile) {
        try {
          const fd = new FormData();
          fd.append('file', logoFile);
          const res = await fetch(
            `/api/organizations/${result.data.id}/logo`,
            { method: 'POST', body: fd },
          );
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            setError(data.error ?? 'Logo non téléversé, vous pouvez le réessayer depuis la fiche client.');
            return;
          }
          if (logoBackground !== 'auto') {
            await fetch(`/api/organizations/${result.data.id}/logo`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ logo_background: logoBackground }),
            });
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur upload logo');
          return;
        }
      }

      router.push(`/admin/clients/${result.data.slug}`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Erreur lors de la creation');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 text-destructive rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Section: Identite */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Building2 className="w-3.5 h-3.5" />
          Identite
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Nom de l&apos;organisation
          </Label>
          <Input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ex: ACME Corporation"
            className="h-11"
            required
          />
          <p className="text-[13px] text-muted-foreground">Nom commercial du client</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug" className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            Slug (URL)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/clients/</span>
            <Input
              id="slug"
              type="text"
              value={formData.slug}
              onChange={(e) =>
                setFormData({ ...formData, slug: e.target.value })
              }
              placeholder="acme-corp"
              pattern="^[a-z0-9-]+$"
              className="h-11 pl-16 font-mono text-sm"
              required
            />
          </div>
          <p className="text-[13px] text-muted-foreground">Genere automatiquement depuis le nom</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Activite, secteur, notes internes..."
            rows={3}
            className="resize-none leading-relaxed"
          />
          <p className="text-[13px] text-muted-foreground">Optionnel — notes internes sur le client</p>
        </div>
      </div>

      <Separator />

      {/* Section: Branding */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Palette className="w-3.5 h-3.5" />
          Branding
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="color_primary" className="text-sm font-medium">Couleur primaire</Label>
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl border-2 border-border cursor-pointer shrink-0 transition-shadow hover:shadow-md"
                style={{ backgroundColor: formData.color_primary }}
              >
                <input
                  type="color"
                  value={formData.color_primary}
                  onChange={(e) =>
                    setFormData({ ...formData, color_primary: e.target.value })
                  }
                  className="w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <Input
                type="text"
                value={formData.color_primary}
                onChange={(e) =>
                  setFormData({ ...formData, color_primary: e.target.value })
                }
                pattern="^#[0-9A-Fa-f]{6}$"
                className="h-11 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color_secondary" className="text-sm font-medium">Couleur secondaire</Label>
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl border-2 border-border cursor-pointer shrink-0 transition-shadow hover:shadow-md"
                style={{ backgroundColor: formData.color_secondary }}
              >
                <input
                  type="color"
                  value={formData.color_secondary}
                  onChange={(e) =>
                    setFormData({ ...formData, color_secondary: e.target.value })
                  }
                  className="w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <Input
                type="text"
                value={formData.color_secondary}
                onChange={(e) =>
                  setFormData({ ...formData, color_secondary: e.target.value })
                }
                pattern="^#[0-9A-Fa-f]{6}$"
                className="h-11 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 bg-muted/30 rounded-lg border">
          <p className="text-[13px] text-muted-foreground uppercase tracking-wider mb-3">Apercu</p>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: formData.color_primary }}
            >
              {formData.name ? formData.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div>
              <p className="font-medium text-sm">{formData.name || 'Nom du client'}</p>
              <p className="text-xs text-muted-foreground">{formData.slug || 'slug'}</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Section: Logo */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <ImageIcon className="w-3.5 h-3.5" />
          Logo client
        </div>

        <div className="flex items-center gap-4">
          {logoPreviewUrl ? (
            <div
              className="w-20 h-20 rounded-xl border flex items-center justify-center overflow-hidden"
              style={{
                background:
                  logoBackground === 'dark'
                    ? '#0a0a0a'
                    : logoBackground === 'transparent'
                      ? 'transparent'
                      : '#ffffff',
                borderColor: 'color-mix(in oklch, currentColor 12%, transparent)',
                padding: logoBackground === 'transparent' ? 0 : 8,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreviewUrl}
                alt="Aperçu logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground">
              <ImageIcon className="w-6 h-6" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                setLogoFile(f);
                setLogoPreviewUrl(URL.createObjectURL(f));
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => logoInputRef.current?.click()}
              className="gap-2"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {logoFile ? 'Remplacer le fichier' : 'Choisir un fichier'}
            </Button>
            {logoFile && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                  setLogoFile(null);
                  setLogoPreviewUrl(null);
                  setLogoBackground('auto');
                }}
                className="gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Retirer
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="logo_background" className="text-sm font-medium">
            Fond d&apos;affichage
          </Label>
          <select
            id="logo_background"
            value={logoBackground}
            onChange={(e) =>
              setLogoBackground(e.target.value as 'auto' | 'light' | 'dark' | 'transparent')
            }
            disabled={!logoFile}
            className="h-11 w-full max-w-[300px] rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="auto">Détection automatique</option>
            <option value="light">Fond clair</option>
            <option value="dark">Fond sombre</option>
            <option value="transparent">Transparent</option>
          </select>
          <p className="text-[13px] text-muted-foreground">
            PNG, JPEG, WebP ou SVG (max 2&nbsp;Mo). Le mode automatique détecte la
            teinte de fond pour les bitmaps; les SVG sont affichés sur fond clair
            par défaut, à corriger manuellement si besoin.
          </p>
        </div>
      </div>

      <Separator />

      {/* Section: Responsable client */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Mail className="w-3.5 h-3.5" />
          Responsable client
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="responsible_name" className="text-sm font-medium">Nom</Label>
            <Input
              id="responsible_name"
              type="text"
              value={formData.responsible_name}
              onChange={(e) =>
                setFormData({ ...formData, responsible_name: e.target.value })
              }
              placeholder="Jane Doe"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsible_email" className="text-sm font-medium">Email</Label>
            <Input
              id="responsible_email"
              type="email"
              value={formData.responsible_email}
              onChange={(e) =>
                setFormData({ ...formData, responsible_email: e.target.value })
              }
              placeholder="jane.doe@example.com"
              className="h-11"
            />
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Recevra une notification pour chaque nouveau ticket et chaque inscription d&apos;utilisateur. Pas besoin d&apos;avoir un compte Pulseo.
        </p>
      </div>

      <Separator />

      {/* Section: Integrations */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Mail className="w-3.5 h-3.5" />
          Integrations
        </div>

        <div className="space-y-2">
          <Label htmlFor="qonto_client_email" className="text-sm font-medium">
            Email client Qonto
          </Label>
          <Input
            id="qonto_client_email"
            type="email"
            value={formData.qonto_client_email}
            onChange={(e) =>
              setFormData({
                ...formData,
                qonto_client_email: e.target.value,
              })
            }
            placeholder="contact@acme.com"
            className="h-11"
          />
          <p className="text-[13px] text-muted-foreground">Optionnel — pour la synchronisation des factures Qonto</p>
        </div>
      </div>

      <Separator />

      {/* Submit */}
      <Button type="submit" disabled={loading} className="w-full h-11 text-sm font-medium gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creation en cours...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Creer l&apos;organisation
          </>
        )}
      </Button>
    </form>
  );
}
