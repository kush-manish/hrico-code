/**
 * The HFT / prop-trading / quant hub catalogue: locations, firms, the
 * interview loop each firm runs for software engineers, the topics it leans
 * on and LeetCode-style questions that match. Process notes are condensed
 * from public candidate reports and change between cycles, so the UI labels
 * them as "reported". Pay is not stored here: levels.js reads it live.
 */

/** Countries → cities, each with the levels.fyi location slug used for pay. */
export const LOCATIONS = [
  { country: 'United Kingdom', code: 'GB', flag: '🇬🇧', cities: [{ id: 'london', name: 'London', levels: 'london-metro-area', currency: 'GBP' }] },
  { country: 'Netherlands', code: 'NL', flag: '🇳🇱', cities: [{ id: 'amsterdam', name: 'Amsterdam', levels: 'greater-amsterdam-area', currency: 'EUR' }] },
  { country: 'Ireland', code: 'IE', flag: '🇮🇪', cities: [{ id: 'dublin', name: 'Dublin', levels: 'greater-dublin-area', currency: 'EUR' }] },
  { country: 'Switzerland', code: 'CH', flag: '🇨🇭', cities: [{ id: 'zurich', name: 'Zurich / Zug / Geneva', levels: 'greater-zurich-area', currency: 'CHF' }] },
  { country: 'France', code: 'FR', flag: '🇫🇷', cities: [{ id: 'paris', name: 'Paris', levels: 'greater-paris-area', currency: 'EUR' }] },
  { country: 'United States', code: 'US', flag: '🇺🇸', cities: [
    { id: 'nyc', name: 'New York', levels: 'new-york-city-area', currency: 'USD' },
    { id: 'chicago', name: 'Chicago', levels: 'greater-chicago-area', currency: 'USD' },
  ] },
  { country: 'Singapore', code: 'SG', flag: '🇸🇬', cities: [{ id: 'singapore', name: 'Singapore', levels: 'singapore', currency: 'SGD' }] },
  { country: 'Hong Kong', code: 'HK', flag: '🇭🇰', cities: [{ id: 'hongkong', name: 'Hong Kong', levels: 'hong-kong-sar', currency: 'HKD' }] },
  { country: 'Australia', code: 'AU', flag: '🇦🇺', cities: [{ id: 'sydney', name: 'Sydney', levels: 'australia', currency: 'AUD' }] },
];

export const cityById = id => LOCATIONS.flatMap(c => c.cities.map(x => ({ ...x, country: c.country, flag: c.flag }))).find(c => c.id === id);

/*
 * type: market-maker | hft | quant-fund | multi-strat | crypto
 * tier: 1 = top-of-market pay & bar, 2 = strong, 3 = good entry point
 * sde: how a senior SWE (SDE3 / VP-level) is typically assessed
 * topics: what the SWE loop leans on; coding: LeetCode slugs that match
 */
export const FIRMS = [
  {
    id: 'optiver', name: 'Optiver', levels: 'optiver', type: 'market-maker', tier: 1,
    cities: ['amsterdam', 'london', 'chicago', 'sydney', 'singapore', 'hongkong'],
    hq: 'Amsterdam', langs: ['C++', 'Python', 'C#'],
    blurb: 'Options market maker. Amsterdam HQ; SWE work spans ultra-low-latency C++ trading systems, pricing, and Python research tooling.',
    process: [
      'Online assessment: 80-in-8 mental math (traders) / HackerRank coding + Zap-N games for many SWE pipelines.',
      'Recruiter / HR screen: motivation for trading, why Optiver.',
      'Technical 1: C++ / systems deep-dive (memory, cache, concurrency, lock-free basics) or language of the team.',
      'Technical 2: live coding — data structures with a trading flavour (order book, rate limiter, LRU).',
      'System design (senior): low-latency market data / order gateway, failure handling, back-pressure.',
      'Final: culture + team-match; fast decision, often same week.',
    ],
    topics: ['C++ memory model, move semantics, templates', 'Cache-friendly data structures', 'Concurrency: mutex vs atomics, lock-free queue', 'Order book & matching', 'Latency measurement / profiling', 'Mental math + probability (trader track)'],
    coding: ['lru-cache', 'lfu-cache', 'time-based-key-value-store', 'find-median-from-data-stream', 'sliding-window-maximum', 'online-stock-span', 'insert-delete-getrandom-o1', 'merge-k-sorted-lists', 'min-stack', 'task-scheduler'],
    practice: ['p80', 'number-logic', 'code-compare', 'switch', 'balloon'],
    careers: 'https://optiver.com/working-at-optiver/career-opportunities/',
  },
  {
    id: 'imc', name: 'IMC Trading', levels: 'imc', type: 'market-maker', tier: 1,
    cities: ['amsterdam', 'chicago', 'sydney', 'hongkong', 'london'],
    hq: 'Amsterdam', langs: ['C++', 'Java', 'Python'],
    blurb: 'Market maker with a big Amsterdam engineering hub. Java and C++ trading platforms, FPGA, strong engineering culture.',
    process: [
      'Online coding test (HackerRank / Codility, 2–3 problems, ~90 min).',
      'Phone screen: CV deep-dive + 1 coding question.',
      'Onsite (virtual): 3–4 rounds — coding, low-level / Java internals or C++, system design, behavioural.',
      'Seniors: design of a market-data or risk system; trade-offs for latency vs throughput.',
    ],
    topics: ['Java GC, JIT, off-heap / zero-allocation', 'C++ performance', 'Networking (TCP vs UDP multicast)', 'Concurrency', 'Data structures & complexity', 'Distributed systems basics'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'top-k-frequent-elements', 'course-schedule', 'network-delay-time', 'meeting-rooms-ii', 'sliding-window-maximum', 'basic-calculator-ii'],
    practice: ['p80', 'number-logic'],
    careers: 'https://www.imc.com/eu/careers/jobs',
  },
  {
    id: 'flow', name: 'Flow Traders', levels: 'flow-traders', type: 'market-maker', tier: 2,
    cities: ['amsterdam', 'singapore', 'hongkong', 'nyc', 'london'],
    hq: 'Amsterdam', langs: ['C++', 'C#', 'Python'],
    blurb: 'ETP / ETF market maker. Amsterdam HQ; C#/.NET and C++ trading stack, pragmatic engineering.',
    process: [
      'Online assessment: numerical + logical reasoning; coding test for SWE.',
      'Technical interview: C#/C++ fundamentals + coding.',
      'Case / design round: build part of a trading tool; seniors design a pricing or hedging service.',
      'Final with team leads; culture fit.',
    ],
    topics: ['C# / .NET performance', 'OOP design & SOLID', 'ETF pricing basics (NAV, creation/redemption)', 'Concurrency', 'SQL & data'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'meeting-rooms-ii', 'evaluate-division', 'min-stack', 'implement-trie-prefix-tree'],
    practice: ['p80', 'number-logic'],
    careers: 'https://www.flowtraders.com/careers',
  },
  {
    id: 'da-vinci', name: 'Da Vinci Trading', levels: 'da-vinci-derivatives', type: 'market-maker', tier: 2,
    cities: ['amsterdam'], hq: 'Amsterdam', langs: ['C++', 'Python'],
    blurb: 'Amsterdam options market maker; small teams, high ownership, strong C++.',
    process: ['Online test: math + coding.', 'Technical rounds: C++ and algorithms.', 'Final day with traders and engineers.'],
    topics: ['C++', 'Algorithms', 'Probability', 'Options basics'],
    coding: ['lru-cache', 'sliding-window-maximum', 'find-median-from-data-stream', 'merge-k-sorted-lists'],
    practice: ['p80', 'number-logic'], careers: 'https://www.davincitrading.com/careers/',
  },
  {
    id: 'all-options', name: 'All Options', levels: 'all-options', type: 'market-maker', tier: 3,
    cities: ['amsterdam'], hq: 'Amsterdam', langs: ['C++', 'C#', 'Python'],
    blurb: 'Amsterdam derivatives market maker; good entry point to the Dutch trading scene.',
    process: ['Online test.', 'Technical interview + coding.', 'Final with team.'],
    topics: ['C++ / C#', 'Algorithms', 'Options basics'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'min-stack'],
    practice: ['p80'], careers: 'https://www.alloptions.com/careers',
  },
  {
    id: 'jane-street', name: 'Jane Street', levels: 'jane-street', type: 'market-maker', tier: 1,
    cities: ['london', 'nyc', 'hongkong', 'singapore', 'amsterdam'],
    hq: 'New York', langs: ['OCaml'],
    blurb: 'Global market maker; almost everything in OCaml. Interviews are collaborative and probe how you think, not trivia.',
    process: [
      'Phone screen: 1 hour, one open-ended coding problem, extended in steps.',
      'Onsite: 3–5 rounds of open-ended coding (any language), each problem grows with follow-ups.',
      'Focus on clean abstractions, testing, and talking through trade-offs.',
      'No OCaml needed; functional-programming comfort is a plus.',
    ],
    topics: ['Clean API / abstraction design', 'Recursion, trees, functional style', 'Testing & edge cases', 'Probability puzzles (lighter for SWE)', 'Interpreters / parsers'],
    coding: ['basic-calculator-ii', 'serialize-and-deserialize-binary-tree', 'evaluate-division', 'implement-trie-prefix-tree', 'snapshot-array', 'word-ladder', 'decode-ways'],
    practice: ['number-logic'], careers: 'https://www.janestreet.com/join-jane-street/open-roles/',
  },
  {
    id: 'citadel', name: 'Citadel / Citadel Securities', levels: 'citadel', type: 'multi-strat', tier: 1,
    cities: ['london', 'nyc', 'chicago', 'zurich', 'paris', 'singapore', 'hongkong', 'dublin'],
    hq: 'Miami', langs: ['C++', 'Python', 'Java'],
    blurb: 'Hedge fund + market maker. Top-of-market pay; intense, high-bar loops. London is a major hub.',
    process: [
      'HackerRank online assessment (2–3 hard problems).',
      'Phone screens: 1–2 coding rounds (LeetCode medium/hard).',
      'Onsite: 4–6 rounds — coding, C++/low-level, system design, behavioural with senior leaders.',
      'Seniors: design a real-time risk or market-data system; deep-dive on your past systems.',
    ],
    topics: ['LeetCode medium-hard', 'C++ internals', 'System design at scale', 'Concurrency', 'Linux / networking', 'Ownership & impact stories'],
    coding: ['median-of-two-sorted-arrays', 'merge-k-sorted-lists', 'lru-cache', 'lfu-cache', 'trapping-rain-water', 'count-of-smaller-numbers-after-self', 'minimum-window-substring', 'cheapest-flights-within-k-stops', 'max-points-on-a-line'],
    practice: ['number-logic'], careers: 'https://www.citadelsecurities.com/careers/',
  },
  {
    id: 'hrt', name: 'Hudson River Trading', levels: 'hudson-river-trading', type: 'hft', tier: 1,
    cities: ['london', 'nyc', 'singapore', 'hongkong', 'chicago'],
    hq: 'New York', langs: ['C++', 'Python'],
    blurb: 'Algorithmic HFT; very strong C++ and research engineering. Collaborative culture.',
    process: [
      'Online coding assessment.',
      'Phone screen: coding (C++ or Python) + CS fundamentals.',
      'Onsite: 4–5 rounds — algorithms, C++ deep-dive, systems / OS, design.',
    ],
    topics: ['C++17/20', 'OS: scheduling, memory, syscalls', 'Networking', 'Algorithms & complexity', 'Performance engineering'],
    coding: ['lru-cache', 'sliding-window-maximum', 'find-median-from-data-stream', 'merge-k-sorted-lists', 'insert-delete-getrandom-o1', 'rotting-oranges'],
    practice: ['number-logic'], careers: 'https://www.hudsonrivertrading.com/careers/',
  },
  {
    id: 'jump', name: 'Jump Trading', levels: 'jump-trading', type: 'hft', tier: 1,
    cities: ['london', 'chicago', 'nyc', 'singapore', 'amsterdam'],
    hq: 'Chicago', langs: ['C++', 'Python', 'FPGA'],
    blurb: 'Research-driven HFT; low-latency C++ and FPGA, big London office.',
    process: ['Online / phone coding screen.', 'Technical rounds: C++, algorithms, Linux / networking.', 'Design and team-match rounds.'],
    topics: ['C++ low latency', 'Linux kernel bypass, networking', 'Algorithms', 'Hardware awareness (cache, NUMA)'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'sliding-window-maximum', 'task-scheduler', 'network-delay-time'],
    practice: ['number-logic'], careers: 'https://www.jumptrading.com/careers/',
  },
  {
    id: 'xtx', name: 'XTX Markets', levels: 'xtx-markets', type: 'hft', tier: 1,
    cities: ['london', 'singapore', 'nyc', 'paris'],
    hq: 'London', langs: ['C++', 'Python', 'Rust'],
    blurb: 'London-HQ algorithmic market maker; ML-heavy research, huge compute. Very selective.',
    process: ['Online coding test.', 'Technical interviews: algorithms, C++/Python, systems.', 'Final: research/engineering leads.'],
    topics: ['Algorithms', 'C++ / Python performance', 'Distributed compute', 'ML infra basics'],
    coding: ['merge-k-sorted-lists', 'find-median-from-data-stream', 'top-k-frequent-elements', 'lru-cache', 'word-ladder'],
    practice: ['number-logic'], careers: 'https://www.xtxmarkets.com/careers/',
  },
  {
    id: 'gresearch', name: 'G-Research', levels: 'g-research', type: 'quant-fund', tier: 1,
    cities: ['london'], hq: 'London', langs: ['C#', 'C++', 'Python'],
    blurb: 'London quant research firm; large C#/.NET and Python platform engineering, ML infra.',
    process: ['Online coding test (HackerRank).', 'Technical phone screen.', 'Onsite: coding, design, C#/.NET or Python depth, behavioural.'],
    topics: ['C# / .NET internals', 'Distributed systems', 'Data engineering at scale', 'Algorithms'],
    coding: ['lru-cache', 'course-schedule', 'top-k-frequent-elements', 'merge-k-sorted-lists', 'time-based-key-value-store', 'snapshot-array'],
    practice: ['number-logic'], careers: 'https://www.gresearch.com/join-us/',
  },
  {
    id: 'two-sigma', name: 'Two Sigma', levels: 'two-sigma', type: 'quant-fund', tier: 1,
    cities: ['london', 'nyc'], hq: 'New York', langs: ['Java', 'Python', 'C++'],
    blurb: 'Tech-first quant fund; Java and Python platforms, strong distributed-systems culture.',
    process: ['HackerRank OA.', 'Phone screen: coding.', 'Onsite: 4–5 rounds — coding, system design, domain, behavioural.'],
    topics: ['Distributed systems', 'Java', 'Algorithms', 'Data pipelines'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'course-schedule', 'top-k-frequent-elements', 'serialize-and-deserialize-binary-tree'],
    practice: ['number-logic'], careers: 'https://careers.twosigma.com/',
  },
  {
    id: 'drw', name: 'DRW', levels: 'drw', type: 'market-maker', tier: 2,
    cities: ['london', 'chicago', 'nyc', 'singapore'], hq: 'Chicago', langs: ['C++', 'Java', 'Python'],
    blurb: 'Diversified prop firm (incl. crypto via Cumberland). Good London SWE presence.',
    process: ['OA / phone screen.', 'Technical rounds: coding + language depth.', 'System design for seniors; team match.'],
    topics: ['C++ / Java', 'System design', 'Concurrency', 'Algorithms'],
    coding: ['lru-cache', 'meeting-rooms-ii', 'merge-k-sorted-lists', 'time-based-key-value-store'],
    practice: ['number-logic'], careers: 'https://drw.com/work-at-drw/',
  },
  {
    id: 'tower', name: 'Tower Research Capital', levels: 'tower-research-capital', type: 'hft', tier: 2,
    cities: ['london', 'nyc', 'singapore'], hq: 'New York', langs: ['C++', 'Python'],
    blurb: 'HFT with many semi-independent trading teams; C++ low latency.',
    process: ['Online test.', 'Technical rounds: C++ and algorithms.', 'Team-specific final.'],
    topics: ['C++ low latency', 'Linux', 'Algorithms'],
    coding: ['lru-cache', 'sliding-window-maximum', 'merge-k-sorted-lists', 'min-stack'],
    practice: ['number-logic'], careers: 'https://www.tower-research.com/open-positions',
  },
  {
    id: 'sig', name: 'Susquehanna (SIG)', levels: 'susquehanna-international-group', type: 'market-maker', tier: 2,
    cities: ['dublin', 'london', 'nyc', 'amsterdam', 'hongkong', 'sydney'], hq: 'Philadelphia (EU: Dublin)', langs: ['C++', 'C#', 'Python'],
    blurb: 'Options market maker; Dublin is its European hub. Game-theory/poker flavoured trader interviews.',
    process: ['Online test (math / coding).', 'Phone screen.', 'Onsite: coding, design, probability (lighter for SWE).'],
    topics: ['C++ / C#', 'Algorithms', 'Probability & expected value', 'Options basics'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'merge-k-sorted-lists', 'random-pick-with-weight'],
    practice: ['p80', 'number-logic'], careers: 'https://sig.com/careers/',
  },
  {
    id: 'maven', name: 'Maven Securities', levels: 'maven-securities', type: 'market-maker', tier: 3,
    cities: ['london', 'hongkong'], hq: 'London', langs: ['C++', 'Python'],
    blurb: 'London prop trading / market maker; smaller, good ownership.',
    process: ['Online test.', 'Technical interviews.', 'Final.'],
    topics: ['C++', 'Python', 'Algorithms'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'min-stack'],
    practice: ['p80', 'number-logic'], careers: 'https://www.mavensecurities.com/careers/',
  },
  {
    id: 'squarepoint', name: 'Squarepoint Capital', levels: 'squarepoint-capital', type: 'quant-fund', tier: 2,
    cities: ['london', 'nyc', 'singapore', 'paris'], hq: 'London', langs: ['C++', 'Python'],
    blurb: 'Systematic quant fund; strong London presence.',
    process: ['HackerRank OA.', 'Technical rounds.', 'Final.'],
    topics: ['C++', 'Python', 'Data pipelines'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'top-k-frequent-elements'],
    practice: ['number-logic'], careers: 'https://www.squarepoint-capital.com/careers',
  },
  {
    id: 'qrt', name: 'Qube Research & Technologies', levels: 'qube-research-and-technologies', type: 'quant-fund', tier: 2,
    cities: ['london', 'paris', 'singapore', 'hongkong'], hq: 'London', langs: ['Python', 'C++'],
    blurb: 'Fast-growing quant fund; London + Paris engineering.',
    process: ['OA.', 'Technical interviews: Python/C++, algorithms.', 'Final.'],
    topics: ['Python performance', 'C++', 'Data engineering'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'merge-k-sorted-lists'],
    practice: ['number-logic'], careers: 'https://www.qube-rt.com/careers',
  },
  {
    id: 'millennium', name: 'Millennium', levels: 'millennium', type: 'multi-strat', tier: 2,
    cities: ['london', 'nyc', 'singapore', 'dublin'], hq: 'New York', langs: ['Python', 'C++', 'Java'],
    blurb: 'Multi-strategy fund; central tech plus pod-embedded engineering.',
    process: ['Phone screen.', 'Technical rounds: coding, design.', 'Pod / team interviews.'],
    topics: ['Python / Java', 'System design', 'Data'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'meeting-rooms-ii'],
    practice: ['number-logic'], careers: 'https://www.mlp.com/careers/',
  },
  {
    id: 'marshall-wace', name: 'Marshall Wace', levels: 'marshall-wace', type: 'quant-fund', tier: 2,
    cities: ['london'], hq: 'London', langs: ['Python', 'C#', 'Java'],
    blurb: 'London hedge fund with a large systematic (TOPS) engineering group.',
    process: ['Online test.', 'Technical interviews.', 'Final.'],
    topics: ['Python', 'C#', 'Data platforms'],
    coding: ['lru-cache', 'top-k-frequent-elements'],
    practice: ['number-logic'], careers: 'https://www.mwam.com/careers/',
  },
  {
    id: 'man-group', name: 'Man Group (AHL)', levels: 'man-group', type: 'quant-fund', tier: 3,
    cities: ['london'], hq: 'London', langs: ['Python'],
    blurb: 'London quant asset manager; Python-first, good work-life balance.',
    process: ['Coding test.', 'Technical interviews (Python heavy).', 'Final.'],
    topics: ['Python internals', 'Data engineering', 'Testing'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'merge-k-sorted-lists'],
    practice: ['number-logic'], careers: 'https://www.man.com/careers',
  },
  {
    id: 'quadrature', name: 'Quadrature Capital', levels: 'quadrature', type: 'quant-fund', tier: 2,
    cities: ['london'], hq: 'London', langs: ['C++', 'Python'],
    blurb: 'London systematic fund; strong engineering bar.',
    process: ['Online test.', 'Technical rounds.', 'Final.'],
    topics: ['C++', 'Python', 'Algorithms'],
    coding: ['lru-cache', 'merge-k-sorted-lists', 'sliding-window-maximum'],
    practice: ['number-logic'], careers: 'https://www.quadrature.ai/careers',
  },
  {
    id: 'wintermute', name: 'Wintermute', levels: 'wintermute', type: 'crypto', tier: 2,
    cities: ['london', 'singapore'], hq: 'London', langs: ['Python', 'Rust', 'C++'],
    blurb: 'London crypto market maker; fast-moving, Python + Rust.',
    process: ['Take-home or OA.', 'Technical interviews.', 'Final.'],
    topics: ['Python / Rust', 'Exchange connectivity, WebSockets', 'Market making basics'],
    coding: ['lru-cache', 'time-based-key-value-store', 'sliding-window-maximum'],
    practice: ['number-logic'], careers: 'https://www.wintermute.com/careers',
  },
  {
    id: 'akuna', name: 'Akuna Capital', levels: 'akuna-capital', type: 'market-maker', tier: 3,
    cities: ['chicago', 'sydney', 'amsterdam'], hq: 'Chicago', langs: ['C++', 'Python'],
    blurb: 'Options market maker; known HackerRank-heavy SWE pipeline.',
    process: ['HackerRank OA.', 'Technical phone.', 'Onsite.'],
    topics: ['C++', 'Python', 'Options basics'],
    coding: ['lru-cache', 'top-k-frequent-elements', 'merge-k-sorted-lists'],
    practice: ['number-logic'], careers: 'https://akunacapital.com/careers',
  },
  {
    // Neutral on purpose: the client adds the owner's "your baseline" wording
    // only for the admin account (see firmName/firmBlurb in public/hft-hub.js).
    id: 'jpmc', name: 'JPMorgan Chase', levels: 'jpmorgan-chase', type: 'bank', tier: 0,
    cities: ['london', 'nyc', 'dublin', 'paris', 'singapore', 'hongkong', 'sydney', 'zurich', 'amsterdam'],
    hq: 'New York', langs: ['Java', 'Python'],
    blurb: 'A large investment bank, shown as a big-bank pay baseline to compare trading-firm offers against.',
    process: [], topics: [], coding: [], practice: [], careers: '',
  },
];

export const TYPE_LABELS = {
  'market-maker': 'Market maker', hft: 'HFT', 'quant-fund': 'Quant fund', 'multi-strat': 'Multi-strategy fund', crypto: 'Crypto market maker', bank: 'Bank (baseline)',
};

/** Every firm/levels-location pair the hub can show pay for. */
export function payPairs() {
  const out = [];
  for (const f of FIRMS) for (const cid of f.cities) {
    const c = cityById(cid);
    if (c && f.levels) out.push([f.levels, c.levels]);
  }
  return out;
}
