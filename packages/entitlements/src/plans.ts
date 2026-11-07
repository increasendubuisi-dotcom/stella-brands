/**
 * Plan configuration. This file is the ONLY place prices, features and limits
 * live. Components and server actions ask `can()` / `checkLimit()` instead of
 * checking plan names, so changing a price or moving a feature between tiers
 * is a config change. In production this config is mirrored into the `plans`
 * table so it can be changed without a deploy; this file is the seed and the
 * fallback.
 *
 * Monthly NGN prices are from the product brief. Annual prices (10 × monthly),
 * the Starter tier and every limit below are proposals awaiting approval.
 */

export const FEATURES = [
  "ai_assistant",
  "client_comments",
  "presentation_mode",
  "password_protection",
  "custom_domain",
  "remove_badge",
  "client_handover",
  "invoicing",
  "pdf_export",
  "team_members",
  "version_history",
] as const;
export type Feature = (typeof FEATURES)[number];

export const LIMITS = ["brands", "published_guides", "storage_mb", "ai_tokens_monthly", "seats", "upload_mb"] as const;
export type Limit = (typeof LIMITS)[number];

export type Currency = "NGN" | "USD";
export type BillingInterval = "monthly" | "annual";

/** Prices in minor units (kobo, cents). null = not sold in that currency / custom. */
export type PlanPrices = Partial<Record<Currency, Record<BillingInterval, number | null>>>;

export type PlanKey = "starter" | "basic" | "ai" | "studio" | "agency";

export type PlanConfig = {
  key: PlanKey;
  name: string;
  description: string;
  prices: PlanPrices;
  features: ReadonlySet<Feature>;
  /** Infinity = unlimited. */
  limits: Record<Limit, number>;
  /** Shown publicly on the pricing page. */
  public: boolean;
};

const naira = (amount: number) => amount * 100;

const BASE_FEATURES: Feature[] = ["password_protection", "version_history", "client_comments"];

export const PLANS: Record<PlanKey, PlanConfig> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "Try Stella with one live guide.",
    prices: { NGN: { monthly: 0, annual: 0 } },
    features: new Set<Feature>(["version_history"]),
    limits: {
      brands: 2,
      published_guides: 1,
      storage_mb: 250,
      ai_tokens_monthly: 20_000,
      seats: 1,
      upload_mb: 25,
    },
    public: true,
  },
  basic: {
    key: "basic",
    name: "Basic",
    description: "The full guide builder for independent designers.",
    prices: { NGN: { monthly: naira(5_000), annual: naira(50_000) } },
    features: new Set<Feature>([...BASE_FEATURES, "presentation_mode", "remove_badge"]),
    limits: {
      brands: 10,
      published_guides: 5,
      storage_mb: 5_000,
      ai_tokens_monthly: 0,
      seats: 1,
      upload_mb: 100,
    },
    public: true,
  },
  ai: {
    key: "ai",
    name: "AI",
    description: "Basic plus the brand strategy assistant.",
    prices: { NGN: { monthly: naira(10_000), annual: naira(100_000) } },
    features: new Set<Feature>([...BASE_FEATURES, "presentation_mode", "remove_badge", "ai_assistant"]),
    limits: {
      brands: 15,
      published_guides: 10,
      storage_mb: 10_000,
      ai_tokens_monthly: 2_000_000,
      seats: 1,
      upload_mb: 200,
    },
    public: true,
  },
  studio: {
    key: "studio",
    name: "Studio",
    description: "For small studios: team seats, custom domains, handover.",
    prices: { NGN: { monthly: naira(15_000), annual: naira(150_000) } },
    features: new Set<Feature>([
      ...BASE_FEATURES,
      "presentation_mode",
      "remove_badge",
      "ai_assistant",
      "custom_domain",
      "client_handover",
      "invoicing",
      "pdf_export",
      "team_members",
    ]),
    limits: {
      brands: Infinity,
      published_guides: Infinity,
      storage_mb: 25_000,
      ai_tokens_monthly: 5_000_000,
      seats: 3,
      upload_mb: 500,
    },
    public: true,
  },
  agency: {
    key: "agency",
    name: "Agency",
    description: "Custom pricing and limits for agencies and in-house teams.",
    prices: { NGN: { monthly: null, annual: null } },
    features: new Set<Feature>(FEATURES),
    limits: {
      brands: Infinity,
      published_guides: Infinity,
      storage_mb: 100_000,
      ai_tokens_monthly: 20_000_000,
      seats: 10,
      upload_mb: 1_000,
    },
    public: true,
  },
};

export const DEFAULT_PLAN: PlanKey = "starter";
