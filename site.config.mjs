// Site-wide settings. Everything a launch decision changes lives here.
// BASE_URL can be overridden at build time: BASE_URL=https://thealmanac.ie/ npm run build
const customDomain = 'thealmanac.ie';                 // 'thealmanac.ie' once the domain is live: writes dist/CNAME and becomes the base URL

export default {
  brand: 'The Almanac',
  customDomain,
  baseUrl: process.env.BASE_URL || (customDomain ? `https://${customDomain}/` : 'https://thealmanac-ie.github.io/'), // a path prefix (https://x.github.io/repo/) works too
  lang: 'en-IE',
  locale: 'en_IE',                          // Open Graph locale
  timeZone: 'Europe/Dublin',
  tagline: 'Tides, sun, moon and weather, live and local, place by place.',
  dayPages: 30,                             // one tide page per day for this many days ahead (0 = none)
  minify: true,                             // minify the copied app JS and CSS with esbuild
  contactEmail: null,                       // TBD: a public address for corrections and pooled sightings
  repoUrl: null,                            // TBD: link to the public source repository from the About page
  verification: {                           // search-engine ownership tokens, added to the home page when set
    google: null,                           // <meta name="google-site-verification" content="…">
    bing: null,                             // <meta name="msvalidate.01" content="…">
  },
};
