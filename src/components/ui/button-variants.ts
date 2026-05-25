/**
 * Server-safe button variants.
 *
 * Séparé de `button.tsx` (qui a `"use client"` pour le composant Button) pour
 * permettre l'import de `buttonVariants` depuis des Server Components.
 *
 * Usage RSC : `<Link className={buttonVariants({ variant: 'outline' })} />`
 * Usage client : `button.tsx` re-exporte cette fonction.
 *
 * Sans ce split, importer `buttonVariants` depuis `@/components/ui/button`
 * dans un RSC déclenche : `Error: Attempted to call buttonVariants() from
 * the server but buttonVariants is on the client` (Next.js 16).
 */
import { cva, type VariantProps } from "class-variance-authority"

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "btn-premium text-primary-foreground",
        outline:
          "border-border bg-elevated/60 hover:bg-elevated hover:border-border-strong text-foreground transition-colors backdrop-blur-sm",
        secondary:
          "bg-elevated text-foreground border-border hover:bg-overlay hover:border-border-strong transition-colors",
        ghost:
          "hover:bg-elevated text-foreground-muted hover:text-foreground transition-colors aria-expanded:bg-elevated aria-expanded:text-foreground",
        destructive:
          "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25 hover:border-destructive/50 transition-colors",
        link: "text-primary underline-offset-4 hover:underline",
        // CTA premium: dégradé violet→bleu inspiré du Portal Pulseo (v2026-04-22).
        // Utilisé pour les actions clés haute visibilité (ex: "Nouveau ticket").
        cta:
          "text-white font-semibold border-0 bg-[linear-gradient(90deg,#7c3aed_0%,#3b82f6_100%)] shadow-[0_8px_24px_-6px_rgba(124,58,237,0.45)] hover:shadow-[0_12px_32px_-6px_rgba(124,58,237,0.55)] hover:-translate-y-px transition-all",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xl: "h-11 gap-2 rounded-xl px-6 text-[0.95rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-4.5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
