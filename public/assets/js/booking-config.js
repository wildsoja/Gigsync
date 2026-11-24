/* ============================================================
   WILD SOJA: DJ BOOKING SETTINGS
   Clients never see prices. These numbers are used to work out the
   suggested quote you see in /admin for each booking request.
   ============================================================ */
(typeof window !== "undefined" ? window : globalThis).WN_CONFIG = {
  brand: {
    djName: "Wild Soja",
    company: "Wild Nation",
    email: "wildnationgta@gmail.com",
    phone: "+1 (365) 366-7490",
    instagram: "wld.ntn",
    homeBase: "Hamilton",
  },

  formEndpoint: "/api/bookings",
  currency: "CAD",

  /* ---- DJ rate ---- */
  hourlyRate: 100,         // $ per hour (4 hours = $400)
  defaultHours: 4,
  minimumHours: 2,
  maximumHours: 10,
  referralDiscount: 50,    // $ off when the client was referred (4 hours: $400 → $350)

  /* ---- Travel from Hamilton ----
     Charge = round-trip km × cost per km, rounded UP to the nearest `roundTo`.
     Cost per km = fuel (price × litres per 100 km ÷ 100) + wear on the vehicle.
     At $1.60/L and 11 L/100 km: 17.6¢ fuel + 5¢ wear ≈ 22.6¢/km.
     Update `fuelPrice` when gas changes. */
  travel: {
    fuelPrice: 1.60,        // $ per litre
    litresPer100km: 11,     // loaded vehicle with DJ gear
    wearPerKm: 0.05,        // tires, maintenance, depreciation
    roundTo: 5,
    // One-way driving distance from central Hamilton (km). `extra` = parking/traffic.
    cities: [
      { name: "Hamilton (incl. Stoney Creek, Ancaster, Dundas, Waterdown)", km: 0 },
      { name: "Burlington", km: 18 },
      { name: "Caledonia", km: 22 },
      { name: "Grimsby", km: 33 },
      { name: "Oakville", km: 35 },
      { name: "Milton", km: 35 },
      { name: "Brantford", km: 40 },
      { name: "Lincoln / Beamsville", km: 40 },
      { name: "Cambridge", km: 45 },
      { name: "Guelph", km: 50 },
      { name: "Mississauga", km: 50 },
      { name: "St. Catharines", km: 52 },
      { name: "Toronto: Etobicoke", km: 55, extra: 15 },
      { name: "Kitchener / Waterloo", km: 60 },
      { name: "Brampton", km: 60 },
      { name: "Welland", km: 65 },
      { name: "Toronto: Downtown / Midtown", km: 70, extra: 15 },
      { name: "Niagara-on-the-Lake", km: 70 },
      { name: "Niagara Falls", km: 72 },
      { name: "Vaughan", km: 75 },
      { name: "Toronto: North York", km: 80, extra: 15 },
      { name: "Fort Erie", km: 90 },
      { name: "Toronto: Scarborough", km: 90, extra: 15 },
      { name: "Markham / Richmond Hill", km: 95 },
      { name: "Somewhere else", km: null }, // you quote travel yourself
    ],
  },

  eventTypes: {
    wedding: { label: "Wedding" },
    birthday: { label: "Birthday party" },
    private: { label: "Private / house party" },
    corporate: { label: "Corporate event" },
    club: { label: "Club, bar or lounge" },
    school: { label: "School, prom or formal" },
    community: { label: "Church or community event" },
    festival: { label: "Festival or concert" },
    other: { label: "Something else" },
  },

  /* Extras the client can ask about (no prices shown; you quote them). */
  extras: ["Sound system", "Lighting", "MC / hosting", "Wireless mic"],
};
if (typeof module !== "undefined") module.exports = globalThis.WN_CONFIG || window.WN_CONFIG;
