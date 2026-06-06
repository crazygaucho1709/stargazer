"use client";

import { useState, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { apiRequest } from "@/lib/apiClient";
import { notification } from "@/lib/notificationService";

interface ActionOptions {
    method?: string;
    body?: any;
    successMessage?: string;
    errorMessage?: string;
    loadingMessage?: string;
    showGlobalLoader?: boolean;
    silent?: boolean;
    timeout?: number;
    retries?: number;
}

export const useAstroAction = () => {
    const { setGlobalLoading } = useStargazerStore();
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (
        endpointOrAction: string | (() => Promise<any>), 
        label: string, 
        options: ActionOptions = {}
    ) => {
        const {
            method = "POST",
            body = {},
            successMessage,
            errorMessage,
            loadingMessage,
            showGlobalLoader = true,
            silent = false,
            timeout,
            retries,
        } = options;

        setIsPending(true);
        setError(null);
        if (showGlobalLoader) {
            setGlobalLoading(true, loadingMessage || `EXÉCUTION: ${label}...`);
        }

        try {
            let data: any;

            if (typeof endpointOrAction === "function") {
                data = await endpointOrAction();
            } else {
                const result = await apiRequest(endpointOrAction, {
                    method: method as any,
                    body: method !== "GET" ? body : undefined,
                    silent: true,
                    label,
                    timeout,
                    retries,
                });

                if (!result.success) {
                    throw new Error(result.error || errorMessage || "Action échouée");
                }
                data = result.data;
            }

            if (!silent) {
                notification.success(`${label} réussi`, {
                    description: successMessage || data?.message || "Commande exécutée avec succès",
                });
            }
            return { success: true, data };
        } catch (e: any) {
            const msg = e.message || "Une erreur inattendue est survenue.";
            setError(msg);
            if (!silent) {
                notification.error(`${label} a échoué`, {
                    description: msg,
                });
            }
            return { success: false, error: msg };
        } finally {
            setIsPending(false);
            if (showGlobalLoader) {
                setGlobalLoading(false);
            }
        }
    }, [setGlobalLoading]);

    return { execute, isPending, error };
};
