import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  messages: defineTable({
    userId: v.id("users"),
    content: v.string(),
    role: v.string(),
    timestamp: v.number(),
    language: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  
  responses: defineTable({
    pattern: v.string(),
    response: v.string(),
    userId: v.optional(v.id("users")),
    uses: v.number(),
    rating: v.number(),
    source: v.string(),
    url: v.optional(v.string()),
  }).index("by_pattern", ["pattern"])
    .index("by_rating", ["rating"])
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
