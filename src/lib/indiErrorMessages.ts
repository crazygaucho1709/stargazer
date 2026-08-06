// src/lib/indiErrorMessages.ts

import { INDIErrorCode } from "@/lib/indiClient";

type Lang = "fr" | "en";

interface ErrorEntry {
  message: Record<Lang, string>;
  action: Record<Lang, string>;
}

const MESSAGES: Record<INDIErrorCode, ErrorEntry> = {
  [INDIErrorCode.TIMEOUT]: {
    message: {
      fr: "La monture ne répond pas (timeout SSH)",
      en: "Mount is not responding (SSH timeout)",
    },
    action: {
      fr: "Vérifiez que l'Astroberry est allumé et accessible sur le réseau. Relancez le serveur INDI si nécessaire.",
      en: "Check that Astroberry is powered on and reachable on the network. Restart the INDI server if needed.",
    },
  },
  [INDIErrorCode.NOT_CONNECTED]: {
    message: {
      fr: "Bridge INDI non connecté. Vérifiez Astroberry.",
      en: "INDI bridge not connected. Check Astroberry.",
    },
    action: {
      fr: "Ouvrez la configuration et reconnectez-vous à Astroberry. Assurez-vous que le service INDI tourne sur le Raspberry Pi.",
      en: "Open settings and reconnect to Astroberry. Make sure the INDI service is running on the Raspberry Pi.",
    },
  },
  [INDIErrorCode.DEVICE_NOT_FOUND]: {
    message: {
      fr: "Périphérique introuvable. Vérifiez le driver.",
      en: "Device not found. Check the driver.",
    },
    action: {
      fr: "Vérifiez que le driver de la monture est chargé dans INDI et que le câble USB est branché.",
      en: "Check that the mount driver is loaded in INDI and that the USB cable is connected.",
    },
  },
  [INDIErrorCode.LIMIT_REACHED]: {
    message: {
      fr: "Limite de déplacement atteinte. Slew annulé.",
      en: "Movement limit reached. Slew cancelled.",
    },
    action: {
      fr: "La monture a atteint une limite de sécurité alt/az. Repositionnez manuellement ou ajustez les limites dans la configuration.",
      en: "The mount reached an alt/az safety limit. Reposition manually or adjust the limits in settings.",
    },
  },
  [INDIErrorCode.UNKNOWN]: {
    message: {
      fr: "Erreur INDI inconnue.",
      en: "Unknown INDI error.",
    },
    action: {
      fr: "Consultez les logs du serveur pour plus de détails.",
      en: "Check the server logs for details.",
    },
  },
};

export function getINDIErrorMessage(code: INDIErrorCode, lang: Lang): string {
  return MESSAGES[code]?.message[lang] ?? MESSAGES[INDIErrorCode.UNKNOWN].message[lang];
}

export function getINDIErrorAction(code: INDIErrorCode, lang: Lang): string {
  return MESSAGES[code]?.action[lang] ?? MESSAGES[INDIErrorCode.UNKNOWN].action[lang];
}
