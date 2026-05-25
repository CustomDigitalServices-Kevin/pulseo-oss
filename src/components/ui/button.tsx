"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "@/lib/utils"
import { buttonVariants, type ButtonVariantProps } from "@/components/ui/button-variants"

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & ButtonVariantProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// Re-export pour backcompat — les consumers client peuvent garder
// `import { Button, buttonVariants } from '@/components/ui/button'`
// mais les RSC DOIVENT utiliser `@/components/ui/button-variants` directement.
export { Button, buttonVariants }
