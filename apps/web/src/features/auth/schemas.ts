import { z } from "zod";

/** Limits mirror the API (apps/api auth schema) so most mistakes are caught before the request. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const email = z.email("Inserisci un'email valida").max(254, "L'email è troppo lunga");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Inserisci la password").max(PASSWORD_MAX),
});

export type LoginValues = z.infer<typeof loginSchema>;

const personName = (label: string) =>
  z.string().trim().min(1, `Inserisci ${label}`).max(80, "Massimo 80 caratteri");

export const registerSchema = z
  .object({
    societyName: z
      .string()
      .trim()
      .min(2, "Il nome della società deve avere almeno 2 caratteri")
      .max(120, "Massimo 120 caratteri"),
    firstName: personName("il nome"),
    lastName: personName("il cognome"),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN, `La password deve avere almeno ${PASSWORD_MIN} caratteri`)
      .max(PASSWORD_MAX, `Massimo ${PASSWORD_MAX} caratteri`),
    confirmPassword: z.string().min(1, "Ripeti la password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Le password non coincidono",
  });

export type RegisterValues = z.infer<typeof registerSchema>;
