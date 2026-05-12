"use client";

import { useState, useCallback } from "react";
import { toaster } from "@/components/ui/toaster";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";

interface ActionOptions {
    method?: string;
    body?: any;
    successMessage?: string;
    errorMessage?: string;
    loadingMessage?: string;
    showGlobalLoader?: boolean;
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
            showGlobalLoader = true
        } = options;

        setIsPending(true);
        setError(null);
        if (showGlobalLoader) {
            setGlobalLoading(true, loadingMessage || `EXECUTING: ${label}...`);
        }

        try {
            let data;
            if (typeof endpointOrAction === "function") {
                data = await endpointOrAction();
            } else {
                const url =
                    typeof endpointOrAction === "string" && endpointOrAction.startsWith("/api")
                        ? clientApiUrl(endpointOrAction)
                        : endpointOrAction;
                const res = await fetch(url, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: method !== "GET" ? JSON.stringify(body) : undefined
                });

                const text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    const cleanText = text.startsWith("<!DOCTYPE")
                        ? (text.match(/<title>(.*?)<\/title>/)?.[1] || "Server Error (HTML)")
                        : text.substring(0, 100);
                    data = { 
                        success: res.ok, 
                        message: cleanText || (res.ok ? "Success" : "Invalid response from server") 
                    };
                }
                if (!res.ok && !data.success) {
                    throw new Error(data.message || data.error || errorMessage || `Server error: ${res.status}`);
                }
            }

            if (data.success || (typeof data.success === 'undefined' && data)) {
                toaster.create({
                    title: `${label} SUCCESS`,
                    description: successMessage || data.message || "Command executed successfully.",
                    type: "success"
                });
                return { success: true, data };
            } else {
                throw new Error(data.message || data.error || errorMessage || "Action failed");
            }
        } catch (e: any) {
            const msg = e.message || "An unexpected error occurred.";
            setError(msg);
            toaster.create({
                title: `${label} FAILED`,
                description: msg,
                type: "error"
            });
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
