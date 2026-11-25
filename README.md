# hrico-code (`interview-sim`)

An open-source technical interview preparation and interactive algorithm learning platform built with Node.js, Express, and browser-based JavaScript/Python runners.

## Features

- **Interactive Coding & Execution:** Local in-browser JavaScript and Python execution runners with test cases and step-by-step debugging.
- **Execution Traces & Visuals:** Step-by-step algorithm trace visualizers, animations, and structured walkthroughs.
- **Interview Prep Modules:** Coding practice, system design, behavioral interview prep, resume parsing (`.docx` / `.pdf`), and HFT/DSA problem catalogs.
- **Express Backend (`server/`):** Modular Node.js (ESM) API with security headers (`helmet`), rate limiting (`express-rate-limit`), and configurable admin/plan controls.

## Requirements

- Node.js `>= 20`

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/kush-manish/hrico-code.git
   cd hrico-code
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Default port is `5178` (`PORT=5178`).

3. Start the server:
   ```bash
   npm start
   # or with watch mode for development:
   npm run dev
   ```

## Scripts

- `npm start` — Run the production server (`node server/index.js`)
- `npm run dev` — Run with Node.js watch mode
- `npm test` — Run the Node test suite (`node --test test/*.test.js`)
- `npm run build:shorts` — Build short execution trace assets (`node scripts/build-short-traces.mjs`)