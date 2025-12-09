"use client";

import { useEffect } from "react";
import { toast } from "react-toastify";
import type { Id, ToastContent, ToastOptions } from "react-toastify";

const ADMIN_TOAST_METHODS = ["success", "error", "info", "warn", "warning"] as const;
type AdminToastMethodName = (typeof ADMIN_TOAST_METHODS)[number];
type AdminToastInvoker = <TData = unknown>(
    content: ToastContent<TData>,
    options?: ToastOptions<TData>,
) => Id;
type AdminToastApi = typeof toast & Record<AdminToastMethodName, AdminToastInvoker>;
type MutableAdminToastApi = AdminToastApi & {
    -readonly [K in AdminToastMethodName]: AdminToastInvoker;
};

const adminToastApi = toast as MutableAdminToastApi;

// 管理画面共通のトースト設定: 右下固定・1秒で消える・小さめのテキスト
const ADMIN_TOAST_OPTIONS: Pick<ToastOptions<unknown>, "position" | "autoClose" | "style"> = {
    position: "bottom-right",
    autoClose: 1000,
    style: { fontSize: "0.8rem" },
};

/**
 * 管理画面でトースト表示を右下・速い消去に統一するhook
 * コンポーネントのマウント時にトーストAPIをパッチし、アンマウント時に元に戻す
 */
export function useAdminToast() {
    useEffect(() => {
        const patchedMethods: Array<{ name: AdminToastMethodName; original: AdminToastInvoker }> = [];
        for (const name of ADMIN_TOAST_METHODS) {
            const original = adminToastApi[name];
            const patched: AdminToastInvoker = <TData = unknown>(
                content: ToastContent<TData>,
                options?: ToastOptions<TData>,
            ) => original(content, { ...(options ?? {}), ...ADMIN_TOAST_OPTIONS } as ToastOptions<TData>);
            adminToastApi[name] = patched;
            patchedMethods.push({ name, original });
        }
        return () => {
            for (const { name, original } of patchedMethods) {
                adminToastApi[name] = original;
            }
        };
    }, []);
}
