"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, Card, DataBoundary, Input, useToast } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { useMyProfile, usePatchMyProfile, type MyProfile } from "./profile-api";
import { PROFILE_FIELDS, profilePatchOf, profileSchema, profileValuesOf, type ProfileValues } from "./profile-schema";

const LOCKED_HINT = "Già registrato sulla tua scheda: se è sbagliato scrivi alla segreteria.";

function ProfileForm({ profile }: { profile: MyProfile }) {
  const { toast } = useToast();
  const professional = usePermission("profile:professional");
  const patch = usePatchMyProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: profileValuesOf(profile) });
  const changes = profilePatchOf(useWatch({ control }) as ProfileValues, profile);
  const nothingToSave = Object.keys(changes).length === 0;
  const locked = (field: "fiscalCode" | "birthDate" | "birthPlace") => profile.fixedFields.includes(field);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await patch.mutateAsync(profilePatchOf(values, profile));
      toast({ title: "Dati salvati", tone: "success" });
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, PROFILE_FIELDS, {
          fiscal_code_taken: { field: "fiscalCode", message: "Questo codice fiscale è già registrato per un'altra persona" },
          profile_field_locked: { field: "fiscalCode", message: LOCKED_HINT },
        }),
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-label="I tuoi dati personali" className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Nome</dt>
          <dd className="text-sm text-fg">{`${profile.firstName} ${profile.lastName}`}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">Email di accesso</dt>
          <dd className="break-all text-sm text-fg">{profile.email}</dd>
        </div>
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Telefono" type="tel" autoComplete="tel" inputMode="tel" error={errors.phone?.message} {...register("phone")} />
        <Input
          label="Data di nascita"
          type="date"
          autoComplete="bday"
          disabled={locked("birthDate")}
          hint={locked("birthDate") ? LOCKED_HINT : undefined}
          error={errors.birthDate?.message}
          {...register("birthDate")}
        />
        <Input
          label="Luogo di nascita"
          autoComplete="off"
          disabled={locked("birthPlace")}
          hint={locked("birthPlace") ? LOCKED_HINT : undefined}
          error={errors.birthPlace?.message}
          {...register("birthPlace")}
        />
        <Input
          label="Codice fiscale"
          autoComplete="off"
          maxLength={16}
          disabled={locked("fiscalCode")}
          hint={locked("fiscalCode") ? LOCKED_HINT : "16 caratteri."}
          error={errors.fiscalCode?.message}
          {...register("fiscalCode")}
        />
        <Input label="Indirizzo" autoComplete="street-address" className="sm:col-span-2" error={errors.address?.message} {...register("address")} />
        <Input label="Città" autoComplete="address-level2" error={errors.city?.message} {...register("city")} />
        <Input label="CAP" inputMode="numeric" autoComplete="postal-code" maxLength={5} error={errors.postalCode?.message} {...register("postalCode")} />
        {professional ? (
          <Input
            label="IBAN per i rimborsi"
            autoComplete="off"
            className="sm:col-span-2"
            hint="Lo vedono solo tu, la segreteria e l'amministrazione."
            error={errors.iban?.message}
            {...register("iban")}
          />
        ) : null}
      </div>
      <div>
        <Button type="submit" loading={patch.isPending} disabled={nothingToSave}>
          Salva i dati
        </Button>
      </div>
    </form>
  );
}

/** The personal data of the signed-in person: they see and fill in their own, and nobody else's. */
export function MyProfileSection() {
  const profile = useMyProfile();
  return (
    <Card as="section" aria-labelledby="my-profile-title" className="flex flex-col gap-4">
      <h2 id="my-profile-title" className="text-lg font-bold tracking-title text-fg">
        I tuoi dati
      </h2>
      <DataBoundary
        isLoading={profile.isLoading}
        error={profile.error}
        onRetry={() => void profile.refetch()}
        isEmpty={!profile.data}
        loadingLabel="Caricamento dei tuoi dati"
        skeletonRows={4}
        empty={null}
      >
        {profile.data ? <ProfileForm key={JSON.stringify(profile.data)} profile={profile.data} /> : null}
      </DataBoundary>
    </Card>
  );
}
