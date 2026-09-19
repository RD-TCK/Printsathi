"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PrinterLoader } from "@/components/ui/printer-loader";

export interface SubmitButtonProps extends ButtonProps {
  pendingLabel?: string;
  children: React.ReactNode;
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className = "",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={`relative ${className}`}
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
