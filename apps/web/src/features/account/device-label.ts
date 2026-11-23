/**
 * A readable name for a device from its user agent ("Chrome su Windows"). The API keeps the user agent as the browser
 * sent it, shortened; a person does not recognise their phone from that, so the two things that do are picked out.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo sconosciuto";
  const browser = browserOf(userAgent);
  const system = systemOf(userAgent);
  if (browser && system) return `${browser} su ${system}`;
  return browser ?? system ?? "Dispositivo sconosciuto";
}

function browserOf(userAgent: string): string | null {
  // Order matters: Edge and Opera also say Chrome, Chrome also says Safari
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return null;
}

function systemOf(userAgent: string): string | null {
  // Order matters: iPhone and iPad also say "like Mac OS X", Android also says Linux
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "Mac";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}
