const YELP_KEY       = import.meta.env.VITE_YELP_API_KEY;
const ANTHROPIC_KEY  = import.meta.env.VITE_ANTHROPIC_API_KEY;

// Yelp Fusion — searches for delivery restaurants by cuisine in Manhattan
export async function findRestaurantYelp(cuisineLabel) {
  try {
    const params = new URLSearchParams({
      term:       `${cuisineLabel} restaurant`,
      location:   "Manhattan, New York, NY",
      categories: "delivery",
      limit:      "10",
      sort_by:    "rating",
    });

    const res = await fetch(`/yelp/v3/businesses/search?${params}`, {
      headers: { Authorization: `Bearer ${YELP_KEY}` },
    });

    if (!res.ok) throw new Error("Yelp request failed");

    const data = await res.json();
    const businesses = data.businesses?.filter(b => !b.is_closed) ?? [];
    if (businesses.length === 0) return null;

    // Pick randomly from top 5 so it's not always #1
    const pick = businesses.slice(0, 5)[Math.floor(Math.random() * Math.min(5, businesses.length))];

    return {
      name:         pick.name,
      neighborhood: pick.location?.neighborhood?.[0] ?? pick.location?.city ?? null,
      rating:       pick.rating,
      reviewCount:  pick.review_count,
      url:          pick.url,  // yelp page link
      // Deep link attempts — UberEats/DoorDash don't have public search APIs
      // but we can construct a search URL as a best-effort
      uberEatsUrl:  `https://www.ubereats.com/search?q=${encodeURIComponent(pick.name + " " + (pick.location?.city ?? "Manhattan"))}`,
      doorDashUrl:  `https://www.doordash.com/search/store/${encodeURIComponent(pick.name)}/`,
      fromApi:      true,
      source:       "yelp",
    };
  } catch (err) {
    console.warn("Yelp failed, falling back to Anthropic:", err.message);
    return findRestaurantAI(cuisineLabel);
  }
}

// Anthropic fallback — used if Yelp key is missing or call fails
async function findRestaurantAI(cuisineLabel) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            ANTHROPIC_KEY,
        "anthropic-version":    "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 200,
        tools:      [{ type: "web_search_20250305", name: "web_search" }],
        messages:   [{
          role:    "user",
          content: `Find ONE well-known ${cuisineLabel} restaurant in Manhattan NYC that delivers. Reply ONLY with valid JSON, no markdown: {"name":"Restaurant Name","neighborhood":"Neighborhood"}`,
        }],
      }),
    });

    const data  = await res.json();
    const text  = (data.content ?? []).filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.match(/\{[^}]+\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.name) return {
        ...parsed,
        uberEatsUrl: `https://www.ubereats.com/search?q=${encodeURIComponent(parsed.name + " Manhattan")}`,
        doorDashUrl: `https://www.doordash.com/search/store/${encodeURIComponent(parsed.name)}/`,
        fromApi: true,
        source:  "ai",
      };
    }
  } catch (err) {
    console.warn("Anthropic fallback failed:", err.message);
  }
  return null;
}

export const findRestaurant = YELP_KEY ? findRestaurantYelp : findRestaurantAI;
