/* ============================================================
   WILD SOJA: DJ BOOKING SETTINGS
   Clients never see prices. These numbers are used to work out the
   suggested quote you see in /admin for each booking request.
   ============================================================ */
(typeof window !== "undefined" ? window : globalThis).WN_CONFIG = {
  brand: {
    djName: "Wild Soja",
    company: "Wild Nation",
    email: "bookings.soja@gmail.com",
    phone: "+1 (365) 366-7490",
    instagram: "wld.ntn",
    homeBase: "Hamilton",
  },

  formEndpoint: "/api/bookings",
  currency: "CAD",

  /* Booking requests are emailed here, and deposits go here by Interac e-Transfer. */
  bookingEmail: "bookings.soja@gmail.com",
  deposit: 100,            // $ deposit to lock in a date (e-Transfer to bookingEmail)

  /* Booking contract & invoice. These fill in the terms clients agree to (see lib/contract.js). */
  contract: {
    businessName: "Wild Nation Events (DJ Wild Soja)",
    city: "Hamilton, Ontario",
    balanceDue: "on the day of the event, before the performance starts",
    cancelFullBalanceDays: 14,   // cancelling within this many days: 50% of the remaining balance is owed
    rescheduleNoticeDays: 14,    // date changes requested at least this far ahead keep the deposit (once)
    rescheduleWithinMonths: 12,  // the new date must be within this many months
    arriveMinutesBefore: 60,     // setup time before start
    mealHours: 5,                // events this long or longer: a meal/break for the DJ
    hst: { registered: false, rate: 13, number: "" }, // set registered: true and your number once you charge HST
  },

  /* Show the client a rough estimate at the bottom of the form (final price comes from you). */
  showEstimate: true,

  /* ---- DJ rate ---- */
  hourlyRate: 100,         // default $ per hour; each event type below can set its own `rate`
  floorRate: 75,           // discounts never take DJ time below this $ per hour
  defaultHours: 4,
  minimumHours: 2,
  maximumHours: 10,
  referralPercent: 15,     // % off DJ time when the client was referred (you can change it per booking in /admin)
  discountOptions: [0, 10, 15, 20, 25],

  /* ---- Minimum to leave the house ----
     A quote is never lower than this, even after a referral discount. */
  minimums: {
    hamilton: 200,         // e.g. a 2-hour private event in Hamilton
    outside: 250,          // anywhere outside Hamilton (St. Catharines, Toronto…). A city can override with `min`.
  },

  /* ---- Sound: the crowd decides the gear ----
     Picked from the guest count. Skipped if the venue has its own sound system. */
  soundTiers: [
    { upTo: 80, label: "1 speaker", price: 0 },
    { upTo: 150, label: "2 speakers", price: 50 },
    { upTo: 250, label: "2 speakers + subwoofer", price: 100 },
    { upTo: Infinity, label: "Full PA system", price: 150 },
  ],
  /* Guest ranges shown on the form (value = top of the range). */
  guestRanges: [
    { value: 50, label: "Under 50" },
    { value: 80, label: "50 – 80" },
    { value: 150, label: "81 – 150" },
    { value: 250, label: "151 – 250" },
    { value: 500, label: "More than 250" },
  ],

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

  /* Rate per event type.
     rate        $ per hour of DJ time
     extra       flat add-on with its own label (e.g. wedding planning)
     noReferral  referral discount doesn't apply (paid club events)
     custom      no estimate: you build the quote yourself */
  eventTypes: {
    wedding: { label: "Wedding", rate: 125, extra: 150, extraLabel: "Wedding planning, timeline & MC prep" },
    birthday: { label: "Birthday party", rate: 90 },
    private: { label: "Private / house party", rate: 90 },
    corporate: { label: "Corporate event", rate: 125 },
    club: { label: "Club, bar or lounge", rate: 100, noReferral: true },
    school: { label: "School, prom or formal", rate: 110 },
    community: { label: "Church or community event", rate: 90 },
    festival: { label: "Festival or concert", rate: 125 },
    production: { label: "Full event sound & entertainment", custom: true },
    other: { label: "Something else", rate: 100 },
  },

  /* Microphones: the client picks how many. */
  mics: [
    { count: 0, label: "No mic", price: 0 },
    { count: 1, label: "1 microphone", price: 25 },
    { count: 2, label: "2 microphones", price: 50 },
  ],

  /* Extras the client can tick. */
  extras: [
    { name: "Lighting", price: 50 },
    { name: "MC / hosting", price: 50 },
  ],
};
if (typeof module !== "undefined") module.exports = globalThis.WN_CONFIG || window.WN_CONFIG;
