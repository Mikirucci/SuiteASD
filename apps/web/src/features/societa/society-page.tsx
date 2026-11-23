"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, Card, DataBoundary, Input, SectionHeading, Select, useToast } from "@/components/ui";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import { usePermission } from "@/hooks/use-permission";
import { useSociety, useUpdateSociety, type Society } from "./api";
import { LEGAL_FORMS, SOCIETY_FORM_FIELDS, societyPatchOf, societySchema, societyValuesOf, type SocietyValues } from "./society-schema";

const TIMEZONES = ["Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Zurich", "Europe/Lisbon"] as const;

function timezoneOptions(current: string): Array<{ value: string; label: string }> {
  const zones = TIMEZONES.includes(current as (typeof TIMEZONES)[number]) ? [...TIMEZONES] : [current, ...TIMEZONES];
  return zones.map((zone) => ({ value: zone, label: zone.replace("_", " ") }));
}

function SocietyForm({ society }: { society: Society }) {
  const { toast } = useToast();
  const canWrite = usePermission("society:write");
  const update = useUpdateSociety();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<SocietyValues>({ resolver: zodResolver(societySchema), defaultValues: societyValuesOf(society) });
  const values = useWatch({ control }) as SocietyValues;
  const changes = societyPatchOf(values, society);
  const nothingToSave = Object.keys(changes).length === 0;
  const timezoneChanged = changes.timezone !== undefined;

  const onSubmit = handleSubmit(async (formValues) => {
    setFormError(null);
    try {
      await update.mutateAsync(societyPatchOf(formValues, society));
      toast({ title: "Dati della società salvati", tone: "success" });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, SOCIETY_FORM_FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Dati della società" className="flex flex-col gap-6">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      {!canWrite ? <Alert tone="info">Questi dati li modifica l&apos;amministratore: tu puoi consultarli.</Alert> : null}
      <fieldset disabled={!canWrite} className="flex flex-col gap-6">
        <Card as="section" aria-labelledby="society-general-title" className="flex flex-col gap-4">
          <h2 id="society-general-title" className="text-lg font-bold tracking-title text-fg">
            Dati generali
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nome della società" required maxLength={120} className="sm:col-span-2" error={errors.name?.message} {...register("name")} />
            <Select
              label="Fuso orario"
              options={timezoneOptions(society.timezone)}
              hint={
                timezoneChanged
                  ? "Cambiarlo non sposta gli eventi già salvati, ma cambia le ricorrenze future, i promemoria e le date stampate sulle ricevute."
                  : "Gli orari di allenamenti e partite si leggono in questo fuso."
              }
              error={errors.timezone?.message}
              {...register("timezone")}
            />
            <Input label="Telefono" type="tel" inputMode="tel" autoComplete="off" error={errors.phone?.message} {...register("phone")} />
            <Input label="Email di contatto" type="email" inputMode="email" autoComplete="off" error={errors.contactEmail?.message} {...register("contactEmail")} />
            <Input label="Sito web" type="url" inputMode="url" autoComplete="off" hint="Con http:// o https://" error={errors.website?.message} {...register("website")} />
          </div>
        </Card>

        {society.legal ? (
          <Card as="section" aria-labelledby="society-legal-title" className="flex flex-col gap-4">
            <div>
              <h2 id="society-legal-title" className="text-lg font-bold tracking-title text-fg">
                Dati legali e fiscali
              </h2>
              <p className="text-sm text-fg-muted">Li vedono solo l&apos;amministratore e la segreteria. Compaiono sulle ricevute.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Denominazione legale" maxLength={160} className="sm:col-span-2" error={errors.legalName?.message} {...register("legalName")} />
              <Select label="Forma giuridica" placeholder="Non indicata" options={LEGAL_FORMS} error={errors.legalForm?.message} {...register("legalForm")} />
              <Input label="Codice fiscale" autoComplete="off" maxLength={16} hint="11 cifre o 16 caratteri." error={errors.fiscalCode?.message} {...register("fiscalCode")} />
              <Input label="Partita IVA" inputMode="numeric" autoComplete="off" maxLength={11} hint="11 cifre." error={errors.vatNumber?.message} {...register("vatNumber")} />
              <Input label="Numero di iscrizione al registro" maxLength={40} autoComplete="off" error={errors.registryNumber?.message} {...register("registryNumber")} />
              <Input label="Indirizzo della sede" maxLength={160} autoComplete="off" className="sm:col-span-2" error={errors.address?.message} {...register("address")} />
              <Input label="Città" maxLength={80} autoComplete="off" error={errors.city?.message} {...register("city")} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="CAP" inputMode="numeric" maxLength={5} autoComplete="off" error={errors.postalCode?.message} {...register("postalCode")} />
                <Input label="Provincia" maxLength={2} autoComplete="off" error={errors.province?.message} {...register("province")} />
              </div>
              <Input label="PEC" type="email" inputMode="email" autoComplete="off" error={errors.pec?.message} {...register("pec")} />
              <Input label="Codice SDI" maxLength={7} autoComplete="off" hint="7 caratteri, per le fatture elettroniche." error={errors.sdiCode?.message} {...register("sdiCode")} />
              <Input label="IBAN" autoComplete="off" className="sm:col-span-2" hint="Per i bonifici delle quote." error={errors.iban?.message} {...register("iban")} />
            </div>
          </Card>
        ) : null}
      </fieldset>
      {canWrite ? (
        <div>
          <Button type="submit" loading={update.isPending} disabled={nothingToSave}>
            Salva i dati
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** The data of the society: who it is, how to reach it and, for those who may see them, the fiscal and banking data. */
export function SocietyPage() {
  const society = useSociety();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="La società"
        title="Chi è la tua società."
        highlight="Chi è"
        description="Nome, contatti e dati fiscali: finiscono sulle ricevute e nelle comunicazioni."
      />
      <DataBoundary
        isLoading={society.isLoading}
        error={society.error}
        onRetry={() => void society.refetch()}
        isEmpty={!society.data}
        loadingLabel="Caricamento dei dati della società"
        skeletonRows={4}
        empty={null}
      >
        {society.data ? <SocietyForm key={JSON.stringify(society.data)} society={society.data} /> : null}
      </DataBoundary>
    </div>
  );
}
