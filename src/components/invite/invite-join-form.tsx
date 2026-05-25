"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { startInviteMagicSignIn } from "@/actions/invite-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MailCheck,
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  color_primary: string | null;
  logo_url: string | null;
}

type Step = "form" | "sent";

export function InviteJoinForm({
  token,
  organization,
  initialStep = "form",
  initialEmail = "",
}: {
  token: string;
  organization: Organization;
  /**
   * Permet au RSC parent de pré-rendre l'étape "sent" quand l'autosubmit côté
   * serveur a déjà envoyé le magic-link (cf `/invite/join/[token]/page.tsx`
   * gestion `?email=<x>&autosubmit=1`). Évite un aller-retour client inutile.
   */
  initialStep?: Step;
  initialEmail?: string;
}) {
  const t = useTranslations("invite");
  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single-step submit. The server returns a uniform response whether the
  // email exists or not (see startInviteMagicSignIn). Membership is only
  // granted after the user verifies the magic link and lands on
  // /invite/accept/[token]. This closes the user-enumeration oracle and
  // the forced-enrollment vector flagged by the audit (P0-2 / P0-3).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await startInviteMagicSignIn({
      token,
      email,
    });
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setStep("sent");
  };

  if (step === "sent") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <MailCheck className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t("joinSent")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("joinSentAccess", { name: organization.name })}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <p
            className="text-sm text-foreground/90"
            dangerouslySetInnerHTML={{
              __html: t("joinSentBody", { email }),
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("joinSentSpamHint")}{" "}
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => {
                setStep("form");
                setError(null);
              }}
            >
              {t("joinSentRetry")}
            </button>
            .
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          {t("joinSentValidity")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold"
          style={{ backgroundColor: organization.color_primary ?? "#2563EB" }}
        >
          {organization.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("joinSignInHeading")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.rich("joinWorkspace", {
              name: organization.name,
              b: (chunks) => (
                <b className="font-medium text-foreground">{chunks}</b>
              ),
            })}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/8 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="text-sm font-medium flex items-center gap-2"
          >
            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
            {t("joinEmailLabel")}
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("joinEmailPlaceholder")}
            className="h-11"
            required
            autoComplete="email"
            autoFocus
          />
          <p className="text-[13px] text-muted-foreground">
            {t("joinEmailHint")}
          </p>
        </div>

        <Button
          type="submit"
          disabled={loading || !email}
          className="w-full h-11 gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("joinChecking")}
            </>
          ) : (
            <>
              {t("joinContinue")}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
