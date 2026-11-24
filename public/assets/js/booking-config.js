/* ============================================================
   WILD NATION / WILD SOJA — SITE + PRICING CONFIG
   Edit this file to change your prices, contact info and how
   booking requests reach you. No other code changes needed.
   ============================================================ */
(typeof window !== "undefined" ? window : globalThis).WN_CONFIG = {
  brand: {
    djName: "Wild Soja",
    company: "Wild Nation",
    email: "wildnationgta@gmail.com",
    phone: "+1 (365) 366-7490",
    instagram: "wld.ntn",
    city: "Toronto & Hamilton (GTA)",
  },

  /* Booking requests are saved by the server and show up in /admin.
     Set OWNER_EMAIL on the server to also get an email for each one. */
  formEndpoint: "/api/bookings",

  currency: "CAD",
  depositPercent: 30,          // % deposit to lock the date
  includedHours: 4,            // hours included in each base price

  /* Base price per event type (includes `includedHours` of DJ time). */
  eventTypes: {
    wedding:   { label: "Wedding",                 base: 1200, hourly: 200 },
    corporate: { label: "Corporate / Brand event", base: 1000, hourly: 175 },
    private:   { label: "Private party",           base: 600,  hourly: 125 },
    birthday:  { label: "Birthday / Sweet 16",     base: 550,  hourly: 125 },
    school:    { label: "School / Prom / Formal",  base: 800,  hourly: 150 },
    club:      { label: "Club / Bar / Lounge",     base: 400,  hourly: 100 },
    festival:  { label: "Festival / Concert",      base: 1500, hourly: 250 },
    other:     { label: "Something else",          base: 700,  hourly: 150 },
  },

  /* Extra cost based on guest count (bigger crowd = bigger rig). */
  guestTiers: [
    { max: 75,       add: 0,   label: "Up to 75" },
    { max: 150,      add: 100, label: "76 – 150" },
    { max: 300,      add: 250, label: "151 – 300" },
    { max: 600,      add: 450, label: "301 – 600" },
    { max: Infinity, add: 750, label: "600+" },
  ],

  /* Optional add-ons the client can tick. */
  addOns: {
    sound:     { label: "Full sound system (PA + subs)", price: 250, note: "Skip if the venue has house sound" },
    lighting:  { label: "Dance floor lighting",          price: 200 },
    uplight:   { label: "Venue uplighting (12 fixtures)",price: 300 },
    mc:        { label: "MC / hosting & announcements",  price: 150 },
    mic:       { label: "Extra wireless mic",            price: 50 },
    ceremony:  { label: "Ceremony audio setup",          price: 250, note: "Weddings: separate area for vows" },
    sparks:    { label: "Cold spark machines (pair)",    price: 400 },
    haze:      { label: "Fog / haze",                    price: 75 },
    edits:     { label: "Custom intro / entrance edits", price: 100 },
  },

  /* Travel zones measured from home base. */
  travelZones: {
    local:  { label: "Local (under 40 km)", add: 0 },
    near:   { label: "40 – 80 km",          add: 100 },
    far:    { label: "80 – 160 km",         add: 225 },
    travel: { label: "160+ km / out of province", add: null }, // null = custom quote
  },

  /* Date-based adjustments (percent of subtotal). */
  surcharges: {
    weekendPercent: 10,  // Friday & Saturday
    rushPercent: 15,     // booked less than rushDays out
    rushDays: 14,
    holidayPercent: 50,  // dates listed below
    holidays: ["12-31", "12-24", "12-25", "07-04", "10-31"], // MM-DD
  },

  minimumHours: 2,
  maximumHours: 12,
};
if (typeof module !== "undefined") module.exports = globalThis.WN_CONFIG || window.WN_CONFIG;
