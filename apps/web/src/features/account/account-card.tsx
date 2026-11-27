"use client";

import { BadgeCheck, MailWarning } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PasswordForm } from "@/features/personale/password-form";
import { LogoutButton } from "@/features/shell/logout-button";
import { describeRoles } from "@/features/shell/role-labels";
import { DataExport } from "./data-export";
import { SessionsPanel } from "./sessions-panel";
import { TwoFactorSection } from "./two-factor-section";

function Fact({ label, children }: { label: string; children: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children ?? "Non indicato"}</dd>
    </div>
  );
}

/** The sign-in account of the person: who they are here, the password, the devices, a copy of their data and the way out. */
export function AccountCard() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <Card as="section" aria-labelledby="account-title" className="flex flex-col gap-4">
      <h2 id="account-title" className="text-lg font-bold tracking-title text-fg">
        Il tuo account
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Nome">{`${me.user.firstName} ${me.user.lastName}`}</Fact>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Email di accesso</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <span className="break-all">{me.user.email}</span>
            {me.user.emailVerified ? (
              <Chip tone="success">
                <BadgeCheck aria-hidden="true" className="size-3.5" /> Verificata
              </Chip>
            ) : (
              <Chip tone="warning">
                <MailWarning aria-hidden="true" className="size-3.5" /> Da verificare
              </Chip>
            )}
          </dd>
        </div>
        <Fact label="Società">{me.society.name}</Fact>
        <Fact label="Ruolo">{describeRoles(me.roles)}</Fact>
      </dl>
      <PasswordForm />
      <TwoFactorSection />
      <SessionsPanel />
      <DataExport />
      <div className="border-t border-line pt-4">
        <LogoutButton />
      </div>
    </Card>
  );
}
