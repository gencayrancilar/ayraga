export type ReportStatus =
  | "new" | "verified" | "forwarded" | "in_review"
  | "awaiting_resolution" | "resolved" | "unresolved"
  | "duplicate" | "rejected";

export type UserRole = "citizen" | "muhtar" | "moderator" | "admin";

export type ReportCard = {
  id: string;
  ref_code: string;
  slug: string;
  title: string;
  description: string | null;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  address: string | null;
  support_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  first_forwarded_at: string | null;
  first_response_at: string | null;
  user_id: string | null;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_icon: string;
  category_color: string;
  root_category_id: string;
  root_category_name: string;
  sla_days: number;
  neighborhood_id: string | null;
  neighborhood_name: string | null;
  neighborhood_slug: string | null;
  district_name: string | null;
  district_slug: string | null;
  city_name: string | null;
  city_slug: string | null;
  cover_path: string | null;
  resolution_path: string | null;
  media_count: number;
  awaiting_response_hours: number | null;
  resolution_days: number | null;
  distance_m?: number;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  weight: number;
  sla_days: number;
  sort_order: number;
  is_active: boolean;
  children?: Category[];
  open_count?: number;
};

export type ChainEvent = {
  id: string;
  seq: number;
  event_type:
    | "created" | "media_added" | "support_milestone" | "status_changed"
    | "authority_submitted" | "authority_reference_added" | "authority_responded"
    | "resolution_evidence" | "merged" | "moderated" | "note";
  summary: string;
  payload: Record<string, unknown>;
  actor_label: string | null;
  actor_name: string | null;
  occurred_at: string;
  hash: string;
  prev_hash: string | null;
};

export type Submission = {
  id: string;
  authority_id: string;
  authority_name: string;
  authority_short: string | null;
  authority_website: string | null;
  channel: string;
  reference_no: string | null;
  submitted_at: string;
  response_at: string | null;
  response_text: string | null;
  outcome: string | null;
  response_sla_days: number;
};

export type ScoreComponent = {
  burden: number;
  resolution_rate: number | null;
  speed: number | null;
};

export type ScoreCategory = {
  category_id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  available: boolean;
  score: number | null;
  open_count: number;
  overdue_count?: number;
  resolved_count: number;
  unresolved_count?: number;
  median_resolution_days: number | null;
  sla_days?: number;
  components?: ScoreComponent;
};

export type NeighborhoodScore =
  | {
      available: true;
      neighborhood_id: string;
      score: number;
      total_reports: number;
      confidence: "low" | "medium" | "high";
      window_days: number;
      population: number;
      population_estimated: boolean;
      categories: ScoreCategory[];
      computed_at: string;
    }
  | {
      available: false;
      reason: string;
      neighborhood_id?: string;
      categories?: ScoreCategory[];
      window_days?: number;
    };

export type PlatformStats = {
  total_reports: number;
  open_reports: number;
  resolved_reports: number;
  resolved_this_month: number;
  total_supports: number;
  forwarded_reports: number;
  avg_resolution_days: number | null;
};
