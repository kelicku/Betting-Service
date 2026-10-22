export type Rarity = "N" | "R" | "SR" | "SSR";

export interface Me {
  id: number;
  email: string;
  display_name: string;
  role: "user" | "staff" | "admin";
  email_verified: boolean;
  /** ガチャチケットの残高（ガチャを引くときに使う） */
  balance: number;
  /** ポイントの残高（ガチャで当たり、景品・ギフトとの交換に使う） */
  point_balance: number;
  phone_verified: boolean;
  /** SMS 認証が必須で、まだ済んでいない */
  sms_required: boolean;
  invite_code: string | null;
  unread_notifications: number;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface Prize {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  rarity: Rarity;
  subtitle?: string;
  /** 0 より大きいとポイント景品（当選するとこの数のポイントが加算される） */
  point_value?: number;
}

export interface GachaSummary {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  banner_image_url: string | null;
  theme_color: string;
  ticket_cost: number;
  mode: "probability" | "box";
  starts_at: string | null;
  ends_at: string | null;
  is_open: boolean;
  remaining: number | null;
  total_pulls: number | null;
  has_last_one: boolean;
  last_one_awarded: boolean;
  top_rarity: Rarity | null;
  featured_prize: Prize | null;
  badge?: string;
  pulls_done?: number;
}

export interface GachaDetail extends GachaSummary {
  description: string;
  allow_multi_10: boolean;
  allow_multi_100: boolean;
  items: { prize: Prize; probability: number; stock_total: number | null; stock_remaining: number | null }[];
  rarity_rates: Record<Rarity, number>;
  last_one_prize: Prize | null;
  last_one_description: string;
}

export interface DrawResult {
  position: number;
  prize: Prize;
  rarity: Rarity;
  is_last_one: boolean;
  point_value?: number;
}

export interface Draw {
  id: string;
  gacha_id: number;
  gacha_title: string;
  gacha_slug: string;
  count: 1 | 10 | 100;
  tickets_spent: number;
  best_rarity: Rarity;
  has_last_one: boolean;
  created_at: string;
  results: DrawResult[];
  rarity_counts: Record<Rarity, number>;
  points_won?: number;
  balance_after: number | null;
  point_balance_after?: number | null;
  replayed: boolean;
}

export interface DrawSummary {
  id: string;
  gacha_id: number;
  gacha_title: string;
  count: number;
  tickets_spent: number;
  points_won?: number;
  best_rarity: Rarity;
  has_last_one: boolean;
  created_at: string;
}

export interface TicketTx {
  id: number;
  delta: number;
  balance_after: number;
  kind: string;
  description: string;
  is_test: boolean;
  created_at: string;
}

export interface UserPrize {
  id: number;
  prize: Prize;
  source: "draw" | "last_one" | "admin";
  status: "owned" | "exchange_pending" | "exchanged";
  gacha_title: string | null;
  acquired_at: string;
  is_exchangeable: boolean;
  requires_shipping: boolean;
}

export interface Shipping {
  name: string;
  postal_code: string;
  prefecture: string;
  address1: string;
  address2: string;
  phone: string;
  note: string;
}

export interface Exchange {
  id: number;
  status: string;
  status_label: string;
  recipient_masked: string | null;
  carrier: string | null;
  tracking_number: string | null;
  admin_note: string | null;
  user_message: string | null;
  created_at: string;
  updated_at: string;
  items: { user_prize_id: number; prize: Prize }[];
}

export interface Offer {
  id: number;
  kind: "ad" | "survey" | "video";
  title: string;
  description: string;
  conditions: string;
  image_url: string | null;
  reward_tickets: number;
  estimated_minutes: number | null;
  is_test: boolean;
  earned_count: number;
  per_user_limit: number;
  ends_at: string | null;
  /** 動画リワード広告のみ：今日の視聴回数と 1 日の上限 */
  daily_used?: number | null;
  daily_limit?: number | null;
}

export interface Mission {
  id: number;
  kind: "campaign" | "achievement";
  title: string;
  description: string;
  reward_tickets: number;
  progress: number;
  target: number;
  claimed: boolean;
  claimable: boolean;
  ends_at: string | null;
}

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  published_at: string | null;
}

export interface ShopItem {
  id: number;
  name: string;
  brand: string;
  description: string;
  image_url: string | null;
  kind: "digital_code" | "shipping";
  point_cost: number;
  face_value_yen: number | null;
  stock_remaining: number | null;
  sold_out: boolean;
  /** ギフトコードの在庫があり、交換後すぐに受け取れる */
  instant: boolean;
  per_user_limit: number | null;
  ordered_count: number;
  limit_reached: boolean;
}

export interface ShopOrder {
  id: string;
  item_id: number;
  item_name: string;
  kind: "digital_code" | "shipping";
  point_cost: number;
  status: "pending" | "fulfilled" | "shipped" | "cancelled";
  status_label: string;
  image_url: string | null;
  gift_code: string | null;
  gift_code_expires_on: string | null;
  recipient_masked: string | null;
  carrier: string | null;
  tracking_number: string | null;
  admin_note: string | null;
  created_at: string;
  fulfilled_at: string | null;
  point_balance?: number;
}

export interface InviteInfo {
  invite_code: string;
  invited: number;
  completed: number;
  inviter_tickets: number;
  invitee_tickets: number;
}
