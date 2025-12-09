// Cloudflare environment bindings
export type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
}

// User types
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: number;
}

// Event types
export interface Event {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  event_date: string;
  cover_image: string | null;
  shareable_link: string;
  created_at: number;
}

// Message types
export interface Message {
  id: number;
  event_id: number;
  user_name: string | null;
  message_text: string;
  created_at: number;
}

// Contribution types
export interface Contribution {
  id: number;
  event_id: number;
  contributor_name: string | null;
  amount: number;
  created_at: number;
}

// Session types
export interface Session {
  id: number;
  user_id: number;
  session_token: string;
  expires_at: number;
  created_at: number;
}

// API Request/Response types
export interface CreateEventRequest {
  title: string;
  description?: string;
  event_date: string;
  cover_image?: string;
}

export interface CreateMessageRequest {
  event_id: number;
  user_name?: string;
  message_text: string;
}

export interface CreateContributionRequest {
  event_id: number;
  contributor_name?: string;
  amount: number;
}

export interface MagicLinkRequest {
  email: string;
  name?: string;
}

export interface VerifyMagicLinkRequest {
  token: string;
}

export interface EventWithStats extends Event {
  total_contributions: number;
  message_count: number;
  contribution_count: number;
}

export interface EventDetails extends Event {
  messages: Message[];
  contributions: Contribution[];
  total_contributions: number;
}
