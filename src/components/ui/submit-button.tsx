"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PrinterLoader } from "@/components/ui/printer-loader";
import { cn } from "@/lib/utils";

export interface SubmitButtonProps extends ButtonProps {
  pendingLabel?: string;
  children: React.ReactNode;
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className = "",
  variant = "primary",
  size = "lg",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      className={cn("w-full cursor-pointer font-bold justify-center", className)}
      {...props}
    >
      {pending ? (
        <PrinterLoader
          compact
          label={pendingLabel || (typeof children === "string" ? `${children}...` : "Processing...")}
        />
      ) : (
        children
      )}
    </Button>
  );
}
