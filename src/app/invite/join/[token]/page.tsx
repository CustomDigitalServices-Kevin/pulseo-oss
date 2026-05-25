import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  startInviteMagicSignIn,
  validateInviteLink,
} from "@/actions/invite-links";
import { InviteJoinForm } from "@/components/invite/invite-join-form";
import { Logo } from "@/components/common/logo";
import { AlertCircle } from "lucide-react";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ email?: string; autosubmit?: string }>;
}

const emailSchema = z.string().email();

export default async function InviteJoinPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { email: rawEmail, autosubmit } = await searchParams;
  const result = await validateInviteLink(token);
  const t = await getTranslations("invite");

  // Mode autosubmit : permet à l'admin d'envoyer un lien `?email=<dest>&autosubmit=1`
  // qui déclenche directement l'envoi du magic-link Better Auth côté serveur,
  // sans saisie utilisateur. Le destinataire arrive sur la vue "vérifiez votre
  // boîte mail" sans interaction supplémentaire.
  //
  // Sécurité : le grant de membership reste exclusivement dans /invite/accept/[token]
  // après vérification de la session Better Auth (P0-2 / P0-3 audit 2026-04-25
  // préservé). L'email pré-rempli en query string n'est pas un oracle : la
  // réponse du serveur est uniforme et le destinataire connaît déjà son propre email.
  let autosubmitted: { email: string } | null = null;
  if (
    result.valid &&
    result.data.organization &&
    autosubmit === "1" &&
    rawEmail
  ) {
    const parsed = emailSchema.safeParse(rawEmail);
    if (parsed.success) {
      const action = await startInviteMagicSignIn({
        token,
        email: parsed.data,
      });
      if (action.success) {
        autosubmitted = { email: parsed.data };
      }
    }
  }

  if (!result.valid || !result.data.organization) {
    const message = !result.valid ? result.error : t("linkTeamUnsupported");
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("linkInvalidTitle")}
          </h1>
          <p className="text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">
            {t("linkContactHint")}
          </p>
        </div>
      </div>
    );
  }
  const organization = result.data.organization;

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0c1425] animate-gradient">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-[oklch(0.700_0.165_230)]/10 rounded-full blur-3xl animate-float" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
              <Logo variant="mark" size={26} markColor="#FAFAFA" />
            </div>
            <span className="text-white/90 text-xl font-semibold tracking-tight">
              Pulseo
            </span>
          </div>

          <div className="max-w-lg">
            <p className="text-blue-400 text-sm font-medium mb-3">
              {t("brandArea")}
            </p>
            <h1 className="text-3xl font-bold text-white leading-tight mb-4">
              {t("welcomeAt")}
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                {organization.name}
              </span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed">
              {t("invitePitch")}
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              {[
                t("featureSubmitTicket"),
                t("featureRealtimeTracking"),
                t("featureCreateAccount"),
              ].map((feature) => (
                <div
                  key={feature}
                  className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 text-sm"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-white/10" />
            <p className="text-white/30 text-xs">{t("footerBrandSmall")}</p>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-start justify-center p-6 sm:p-10 bg-background overflow-y-auto">
        <div className="w-full max-w-lg py-8">
          <InviteJoinForm
            token={token}
            organization={organization}
            initialStep={autosubmitted ? "sent" : "form"}
            initialEmail={autosubmitted?.email ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
