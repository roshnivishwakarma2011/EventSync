"use client";

import { handle } from "./flask-adapter";

/* Client-side API helper + shared types/formatters used across the UI. */

export type ApiResult<T = any> = {
  ok: boolean;
  data?: T;
  message?: string;
  error?: { code: string; message: string };
};

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  // All calls go through the adapter, which talks to the Flask backend.
  return handle(path, opts.method ?? "GET", opts.body) as Promise<ApiResult<T>>;
}

export interface Category {
  id: number; name: string; slug: string; icon: string; color: string; eventCount?: number;
}
export interface EventLocation { id: string; venue: string; address: string; city: string; lat: number | null; lng: number | null; }
export interface ViewerCtx {
  registered: boolean; registrationStatus: string | null; registrationId: string | null;
  qrToken: string | null; favorited: boolean; waitlisted: boolean; waitlistPosition: number | null;
}
export interface EventItem {
  id: string; title: string; description: string; requirements: string; bannerUrl: string;
  eventDate: string; startTime: string; endTime: string; capacity: number; price: number; mode: string;
  status: string; rawStatus: string; views: number;
  category: Category | null; location: EventLocation | null;
  organizerName: string; organizerId: string;
  registeredCount: number; seatsLeft: number; avgRating: number | null; ratingCount: number;
  viewer: ViewerCtx | null; createdAt: string;
  recommendReason?: string; recommendScore?: number;
}
export interface ScheduleItem { id: string; title: string; description: string; startTime: string; endTime: string | null; sortOrder: number; }
export interface Speaker { id: string; name: string; designation: string; bio: string; photoUrl: string; }
export interface FeedbackItem { id: string; rating: number; comment: string; createdAt: string; userName: string; }
export interface MemoryItem { id: string; mediaUrl: string; caption: string; createdAt: string; eventId?: string; eventTitle?: string; eventDate?: string; attended?: boolean; }
export interface Interest { id: number; name: string; slug: string; }
export interface SessionUser {
  id: string; name: string; email: string; avatarUrl: string | null; role: "USER" | "ORGANIZER" | "ADMIN";
  authProvider?: string;
  points?: number; level?: { level: number; name: string; points: number; nextAt: number | null; nextName: string | null; progress: number };
  interests?: Interest[]; unreadNotifications?: number;
  gender?: string; dob?: string; phone?: string; phoneVerified?: boolean; emailVerified?: boolean;
}

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return { day: String(d.getDate()).padStart(2, "0"), month: MONTHS[d.getMonth()], year: d.getFullYear(), weekday: d.toLocaleDateString("en-US", { weekday: "short" }) };
}

export function formatLongDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

export function timeAgo(iso: string | Date) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
export { uploadEventImage, uploadMemory } from "./flask-adapter";