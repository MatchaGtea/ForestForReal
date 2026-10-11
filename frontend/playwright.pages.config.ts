import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'pages-tests',
  outputDir:'test-results-pages',
  use:{baseURL:process.env.PAGES_URL||'http://127.0.0.1:4173/ForestForReal/',headless:true,channel:process.env.CI?undefined:'chrome'},
  projects:[
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
    {name:'tablet',use:{viewport:{width:900,height:1000}}},
    {name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
  webServer:process.env.PAGES_URL?undefined:{
    command:'npm run build && npm run preview -- --port 4173 --strictPort',
    env:{VITE_DEMO_MODE:'true',VITE_BASE_PATH:'/ForestForReal/'},
    url:'http://127.0.0.1:4173/ForestForReal/',
    reuseExistingServer:!process.env.CI,
    timeout:120000,
  },
  reporter:'list',
});
