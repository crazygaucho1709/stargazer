// src/lib/validation.ts

export interface FieldError {
  field: string;
  message: string;
}

export function validateUrl(value: string): string | null {
  if (!value?.trim()) return "L'URL du serveur est requise";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "Le protocole doit être HTTP ou HTTPS";
    if (!url.hostname) return "Hôte invalide";
    return null;
  } catch {
    return "URL invalide (ex: http://192.168.1.100:8624)";
  }
}

export function validateIp(value: string): string | null {
  if (!value?.trim()) return "L'adresse IP est requise";
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = value.match(ipv4Regex);
  if (!match) return "Adresse IP invalide (ex: 192.168.1.100)";
  const parts = match.slice(1).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return "Octets IP doivent être entre 0 et 255";
  return null;
}

export function validatePort(value: string | number): string | null {
  const port = typeof value === "string" ? parseInt(value) : value;
  if (isNaN(port) || port < 1 || port > 65535) return "Le port doit être entre 1 et 65535";
  return null;
}

export function validateLatitude(value: string | number): string | null {
  const lat = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(lat)) return "La latitude doit être un nombre";
  if (lat < -90 || lat > 90) return "La latitude doit être entre -90 et 90";
  return null;
}

export function validateLongitude(value: string | number): string | null {
  const lng = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(lng)) return "La longitude doit être un nombre";
  if (lng < -180 || lng > 180) return "La longitude doit être entre -180 et 180";
  return null;
}

export function validatePositiveInt(value: string | number): string | null {
  const num = typeof value === "string" ? parseInt(value) : value;
  if (isNaN(num) || num < 1) return "La valeur doit être un entier positif";
  return null;
}

export function validateRequired(value: string): string | null {
  if (!value?.trim()) return "Ce champ est requis";
  return null;
}

export function validateMinAlt(value: string | number): string | null {
  const alt = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(alt)) return "Doit être un nombre";
  if (alt < 0 || alt > 90) return "Doit être entre 0° et 90°";
  return null;
}

export function validateMaxAlt(value: string | number): string | null {
  const alt = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(alt)) return "Doit être un nombre";
  if (alt < 0 || alt > 90) return "Doit être entre 0° et 90°";
  return null;
}
