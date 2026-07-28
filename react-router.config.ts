import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // GitHub Pages only serves static files, so this app runs as an SPA.
  ssr: false,
  // Deployed as a GitHub Pages project site, served from /pa-webapp/ instead of /.
  basename: "/pa-webapp/",
} satisfies Config;
