/**
 * Canboso.com API client
 * Handles authentication (JWT + refresh) and order/product management.
 *
 * `CanbosoClient` is a per-account class — instantiate one per seller account.
 * The module-level exports (getPaidOrders, etc.) wrap a lazy default client
 * for backwards compatibility with callers that use account-1 only.
 */
import { logger } from "./logger";

const BASE = "https://canboso.com/api";

export interface CanbosoOrder {
  _id: string;
  orderCode: string;
  chatId: number;
  chatName?: string;
  amount: number;
  quantity: number;
  finalQuantity: number;
  status: "pending" | "paid" | "completed" | "cancelled";
  productType: string;
  displayProductType?: string;
  productId?: string;
  paidAt?: string;
  createdAt: string;
  deliveredAccounts: any[];
}

export interface CanbosoProduct {
  _id: string;
  product_name: string;
  emoji: string;
  pricing: number;
  hiddenInBotMenu: boolean;
  stats: { total: number; sold: number; available: number };
}

export interface CanbosoProductItem {
  _id: string;
  user: string;
  password?: string;
  status: "available" | "sold" | "disabled";
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

function parseJwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

// ─── Per-account client class ────────────────────────────────────────────────

export class CanbosoClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly username: string, private readonly password: string) {}

  private async login(): Promise<void> {
    if (!this.username || !this.password) throw new Error("Canboso credentials not set");
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!res.ok) throw new Error(`Canboso login failed: ${res.status}`);
    const data = (await res.json()) as LoginResponse;
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.accessTokenExpiresAt = parseJwtExp(data.accessToken);
    logger.info("Canboso: logged in successfully");
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (data.accessToken) {
        this.accessToken = data.accessToken;
        if (data.refreshToken) this.refreshToken = data.refreshToken;
        this.accessTokenExpiresAt = parseJwtExp(data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async ensureAuth(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.accessTokenExpiresAt - 5 * 60 * 1000) {
      if (!(await this.tryRefresh())) await this.login();
    }
    return this.accessToken!;
  }

  async apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.ensureAuth();
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });
    const data = (await res.json()) as any;
    if (!res.ok || data?.success === false) {
      throw new Error(data?.message ?? `Canboso API error ${res.status}`);
    }
    return data as T;
  }

  async getPaidOrders(limit = 100): Promise<CanbosoOrder[]> {
    const data = await this.apiFetch<{ orders: CanbosoOrder[] }>(
      `/seller/orders?status=paid&limit=${limit}`,
    );
    return data.orders ?? [];
  }

  async getRecentCompletedOrders(limit = 100): Promise<CanbosoOrder[]> {
    const data = await this.apiFetch<{ orders: CanbosoOrder[] }>(
      `/seller/orders?status=completed&limit=${limit}`,
    );
    return data.orders ?? [];
  }

  async getPendingCount(): Promise<number> {
    try {
      const data = await this.apiFetch<{ pendingCount: number }>("/seller/orders/pending-count");
      return data.pendingCount ?? 0;
    } catch {
      return 0;
    }
  }

  async getSellerProducts(): Promise<CanbosoProduct[]> {
    const data = await this.apiFetch<{ products: CanbosoProduct[] }>("/seller/products?limit=100");
    return data.products ?? [];
  }

  async setProductVisibility(productId: string, hidden: boolean): Promise<void> {
    await this.apiFetch(`/seller/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ hiddenInBotMenu: hidden }),
    });
    logger.info({ productId, hidden }, `Canboso product ${hidden ? "hidden" : "shown"}`);
  }

  async setProductPrice(productId: string, pricing: number): Promise<void> {
    await this.apiFetch(`/seller/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ pricing }),
    });
    logger.info({ productId, pricing }, "Canboso product price updated");
  }

  async getProductItems(productId: string, limit = 1000): Promise<CanbosoProductItem[]> {
    const data = await this.apiFetch<{ items: CanbosoProductItem[] }>("/seller/products/items", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, limit }),
    });
    return data.items ?? [];
  }

  async addSentinelAccounts(productId: string, code: string, count: number): Promise<void> {
    if (count <= 0) return;
    const items = Array.from({ length: count }, () => `${code}|vui lòng chờ 5s`);
    await this.apiFetch("/seller/products/items/add", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, items }),
    });
    logger.info({ productId, code, count }, "Canboso: added sentinel accounts");
  }

  async deleteSentinelAccounts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.apiFetch("/seller/products/items/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    logger.info({ count: ids.length }, "Canboso: deleted excess sentinel accounts");
  }

  resetAuth(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.accessTokenExpiresAt = 0;
  }
}

// ─── Default account-1 singleton (lazy) ─────────────────────────────────────

let _defaultClient: CanbosoClient | null = null;
let _runtimeUsername: string | null = null;
let _runtimePassword: string | null = null;

/**
 * Override Canboso credentials at runtime (e.g. after loading from config DB).
 * Resets the cached singleton so the next call to getDefaultCanbosoClient() picks them up.
 */
export function setDefaultCanbosoCredentials(username: string, password: string): void {
  _runtimeUsername = username;
  _runtimePassword = password;
  _defaultClient = null; // force recreation with new credentials
}

/** Returns the default (account-1) client, creating it lazily.
 *  Priority: runtime override (set via setDefaultCanbosoCredentials) → env vars.
 */
export function getDefaultCanbosoClient(): CanbosoClient {
  if (!_defaultClient) {
    const u = _runtimeUsername ?? process.env["CANBOSO_USERNAME"] ?? "";
    const p = _runtimePassword ?? process.env["CANBOSO_PASSWORD"] ?? "";
    _defaultClient = new CanbosoClient(u, p);
  }
  return _defaultClient;
}

// ─── Legacy module-level exports (account-1 wrappers) ───────────────────────
// These keep all existing callers (market-canboso.ts, poller.ts, etc.) working.

/** @deprecated use CanbosoClient instance directly */
export async function apiFetchMarket<T>(path: string, options: RequestInit = {}): Promise<T> {
  return getDefaultCanbosoClient().apiFetch<T>(path, options);
}

export async function getPaidOrders(limit = 100) {
  return getDefaultCanbosoClient().getPaidOrders(limit);
}

export async function getRecentCompletedOrders(limit = 100) {
  return getDefaultCanbosoClient().getRecentCompletedOrders(limit);
}

export function isSentinelDelivery(order: CanbosoOrder, sentinelValue = "100"): boolean {
  if (!order.deliveredAccounts || order.deliveredAccounts.length === 0) return false;
  const sv = sentinelValue.trim();
  return order.deliveredAccounts.some(
    (a: any) => String(a.user ?? "").trim() === sv,
  );
}

export async function getPendingCount() {
  return getDefaultCanbosoClient().getPendingCount();
}

export async function getSellerProducts() {
  return getDefaultCanbosoClient().getSellerProducts();
}

export async function setProductVisibility(productId: string, hidden: boolean) {
  return getDefaultCanbosoClient().setProductVisibility(productId, hidden);
}

export async function setProductPrice(productId: string, pricing: number) {
  return getDefaultCanbosoClient().setProductPrice(productId, pricing);
}

export async function getProductItems(productId: string, limit = 1000) {
  return getDefaultCanbosoClient().getProductItems(productId, limit);
}

export async function addSentinelAccounts(productId: string, code: string, count: number) {
  return getDefaultCanbosoClient().addSentinelAccounts(productId, code, count);
}

export async function deleteSentinelAccounts(ids: string[]) {
  return getDefaultCanbosoClient().deleteSentinelAccounts(ids);
}

export function resetAuth(): void {
  getDefaultCanbosoClient().resetAuth();
}
