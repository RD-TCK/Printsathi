"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signUpShopOwner } from "@/app/actions/auth";

export function RegisterForm() {
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);

  function handleShopNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setShopName(name);
    if (!isSlugCustomized) {
      const generatedSlug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setShopSlug(generatedSlug);
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setIsSlugCustomized(true);
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/--+/g, "-");
    setShopSlug(slug);
  }

  return (
    <form action={signUpShopOwner} className="space-y-4">
      <Input
        id="name"
        name="fullName"
        label="Your full name"
        autoComplete="name"
        placeholder="e.g. Rahul Sharma"
        required
      />

      <Input
        id="email"
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        placeholder="rahul@example.com"
        required
      />

      <Input
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="Must be at least 8 characters"
        placeholder="••••••••"
        required
      />

      <div className="border-t border-slate-100 pt-3">
        <Input
          id="shopName"
          name="shopName"
          label="Shop / Xerox store name"
          autoComplete="organization"
          placeholder="e.g. Central Print Hub"
          value={shopName}
          onChange={handleShopNameChange}
          required
        />
      </div>

      <div>
        <Input
          id="shopSlug"
          name="shopSlug"
          label="Shop QR URL slug"
          placeholder="e.g. central-print-hub"
          value={shopSlug}
          onChange={handleSlugChange}
          hint={shopSlug ? `Customer link: printiva.co.in/shop/${shopSlug}` : "Letters, numbers, and hyphens"}
          required
        />
      </div>

      <SubmitButton className="w-full mt-2" pendingLabel="Creating your shop...">
        Create Shop Account
      </SubmitButton>
    </form>
  );
}
