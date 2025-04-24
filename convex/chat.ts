import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal, api } from "./_generated/api";
import axios from "axios";
import * as cheerio from "cheerio";

// Types for web scraping
interface Pattern {
  text: string;
  tag: string;
}

// Add a new response pattern
export const trainBot = mutation({
  args: {
    pattern: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.insert("responses", {
      pattern: args.pattern.toLowerCase(),
      response: args.response,
      userId,
      uses: 0,
      rating: 0,
      source: "user",
    });
  },
});

// Web scraping training action
export const trainFromWeb = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.SCRAPING_API_KEY;
    if (!apiKey) throw new Error("Scraping API key not configured");

    try {
      // Use ScrapingBee to get the webpage content
      const response = await axios.get(`https://app.scrapingbee.com/api/v1`, {
        params: {
          api_key: apiKey,
          url: args.url,
          render_js: false,
        },
      });

      const $ = cheerio.load(response.data);
      const patterns: Pattern[] = [];

      // Extract paragraphs and headers
      $('p, h1, h2, h3, h4, h5, h6').each((_, element) => {
        const text = $(element).text().trim();
        if (text.length > 10 && text.length < 200) {
          patterns.push({
            text,
            tag: element.tagName,
          });
        }
      });

      // Store extracted patterns
      for (const pattern of patterns) {
        await ctx.runMutation(api.chat.storeWebPattern, {
          pattern: pattern.text,
          source: args.url,
        });
      }

      return { success: true, patternsFound: patterns.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
});

// Store patterns from web scraping
export const storeWebPattern = mutation({
  args: {
    pattern: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Extract a potential response from the pattern
    const sentences = args.pattern.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 2) return;

    // Use first sentence as pattern and rest as response
    const pattern = sentences[0].trim().toLowerCase();
    const response = sentences.slice(1).join('. ').trim();

    if (pattern.length < 10 || response.length < 10) return;

    await ctx.db.insert("responses", {
      pattern,
      response,
      uses: 0,
      rating: 0,
      source: "web",
      url: args.source,
    });
  },
});

// Rate a response
export const rateResponse = mutation({
  args: {
    responseId: v.id("responses"),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const response = await ctx.db.get(args.responseId);
    if (!response) return;

    await ctx.db.patch(args.responseId, {
      rating: (response.rating + args.rating) / 2, // Average rating
    });
  },
});

async function findBestResponse(ctx: any, input: string): Promise<string> {
  const lowerInput = input.toLowerCase();
  
  // Search for matching patterns
  const responses = await ctx.db
    .query("responses")
    .withIndex("by_pattern")
    .filter((q: any) => q.gte("rating", 0))
    .collect();

  let bestMatch = null;
  let bestScore = 0;

  for (const response of responses) {
    // Simple word matching score
    const words = response.pattern.split(" ");
    const inputWords = lowerInput.split(" ");
    
    let matchScore = 0;
    for (const word of words) {
      if (inputWords.includes(word)) {
        matchScore++;
      }
    }
    
    // Weight by rating, usage, and source
    const sourceBonus = response.source === "web" ? 0.8 : 1; // Slightly prefer user-trained responses
    const finalScore = matchScore * (1 + response.rating/5) * (1 + Math.log(response.uses + 1)) * sourceBonus;
    
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMatch = response;
    }
  }

  if (bestMatch) {
    // Increment usage counter
    await ctx.db.patch(bestMatch._id, {
      uses: bestMatch.uses + 1,
    });
    return bestMatch.response;
  }

  return "I don't know how to respond to that yet. You can teach me using /train pattern | response or /learn URL";
}

export const sendMessage = mutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Store user message
    await ctx.db.insert("messages", {
      userId,
      content: args.content,
      role: "user",
      timestamp: Date.now(),
    });

    // Check if it's a training command
    if (args.content.startsWith("/train")) {
      const parts = args.content.slice(7).split("|").map(p => p.trim());
      if (parts.length === 2) {
        await ctx.db.insert("responses", {
          pattern: parts[0].toLowerCase(),
          response: parts[1],
          userId,
          uses: 0,
          rating: 0,
          source: "user",
        });
        
        // Store success message
        await ctx.db.insert("messages", {
          userId,
          content: "Thanks! I've learned that new response pattern.",
          role: "assistant",
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Check if it's a web learning command
    if (args.content.startsWith("/learn ")) {
      const url = args.content.slice(7).trim();
      if (url.startsWith("http")) {
        // Create a new action to handle web scraping
        await ctx.db.insert("messages", {
          userId,
          content: "Learning from URL...",
          role: "assistant",
          timestamp: Date.now(),
        });

        // Schedule the web scraping action
        await ctx.scheduler.runAfter(0, api.chat.trainFromWeb, { url });
        return;
      }
    }

    // Generate response
    const response = await findBestResponse(ctx, args.content);
    
    // Store bot response
    await ctx.db.insert("messages", {
      userId,
      content: response,
      role: "assistant",
      timestamp: Date.now(),
    });
  },
});

export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("asc")
      .collect();
  },
});

export const listTraining = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("responses")
      .order("desc")
      .collect();
  },
});
