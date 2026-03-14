/* ============================================
   MAYOR FOR THE COMMON GOOD — game.js
   Mayor selection screen + game state system
   ============================================ */

'use strict';

// ── MAYOR ROSTER ─────────────────────────────────────────────────────────────
//
//  Each entry defines the portrait filename, display name, a short flavour
//  tagline, and the six starting stat values for that mayor archetype.

const MAYORS = [
  {
    id:       'businessleader',
    name:     'Business Leader',
    tag:      'Drives growth through enterprise & investment',
    portrait: 'sprites/mayors/mayor_businessleader.png',
    stats: { faith: 25, economy: 50, people: 30, environment: 20, justice: 25, infrastructure: 40 },
    traits: {
      bonus:   { stat: 'economy',     amount: 1, label: '+1 Economy on every decision' },
      penalty: { stat: 'environment', amount: 1, label: '-1 Environment on every decision' }
    }
  },
  {
    id:       'environmental',
    name:     'Environmentalist',
    tag:      'Puts the planet first in every decision',
    portrait: 'sprites/mayors/mayor_environmental.png',
    stats: { faith: 35, economy: 20, people: 32, environment: 50, justice: 30, infrastructure: 25 },
    traits: {
      bonus:   { stat: 'environment', amount: 1, label: '+1 Environment on every decision' },
      penalty: { stat: 'economy',     amount: 1, label: '-1 Economy on every decision' }
    }
  },
  {
    id:       'communitybuilder',
    name:     'Community Builder',
    tag:      'Knits neighbourhoods together through people power',
    portrait: 'sprites/mayors/mayor_communitybuilder.png',
    stats: { faith: 38, economy: 25, people: 50, environment: 30, justice: 35, infrastructure: 22 },
    traits: {
      bonus:   { stat: 'people',         amount: 1, label: '+1 People on every decision' },
      penalty: { stat: 'infrastructure', amount: 1, label: '-1 Infrastructure on every decision' }
    }
  },
  {
    id:       'faithleader',
    name:     'Faith Leader',
    tag:      'Grounds civic life in compassion & moral purpose',
    portrait: 'sprites/mayors/mayor_faithleader.png',
    stats: { faith: 50, economy: 20, people: 35, environment: 30, justice: 40, infrastructure: 20 },
    traits: {
      bonus:   { stat: 'faith',   amount: 1, label: '+1 Faith on every decision' },
      penalty: { stat: 'economy', amount: 1, label: '-1 Economy on every decision' }
    }
  },
  {
    id:       'idealist',
    name:     'Idealist',
    tag:      'Believes a fairer city is always within reach',
    portrait: 'sprites/mayors/mayor_idealist.png',
    stats: { faith: 40, economy: 20, people: 38, environment: 30, justice: 45, infrastructure: 20 },
    traits: {
      bonus:   { stat: 'justice',  amount: 1, label: '+1 Justice on every decision' },
      penalty: { stat: 'economy',  amount: 1, label: '-1 Economy on every decision' }
    }
  },
  {
    id:       'lawandorder',
    name:     'Law & Order',
    tag:      'Safety and structure keep the city running',
    portrait: 'sprites/mayors/mayor_lawandorder.png',
    stats: { faith: 25, economy: 35, people: 28, environment: 20, justice: 50, infrastructure: 40 },
    traits: {
      bonus:   { stat: 'justice', amount: 1, label: '+1 Justice on every decision' },
      penalty: { stat: 'people',  amount: 1, label: '-1 People on every decision' }
    }
  },
  {
    id:       'policytechnocrat',
    name:     'Policy Technocrat',
    tag:      'Evidence-based governance, systems that work',
    portrait: 'sprites/mayors/mayor_policytechnocrat.png',
    stats: { faith: 20, economy: 40, people: 25, environment: 25, justice: 30, infrastructure: 50 },
    traits: {
      bonus:   { stat: 'infrastructure', amount: 1, label: '+1 Infrastructure on every decision' },
      penalty: { stat: 'faith',          amount: 1, label: '-1 Faith on every decision' }
    }
  },
  {
    id:       'socialjustice',
    name:     'Social Justice Advocate',
    tag:      'Champions equity, rights & the most vulnerable',
    portrait: 'sprites/mayors/mayor_socialjustice.png',
    stats: { faith: 35, economy: 20, people: 45, environment: 30, justice: 50, infrastructure: 22 },
    traits: {
      bonus:   { stat: 'people',  amount: 1, label: '+1 People on every decision' },
      penalty: { stat: 'economy', amount: 1, label: '-1 Economy on every decision' }
    }
  }
];

// ── GAME STATE ────────────────────────────────────────────────────────────────

const gameState = {
  month:      1,
  maxMonths:  36,
  mayor:      null,   // populated on selection
  approval:       50,   // 0–100, starts at 50 (neutral — just elected)
  baselineStats:  null, // copy of mayor's starting stats; approval measures delta from here

  stats: {
    faith:          50,
    economy:        50,
    people:         50,
    environment:    50,
    justice:        50,
    infrastructure: 50
  },

  scenarios:        [],   // populated by loadScenarios()
  currentScenario:  null, // scenario currently shown in the panel
  usedScenarioIds:  new Set(), // tracks seen IDs to prevent repeats in one playthrough
  pendingConsequences: [], // queue of {scenario, triggerMonth} — consequence chain follow-ups
  triggeredChains:  new Set(), // source scenario IDs already chained (prevent double-fire)

  log: []
};

// ── MUSIC SYSTEM ─────────────────────────────────────────────────────────────
//
//  Three tracks, one active at a time.
//  Tracks are created once and reused — no re-fetching on state change.
//  Music state survives restarts so the toggle preference is remembered.

const MUSIC = {
  menu:     new Audio('audio/song_menu.mp3'),
  gameplay: new Audio('audio/song_gameplay.mp3'),
  ending:   new Audio('audio/song_ending.mp3'),
  loss:     new Audio('audio/song_loss.mp3'),
};

// Apply shared settings to every track
Object.values(MUSIC).forEach(track => {
  track.loop   = true;
  track.volume = 0.4;
});

// Current state
let _musicEnabled = true;   // toggled by the button
let _currentTrack = null;   // key of the track that should be playing ('menu' | 'gameplay' | 'ending' | 'loss')

/**
 * playTrack(key)
 * Stop whatever is playing and start the named track (if music is enabled).
 * Safe to call even if the same track is already playing — it won't restart.
 */
function playTrack(key) {
  _currentTrack = key;
  if (!_musicEnabled) return;

  // Stop all tracks
  Object.entries(MUSIC).forEach(([k, t]) => {
    if (k !== key) {
      t.pause();
      t.currentTime = 0;
    }
  });

  // Start requested track only if it isn't already playing
  const target = MUSIC[key];
  if (target.paused) {
    target.play().catch(() => {
      // Autoplay blocked (browser policy) — silently ignore.
      // The track will start as soon as the user first interacts.
    });
  }
}

/**
 * stopAllMusic()
 * Pause and rewind every track.
 */
function stopAllMusic() {
  Object.values(MUSIC).forEach(t => { t.pause(); t.currentTime = 0; });
}

/**
 * toggleMusic()
 * Called by the header button. Flips _musicEnabled and updates the UI.
 */
function toggleMusic() {
  _musicEnabled = !_musicEnabled;

  const btn   = document.getElementById('musicToggle');
  const icon  = document.getElementById('musicIcon');
  const label = document.getElementById('musicLabel');

  if (_musicEnabled) {
    btn.classList.remove('muted');
    icon.textContent  = '♪';
    label.textContent = 'ON';
    // Resume the correct track for the current game state
    if (_currentTrack) playTrack(_currentTrack);
  } else {
    btn.classList.add('muted');
    icon.textContent  = '♪';
    label.textContent = 'OFF';
    stopAllMusic();
  }

  // Keep the main menu button in sync too
  syncMenuMusicBtn();
}

/**
 * syncMenuMusicBtn()
 * Keeps the main menu music button label in sync with _musicEnabled.
 */
function syncMenuMusicBtn() {
  const menuBtn   = document.getElementById('menuMusicBtn');
  const menuLabel = document.getElementById('menuMusicLabel');
  if (!menuBtn) return;
  menuLabel.textContent = _musicEnabled ? 'ON' : 'OFF';
  menuBtn.classList.toggle('muted', !_musicEnabled);
}

/**
 * showMainMenu()
 * Reveals the main menu screen. Called on first load and (optionally) on restart.
 */
function showMainMenu() {
  const screen = document.getElementById('mainMenuScreen');
  if (screen) screen.classList.remove('hidden');
}

/**
 * startGameFromMenu()
 * Called when the player clicks Start Game on the main menu.
 * Hides the main menu, shows the mayor selection screen, and starts music.
 */
function startGameFromMenu() {
  const screen = document.getElementById('mainMenuScreen');
  if (screen) screen.classList.add('hidden');

  // Show the selection screen (it was hidden on load)
  els.selectionScreen.classList.remove('hiding');
  els.selectionScreen.style.display = '';

  // Now that the user has interacted, music can start
  playTrack('menu');
}

// ── SCENARIO DATA (embedded — no fetch needed) ───────────────────────────────
//
//  All four scenario files are inlined here so the game works when opened
//  directly from the filesystem (file://) on any OS without a local server.

const ALL_SCENARIOS = [
  // ── scenarios_1.json ──
  { id:1, title:"Factory Expansion Proposal", principle:"Dignity of Work and Rights of Workers", situation:"A manufacturing company proposes building a new factory that would create hundreds of jobs but increase pollution near a working-class neighbourhood.", choices:[{text:"Approve the factory to create jobs",economy:7,environment:-3,justice:-3},{text:"Reject the factory to protect residents",economy:-5,people:3,environment:6},{text:"Approve with strict environmental rules",economy:4,environment:-2,justice:3}]},
  { id:2, title:"Refugee Resettlement Request", principle:"Global Solidarity", situation:"The federal government asks your city to welcome 200 refugees fleeing war. Some residents support the plan while others worry about costs.", choices:[{text:"Welcome the refugees",faith:7,economy:-2,infrastructure:-4},{text:"Refuse the request",faith:-6,economy:3,justice:-4},{text:"Accept refugees with federal funding",faith:5,justice:3,infrastructure:-2}]},
  { id:3, title:"Homeless Shelter Funding", principle:"Option for the Poor and Vulnerable", situation:"A charity asks the city to help fund a new homeless shelter downtown. Business leaders worry it may discourage tourism.", choices:[{text:"Fully fund the shelter",faith:6,economy:-4,people:4},{text:"Reject funding",faith:-5,economy:4,justice:-4},{text:"Fund a smaller shelter",faith:3,economy:-2,people:2}]},
  { id:4, title:"Minimum Wage Debate", principle:"Dignity of Work and Rights of Workers", situation:"Worker groups demand the city support raising the local minimum wage. Small businesses warn it could lead to layoffs.", choices:[{text:"Support a wage increase",economy:-4,people:3,justice:6},{text:"Oppose the increase",economy:5,people:-3,justice:-5},{text:"Gradually raise wages",economy:-2,people:2,justice:3}]},
  { id:5, title:"Police Budget Increase", principle:"Promotion of Peace", situation:"Police leaders request a larger budget to respond to rising crime. Community groups want investment in social programs instead.", choices:[{text:"Increase police funding",economy:-2,people:4,justice:-3},{text:"Fund social programs instead",economy:-4,people:3,justice:5},{text:"Split the funding",economy:-2,people:2,justice:2}]},
  { id:6, title:"Public Transit Expansion", principle:"Community and the Common Good", situation:"Your city considers expanding public transit to underserved neighbourhoods. The project would improve mobility but cost millions.", choices:[{text:"Build the full expansion",economy:-5,people:4,infrastructure:7},{text:"Cancel the project",economy:4,people:-4,infrastructure:-5},{text:"Build a smaller version",economy:-2,people:2,infrastructure:4}]},
  { id:7, title:"Worker Strike", principle:"Dignity of Work and Rights of Workers", situation:"City sanitation workers go on strike demanding better pay and safer conditions. Garbage is piling up across the city.", choices:[{text:"Support the workers",economy:-3,people:-2,justice:6},{text:"Force them back to work",economy:4,people:2,justice:-6},{text:"Negotiate a compromise",economy:-2,people:2,justice:3}]},
  { id:8, title:"Park vs Housing Development", principle:"Stewardship of Creation", situation:"Developers want to build housing on a large green space. The project would ease the housing shortage but remove a major park.", choices:[{text:"Approve development",economy:5,environment:-5,infrastructure:4},{text:"Protect the park",economy:-4,people:3,environment:7},{text:"Allow partial development",economy:3,environment:-2,infrastructure:2}]},
  { id:9, title:"Youth Advisory Council", principle:"Participation in Society", situation:"Students ask the city to create a youth advisory council so young people can help influence policy.", choices:[{text:"Create the council",economy:-2,people:5,justice:3},{text:"Reject the idea",economy:2,people:-4,justice:-4},{text:"Create a small pilot program",economy:-2,people:3,justice:2}]},
  { id:10, title:"Military Equipment Donation", principle:"Promotion of Peace", situation:"The federal government offers surplus military equipment to local police forces.", choices:[{text:"Accept the equipment",people:2,justice:-4,infrastructure:4},{text:"Reject the equipment",people:-2,justice:5,infrastructure:-3},{text:"Accept with strict oversight",economy:-2,justice:3,infrastructure:2}]},
  { id:11, title:"Affordable Housing Project", principle:"Option for the Poor and Vulnerable", situation:"A proposal would build affordable housing for low-income families but requires higher city spending.", choices:[{text:"Fund the housing project",economy:-5,people:4,justice:6},{text:"Reject the project",economy:4,people:-3,justice:-5},{text:"Build fewer units",economy:-3,people:2,justice:3}]},
  { id:12, title:"Community Garden Initiative", principle:"Stewardship of Creation", situation:"Residents propose turning unused land into community gardens.", choices:[{text:"Support the gardens",economy:-2,people:4,environment:5},{text:"Sell land to developers",economy:5,people:-2,environment:-5},{text:"Divide the land between both",economy:3,people:2,environment:-2}]},
  { id:13, title:"Local Business Tax Break", principle:"Role of Government", situation:"Business leaders ask for tax breaks to encourage investment in the city.", choices:[{text:"Grant tax breaks",economy:6,justice:-3,infrastructure:-2},{text:"Reject the request",faith:2,economy:-4,justice:3},{text:"Offer limited incentives",economy:4,justice:-2,infrastructure:-2}]},
  { id:14, title:"School Funding Debate", principle:"Rights and Responsibilities", situation:"Teachers request increased school funding for overcrowded classrooms.", choices:[{text:"Increase school funding",economy:-5,people:5,justice:4},{text:"Maintain current funding",economy:3,people:-4,justice:-3},{text:"Provide partial funding",economy:-2,people:3,justice:2}]},
  { id:15, title:"Public Health Clinic", principle:"Human Dignity", situation:"Health advocates propose opening a free clinic for low-income residents.", choices:[{text:"Open the clinic",faith:4,economy:-4,people:5},{text:"Reject the plan",faith:-4,economy:3,people:-4},{text:"Partner with charities",faith:4,economy:-2,people:3}]},
  { id:16, title:"Water Pollution Crisis", principle:"Stewardship of Creation", situation:"Tests show a nearby factory may be polluting the city's river.", choices:[{text:"Fine the factory heavily",economy:-4,environment:7,justice:3},{text:"Ignore the issue",faith:-4,economy:3,environment:-6},{text:"Negotiate cleanup plan",economy:-2,environment:4,justice:2}]},
  { id:17, title:"Immigrant Support Services", principle:"Global Solidarity", situation:"Community groups ask the city to fund language and job training programs for immigrants.", choices:[{text:"Fund the programs",faith:5,economy:-3,people:4},{text:"Reject funding",faith:-4,economy:2,justice:-4},{text:"Offer limited funding",faith:3,economy:-2,people:2}]},
  { id:18, title:"Public Protest Permit", principle:"Participation in Society", situation:"Activists request permission to hold a large protest downtown.", choices:[{text:"Approve the protest",economy:-2,people:3,justice:5},{text:"Deny the permit",economy:2,people:-3,justice:-5},{text:"Approve with restrictions",economy:-2,people:2,justice:3}]},
  { id:19, title:"Food Bank Funding", principle:"Option for the Poor and Vulnerable", situation:"Local food banks are struggling with rising demand.", choices:[{text:"Increase funding",faith:6,economy:-4,people:4},{text:"Maintain current funding",faith:-4,economy:3,people:-3},{text:"Partner with charities",faith:4,economy:-2,people:2}]},
  { id:20, title:"Bike Lane Expansion", principle:"Stewardship of Creation", situation:"Cycling groups want the city to expand bike lanes across downtown.", choices:[{text:"Build extensive bike lanes",economy:-3,people:3,environment:6},{text:"Reject the proposal",economy:3,people:-3,environment:-4},{text:"Build limited lanes",economy:-2,people:2,environment:3}]},
  { id:21, title:"Industrial Waste Regulation", principle:"Stewardship of Creation", situation:"New regulations could reduce industrial waste but businesses say costs will rise.", choices:[{text:"Pass strict regulations",economy:-5,environment:7,justice:3},{text:"Reject the regulations",faith:-3,economy:5,environment:-6},{text:"Introduce gradual rules",economy:-2,environment:4,justice:2}]},
  { id:22, title:"Public Library Expansion", principle:"Community and the Common Good", situation:"Residents want to expand the public library system.", choices:[{text:"Build new libraries",economy:-4,people:5,justice:3},{text:"Reject expansion",economy:3,people:-4,infrastructure:-3},{text:"Renovate existing libraries",economy:-2,people:3,infrastructure:2}]},
  { id:23, title:"Senior Care Funding", principle:"Human Dignity", situation:"Advocates say senior care homes need additional city funding.", choices:[{text:"Increase funding",faith:5,economy:-4,people:4},{text:"Reject the request",faith:-4,economy:3,people:-3},{text:"Provide partial funding",faith:3,economy:-2,people:3}]},
  { id:24, title:"International Sister City Program", principle:"Global Solidarity", situation:"Your city is invited to form a partnership with a city in a developing country.", choices:[{text:"Join the partnership",faith:5,economy:-2,people:3},{text:"Decline the offer",faith:-4,economy:2,justice:-3},{text:"Join with limited commitments",faith:3,economy:-2,justice:2}]},
  { id:25, title:"Community Mediation Program", principle:"Promotion of Peace", situation:"Community leaders propose mediation programs to resolve neighbourhood conflicts.", choices:[{text:"Fund the program",economy:-3,people:4,justice:5},{text:"Reject the proposal",economy:2,people:-3,justice:-4},{text:"Launch a pilot program",economy:-2,people:2,justice:3}]},
  // ── scenarios_2.json ──
  { id:26, title:"Urban Tree Planting Program", principle:"Stewardship of Creation", situation:"Environmental groups propose planting thousands of trees across the city to improve air quality and reduce heat.", choices:[{text:"Fund the full program",economy:-3,people:3,environment:7},{text:"Reject the proposal",economy:3,people:-2,environment:-5},{text:"Plant trees gradually",economy:-2,people:2,environment:4}]},
  { id:27, title:"Local Farm Subsidies", principle:"Community and the Common Good", situation:"Local farmers ask for subsidies to help them compete with large agricultural corporations.", choices:[{text:"Provide subsidies",economy:-3,people:4,environment:3},{text:"Refuse subsidies",economy:3,people:-4,justice:-3},{text:"Offer limited support",economy:-2,people:3,environment:2}]},
  { id:28, title:"Worker Safety Regulations", principle:"Dignity of Work and Rights of Workers", situation:"New workplace safety rules could protect employees but businesses warn they will increase operating costs.", choices:[{text:"Adopt strict regulations",economy:-5,people:3,justice:6},{text:"Reject the regulations",economy:5,people:-2,justice:-5},{text:"Adopt moderate rules",economy:-2,people:2,justice:4}]},
  { id:29, title:"Public Art Funding", principle:"Participation in Society", situation:"Artists propose a city program to fund murals and cultural art projects.", choices:[{text:"Fund the arts program",faith:3,economy:-3,people:5},{text:"Reject funding",faith:-2,economy:3,people:-4},{text:"Create a small arts grant",faith:2,economy:-2,people:3}]},
  { id:30, title:"Public WiFi Expansion", principle:"Participation in Society", situation:"Tech groups want the city to expand free public WiFi access in low-income areas.", choices:[{text:"Fund full expansion",economy:-3,people:5,infrastructure:4},{text:"Reject the proposal",economy:3,people:-4,infrastructure:-3},{text:"Pilot program in some areas",economy:-2,people:3,infrastructure:2}]},
  { id:31, title:"Community Policing Initiative", principle:"Promotion of Peace", situation:"Police suggest launching community policing programs to improve trust with residents.", choices:[{text:"Launch the program",economy:-3,people:5,justice:4},{text:"Reject the plan",economy:2,people:-3,justice:-4},{text:"Test in one district",economy:-2,people:3,justice:2}]},
  { id:32, title:"Emergency Disaster Fund", principle:"Role of Government", situation:"Officials recommend creating an emergency disaster fund for floods and storms.", choices:[{text:"Create the fund",economy:-4,people:3,infrastructure:5},{text:"Reject the proposal",economy:4,people:-3,infrastructure:-4},{text:"Create a smaller fund",economy:-2,people:2,infrastructure:3}]},
  { id:33, title:"Local Recycling Program", principle:"Stewardship of Creation", situation:"Environmental groups push for a citywide recycling initiative.", choices:[{text:"Launch the program",economy:-3,people:3,environment:6},{text:"Reject the program",economy:3,people:-2,environment:-5},{text:"Start a smaller program",economy:-2,people:2,environment:4}]},
  { id:34, title:"Childcare Subsidy", principle:"Human Dignity", situation:"Parents request city subsidies to make childcare more affordable.", choices:[{text:"Provide subsidies",economy:-5,people:5,justice:4},{text:"Reject the subsidies",economy:4,people:-4,justice:-4},{text:"Provide limited assistance",economy:-2,people:3,justice:3}]},
  { id:35, title:"Local Business Grant", principle:"Role of Government", situation:"Small businesses request grants to recover from a recent economic downturn.", choices:[{text:"Provide grants",economy:6,people:3,infrastructure:-2},{text:"Reject the request",economy:-3,people:-3,justice:3},{text:"Provide smaller grants",economy:4,people:2,infrastructure:-2}]},
  { id:36, title:"Public Park Renovation", principle:"Community and the Common Good", situation:"Residents want the city to renovate an aging public park.", choices:[{text:"Fully renovate the park",economy:-4,people:5,environment:4},{text:"Cancel the renovation",economy:3,people:-4,infrastructure:-3},{text:"Renovate part of the park",economy:-2,people:3,environment:2}]},
  { id:37, title:"Mental Health Services", principle:"Human Dignity", situation:"Doctors urge the city to fund more mental health services.", choices:[{text:"Expand services",faith:4,economy:-4,people:5},{text:"Reject expansion",faith:-4,economy:3,people:-4},{text:"Expand services gradually",faith:3,economy:-2,people:3}]},
  { id:38, title:"City Festival Funding", principle:"Community and the Common Good", situation:"Tourism leaders propose a large annual festival to attract visitors.", choices:[{text:"Fund the festival",economy:5,people:4,environment:-2},{text:"Reject funding",faith:2,economy:-2,people:-3},{text:"Fund a smaller event",economy:3,people:2,environment:-2}]},
  { id:39, title:"Food Waste Reduction Law", principle:"Stewardship of Creation", situation:"A proposal would require grocery stores to donate unsold food instead of throwing it away.", choices:[{text:"Pass the law",economy:-3,people:4,environment:5},{text:"Reject the law",faith:-3,economy:4,environment:-4},{text:"Encourage voluntary programs",economy:-2,people:2,environment:3}]},
  { id:40, title:"Community Sports Funding", principle:"Participation in Society", situation:"Youth organizations request funding for community sports leagues.", choices:[{text:"Fund the leagues",economy:-3,people:5,justice:3},{text:"Reject funding",economy:3,people:-4,justice:-3},{text:"Provide partial funding",economy:-2,people:3,justice:2}]},
  { id:41, title:"Affordable Transit Pass", principle:"Option for the Poor and Vulnerable", situation:"Advocates ask the city to offer discounted transit passes for low-income residents.", choices:[{text:"Introduce the discount",economy:-4,people:4,justice:5},{text:"Reject the proposal",economy:4,people:-3,justice:-4},{text:"Offer limited discounts",economy:-2,people:2,justice:3}]},
  { id:42, title:"Green Energy Incentives", principle:"Stewardship of Creation", situation:"Environmental groups propose incentives for homes installing solar panels.", choices:[{text:"Provide incentives",economy:-4,people:3,environment:6},{text:"Reject incentives",economy:4,people:-2,environment:-5},{text:"Offer smaller incentives",economy:-2,people:2,environment:4}]},
  { id:43, title:"Local Job Training Program", principle:"Dignity of Work and Rights of Workers", situation:"A program could train unemployed residents for skilled jobs.", choices:[{text:"Fund the training program",economy:-3,people:5,justice:4},{text:"Reject the program",economy:2,people:-3,justice:-3},{text:"Fund a smaller program",economy:-2,people:3,justice:2}]},
  { id:44, title:"Community Conflict Mediation", principle:"Promotion of Peace", situation:"Community leaders propose programs to mediate neighbourhood conflicts.", choices:[{text:"Fund the program",economy:-3,people:4,justice:5},{text:"Reject the proposal",economy:2,people:-3,justice:-4},{text:"Launch a pilot program",economy:-2,people:2,justice:3}]},
  { id:45, title:"Historic Building Preservation", principle:"Community and the Common Good", situation:"Developers want to demolish a historic building to build offices.", choices:[{text:"Preserve the building",faith:3,economy:-4,people:4},{text:"Allow demolition",economy:6,people:-4,infrastructure:3},{text:"Integrate building into development",faith:-2,economy:3,people:2}]},
  { id:46, title:"Food Truck Regulations", principle:"Rights and Responsibilities", situation:"Restaurant owners want strict limits on food trucks competing downtown.", choices:[{text:"Restrict food trucks",economy:4,justice:-3,infrastructure:2},{text:"Allow open competition",economy:-3,people:3,justice:4},{text:"Create balanced regulations",economy:2,people:-2,justice:2}]},
  { id:47, title:"Public Swimming Pool", principle:"Community and the Common Good", situation:"Residents want the city to build a new public swimming pool.", choices:[{text:"Build the pool",economy:-4,people:5,infrastructure:4},{text:"Reject the project",economy:4,people:-4,infrastructure:-3},{text:"Renovate an existing pool",economy:-2,people:3,infrastructure:2}]},
  { id:48, title:"Urban Farming Project", principle:"Stewardship of Creation", situation:"A proposal would support rooftop farming in the city.", choices:[{text:"Fund the project",economy:-3,people:4,environment:5},{text:"Reject the project",economy:3,people:-2,environment:-4},{text:"Pilot the project",economy:-2,people:2,environment:3}]},
  { id:49, title:"City Scholarship Program", principle:"Rights and Responsibilities", situation:"Educators propose scholarships for low-income students.", choices:[{text:"Create scholarships",economy:-4,people:4,justice:6},{text:"Reject the plan",economy:4,people:-3,justice:-5},{text:"Create limited scholarships",economy:-2,people:2,justice:4}]},
  { id:50, title:"Noise Regulation Debate", principle:"Rights and Responsibilities", situation:"Residents complain about nightlife noise downtown.", choices:[{text:"Enforce strict noise rules",faith:3,economy:-4,people:4},{text:"Allow businesses to operate freely",faith:-3,economy:5,people:-4},{text:"Create balanced regulations",faith:2,economy:-2,people:3}]},
  // ── scenarios_3.json ──
  { id:51, title:"Senior Transportation Program", principle:"Human Dignity", situation:"Community advocates propose a transportation service for seniors who can no longer drive.", choices:[{text:"Fund the program",faith:4,economy:-4,people:5},{text:"Reject the proposal",faith:-3,economy:4,people:-4},{text:"Create a limited service",faith:2,economy:-2,people:3}]},
  { id:52, title:"River Cleanup Initiative", principle:"Stewardship of Creation", situation:"Environmental groups ask the city to fund a large river cleanup project.", choices:[{text:"Fund the full cleanup",economy:-4,environment:7,justice:3},{text:"Reject the project",faith:-3,economy:3,environment:-6},{text:"Start a smaller cleanup",economy:-2,environment:4,justice:2}]},
  { id:53, title:"Refugee Job Training", principle:"Global Solidarity", situation:"Charities propose job training programs to help refugees integrate into the workforce.", choices:[{text:"Fund the program",faith:5,economy:-3,people:4},{text:"Reject funding",faith:-4,economy:3,justice:-4},{text:"Provide limited support",faith:3,economy:-2,people:2}]},
  { id:54, title:"Public Housing Renovation", principle:"Option for the Poor and Vulnerable", situation:"Public housing buildings are aging and require costly renovations.", choices:[{text:"Fund full renovations",economy:-5,people:4,justice:6},{text:"Delay renovations",economy:4,people:-4,justice:-5},{text:"Renovate gradually",economy:-2,people:2,justice:4}]},
  { id:55, title:"City Compost Program", principle:"Stewardship of Creation", situation:"A proposal would introduce compost collection across the city.", choices:[{text:"Implement citywide composting",economy:-3,people:3,environment:6},{text:"Reject the program",economy:3,people:-2,environment:-5},{text:"Pilot program",economy:-2,people:2,environment:4}]},
  { id:56, title:"Worker Overtime Rules", principle:"Dignity of Work and Rights of Workers", situation:"Labour groups push for stronger overtime protections.", choices:[{text:"Adopt new protections",economy:-4,people:3,justice:6},{text:"Reject changes",economy:5,people:-3,justice:-5},{text:"Adopt moderate protections",economy:-2,people:2,justice:4}]},
  { id:57, title:"Neighbourhood Watch Program", principle:"Promotion of Peace", situation:"Residents propose organizing neighbourhood watch groups.", choices:[{text:"Support the program",economy:-2,people:4,justice:4},{text:"Reject the proposal",economy:2,people:-3,justice:-3},{text:"Test in select neighbourhoods",economy:-2,people:2,justice:3}]},
  { id:58, title:"Immigrant Cultural Festival", principle:"Participation in Society", situation:"Community leaders propose a festival celebrating immigrant cultures.", choices:[{text:"Fund the festival",faith:5,economy:-3,people:4},{text:"Reject funding",faith:-4,economy:3,people:-3},{text:"Fund a smaller festival",faith:3,economy:-2,people:2}]},
  { id:59, title:"Subsidized School Meals", principle:"Option for the Poor and Vulnerable", situation:"Educators propose subsidized meals for students from low-income families.", choices:[{text:"Fund the program",economy:-4,people:5,justice:4},{text:"Reject funding",economy:4,people:-4,justice:-4},{text:"Provide limited funding",economy:-2,people:3,justice:3}]},
  { id:60, title:"Green Roof Requirement", principle:"Stewardship of Creation", situation:"Developers may be required to include green roofs on new buildings.", choices:[{text:"Require green roofs",economy:-4,people:3,environment:6},{text:"Reject the proposal",economy:4,environment:-5,infrastructure:2},{text:"Encourage but not require",economy:-2,people:2,environment:3}]},
  { id:61, title:"Accessible Sidewalks Program", principle:"Human Dignity", situation:"Disability advocates push for accessible sidewalks citywide.", choices:[{text:"Fund accessibility upgrades",economy:-5,people:4,justice:6},{text:"Reject the plan",economy:4,justice:-5,infrastructure:-3},{text:"Upgrade gradually",economy:-2,people:2,justice:4}]},
  { id:62, title:"Youth Job Program", principle:"Dignity of Work and Rights of Workers", situation:"A program could help teenagers find summer jobs.", choices:[{text:"Fund the program",economy:-3,people:5,justice:4},{text:"Reject funding",economy:2,people:-3,justice:-3},{text:"Launch a pilot program",economy:-2,people:3,justice:2}]},
  { id:63, title:"Urban Wildlife Protection", principle:"Stewardship of Creation", situation:"Conservationists ask the city to protect habitats for wildlife.", choices:[{text:"Protect habitats",economy:-4,people:3,environment:6},{text:"Allow development",economy:6,people:-2,environment:-6},{text:"Protect some areas",economy:-2,environment:3,justice:2}]},
  { id:64, title:"City Mediation Service", principle:"Promotion of Peace", situation:"The city could fund mediation services to resolve disputes.", choices:[{text:"Fund the service",economy:-3,people:4,justice:5},{text:"Reject funding",economy:2,people:-3,justice:-4},{text:"Pilot the program",economy:-2,people:2,justice:3}]},
  { id:65, title:"Affordable Internet Access", principle:"Participation in Society", situation:"Advocates propose subsidized internet for low-income households.", choices:[{text:"Subsidize internet",economy:-4,people:5,justice:4},{text:"Reject subsidies",economy:4,people:-4,justice:-3},{text:"Limited subsidies",economy:-2,people:3,justice:2}]},
  { id:66, title:"City Peace Conference", principle:"Promotion of Peace", situation:"Faith leaders propose a conference promoting peace and dialogue.", choices:[{text:"Fund the conference",faith:5,economy:-3,people:3},{text:"Reject funding",faith:-4,economy:3,people:-2},{text:"Support through partnerships",faith:3,economy:-2,people:2}]},
  { id:67, title:"Flood Barrier Project", principle:"Role of Government", situation:"Engineers propose building barriers to protect against future flooding.", choices:[{text:"Build the barriers",economy:-5,people:3,infrastructure:7},{text:"Reject the project",economy:4,people:-3,infrastructure:-5},{text:"Build smaller barriers",economy:-2,people:2,infrastructure:4}]},
  { id:68, title:"Community Health Campaign", principle:"Human Dignity", situation:"Health officials propose a campaign promoting healthier lifestyles.", choices:[{text:"Fund the campaign",faith:3,economy:-3,people:5},{text:"Reject the campaign",faith:-3,economy:3,people:-3},{text:"Run a smaller campaign",faith:2,economy:-2,people:3}]},
  { id:69, title:"Public Transit Safety", principle:"Promotion of Peace", situation:"Officials propose additional safety measures on public transit.", choices:[{text:"Increase safety funding",economy:-3,people:5,infrastructure:3},{text:"Reject the proposal",economy:3,people:-4,infrastructure:-3},{text:"Increase security gradually",economy:-2,people:3,infrastructure:2}]},
  { id:70, title:"City Tree Protection Law", principle:"Stewardship of Creation", situation:"Environmentalists want stronger protections for city trees.", choices:[{text:"Pass the law",economy:-3,people:3,environment:6},{text:"Reject the law",economy:4,people:-2,environment:-5},{text:"Create moderate protections",economy:-2,people:2,environment:3}]},
  { id:71, title:"Worker Cooperative Grants", principle:"Dignity of Work and Rights of Workers", situation:"Workers want grants to start employee-owned cooperatives.", choices:[{text:"Provide grants",economy:-3,people:4,justice:5},{text:"Reject grants",economy:3,people:-3,justice:-4},{text:"Provide smaller grants",economy:-2,people:2,justice:3}]},
  { id:72, title:"Urban Air Quality Monitoring", principle:"Stewardship of Creation", situation:"Scientists want air quality monitoring stations across the city.", choices:[{text:"Fund monitoring stations",economy:-4,people:4,environment:5},{text:"Reject the proposal",economy:4,people:-3,environment:-4},{text:"Install limited stations",economy:-2,people:2,environment:3}]},
  { id:73, title:"Neighbourhood Community Centers", principle:"Community and the Common Good", situation:"Residents want more community centers for social activities.", choices:[{text:"Build new centers",economy:-4,people:6,justice:3},{text:"Reject the proposal",economy:4,people:-4,infrastructure:-3},{text:"Renovate existing centers",economy:-2,people:4,infrastructure:2}]},
  { id:74, title:"Fair Housing Enforcement", principle:"Rights and Responsibilities", situation:"Investigations reveal discrimination in housing rentals.", choices:[{text:"Increase enforcement",economy:-3,people:3,justice:6},{text:"Ignore the issue",economy:2,people:-3,justice:-6},{text:"Create a review committee",economy:-2,people:2,justice:3}]},
  { id:75, title:"Community Volunteer Program", principle:"Participation in Society", situation:"Leaders propose a volunteer initiative to support community services.", choices:[{text:"Launch the program",faith:3,economy:-2,people:5},{text:"Reject the idea",faith:-3,economy:2,people:-4},{text:"Pilot the program",faith:2,economy:-2,people:3}]},
  // ── scenarios_4.json ──
  { id:76, title:"Public Health Emergency Fund", principle:"Role of Government", situation:"Health experts recommend creating a reserve fund for future health emergencies.", choices:[{text:"Create the fund",economy:-4,people:3,infrastructure:5},{text:"Reject the fund",economy:4,people:-3,infrastructure:-4},{text:"Create a smaller reserve",economy:-2,people:2,infrastructure:3}]},
  { id:77, title:"Low-Income Utility Assistance", principle:"Option for the Poor and Vulnerable", situation:"Utility prices are rising and low-income families are struggling to pay bills.", choices:[{text:"Provide assistance",economy:-4,people:4,justice:6},{text:"Reject assistance",economy:4,people:-3,justice:-5},{text:"Limited assistance",economy:-2,people:2,justice:4}]},
  { id:78, title:"Urban Floodplain Development", principle:"Stewardship of Creation", situation:"Developers want to build homes on land that occasionally floods.", choices:[{text:"Allow development",economy:5,environment:-5,infrastructure:3},{text:"Protect the floodplain",economy:-5,people:3,environment:7},{text:"Allow limited development",economy:3,environment:-2,infrastructure:2}]},
  { id:79, title:"International Disaster Relief", principle:"Global Solidarity", situation:"A foreign city suffering from a natural disaster asks for assistance.", choices:[{text:"Send financial aid",faith:5,economy:-4,justice:4},{text:"Decline the request",faith:-5,economy:3,justice:-3},{text:"Send limited support",faith:3,economy:-2,justice:2}]},
  { id:80, title:"Affordable Daycare Center", principle:"Human Dignity", situation:"Families request affordable daycare to help parents return to work.", choices:[{text:"Build the daycare center",economy:-4,people:5,justice:4},{text:"Reject the project",economy:4,people:-4,justice:-4},{text:"Provide daycare subsidies",economy:-2,people:3,justice:3}]},
  { id:81, title:"Renewable Energy City Contract", principle:"Stewardship of Creation", situation:"Energy companies offer a renewable power contract that costs more than fossil fuels.", choices:[{text:"Adopt renewable energy",economy:-5,people:3,environment:7},{text:"Keep current energy sources",faith:-2,economy:4,environment:-6},{text:"Transition gradually",economy:-2,people:2,environment:4}]},
  { id:82, title:"City Youth Parliament", principle:"Participation in Society", situation:"Students propose a youth parliament to debate city issues.", choices:[{text:"Create the program",economy:-3,people:5,justice:4},{text:"Reject the idea",economy:2,people:-3,justice:-3},{text:"Pilot the program",economy:-2,people:3,justice:2}]},
  { id:83, title:"Worker Paid Sick Leave", principle:"Dignity of Work and Rights of Workers", situation:"Labour groups demand paid sick leave for city employees.", choices:[{text:"Grant paid sick leave",economy:-4,people:4,justice:6},{text:"Reject the demand",economy:5,people:-3,justice:-5},{text:"Offer limited leave",economy:-2,people:2,justice:4}]},
  { id:84, title:"Peace Education in Schools", principle:"Promotion of Peace", situation:"Educators propose peace-building programs in schools.", choices:[{text:"Fund the program",faith:5,economy:-3,people:4},{text:"Reject funding",faith:-4,economy:3,people:-3},{text:"Pilot the program",faith:3,economy:-2,people:2}]},
  { id:85, title:"Emergency Homeless Shelter", principle:"Option for the Poor and Vulnerable", situation:"Winter is approaching and advocates urge opening emergency shelters.", choices:[{text:"Open emergency shelters",faith:5,economy:-4,people:4},{text:"Reject the proposal",faith:-5,economy:4,people:-4},{text:"Open limited shelters",faith:3,economy:-2,people:3}]},
  { id:86, title:"Public EV Charging Network", principle:"Stewardship of Creation", situation:"Officials propose building electric vehicle charging stations.", choices:[{text:"Build the network",economy:-4,environment:6,infrastructure:4},{text:"Reject the plan",economy:3,environment:-4,infrastructure:-3},{text:"Build limited stations",economy:-2,environment:3,infrastructure:2}]},
  { id:87, title:"Public Legal Aid Program", principle:"Rights and Responsibilities", situation:"Lawyers suggest city funding for legal aid for low-income residents.", choices:[{text:"Fund legal aid",economy:-4,people:4,justice:6},{text:"Reject funding",economy:4,people:-3,justice:-5},{text:"Fund limited legal aid",economy:-2,people:2,justice:4}]},
  { id:88, title:"Local Peace March", principle:"Promotion of Peace", situation:"Faith leaders want to organize a city-wide peace march.", choices:[{text:"Support the march",faith:5,economy:-2,people:4},{text:"Refuse support",faith:-4,economy:2,people:-3},{text:"Allow the march without funding",faith:3,economy:-2,people:2}]},
  { id:89, title:"Public Housing Waiting List Reform", principle:"Option for the Poor and Vulnerable", situation:"Thousands of families are waiting for affordable housing.", choices:[{text:"Expand housing programs",economy:-5,people:4,justice:6},{text:"Do nothing",economy:3,people:-4,justice:-5},{text:"Reform allocation system",economy:-2,people:2,justice:4}]},
  { id:90, title:"Community Food Market", principle:"Community and the Common Good", situation:"Residents propose a weekly community food market.", choices:[{text:"Support the market",faith:3,economy:-2,people:5},{text:"Reject the plan",faith:-3,economy:2,people:-4},{text:"Pilot the market",faith:2,economy:-2,people:3}]},
  { id:91, title:"Urban Heat Reduction Plan", principle:"Stewardship of Creation", situation:"Climate scientists propose measures to reduce urban heat.", choices:[{text:"Implement the plan",economy:-4,people:3,environment:6},{text:"Reject the plan",economy:4,people:-3,environment:-5},{text:"Implement partially",economy:-2,people:2,environment:3}]},
  { id:92, title:"Local Peace Education Grants", principle:"Promotion of Peace", situation:"Schools ask for grants to teach conflict resolution.", choices:[{text:"Provide grants",faith:5,economy:-3,people:4},{text:"Reject the request",faith:-4,economy:3,people:-3},{text:"Pilot grants",faith:3,economy:-2,people:2}]},
  { id:93, title:"Community Health Clinic", principle:"Human Dignity", situation:"Doctors propose a new community health clinic in a low-income area.", choices:[{text:"Build the clinic",faith:4,economy:-5,people:6},{text:"Reject the project",faith:-4,economy:4,people:-5},{text:"Partner with charities",faith:3,economy:-2,people:4}]},
  { id:94, title:"Worker Safety Inspection Program", principle:"Dignity of Work and Rights of Workers", situation:"Officials propose stronger workplace inspections.", choices:[{text:"Expand inspections",economy:-4,people:3,justice:6},{text:"Reject the program",economy:5,people:-2,justice:-5},{text:"Moderate inspections",economy:-2,people:2,justice:4}]},
  { id:95, title:"City Cultural Exchange", principle:"Global Solidarity", situation:"International groups propose student exchange programs.", choices:[{text:"Fund exchanges",faith:5,economy:-3,people:4},{text:"Reject funding",faith:-4,economy:3,people:-3},{text:"Limited exchanges",faith:3,economy:-2,people:2}]},
  { id:96, title:"Public Transport Fare Increase", principle:"Rights and Responsibilities", situation:"Transit officials suggest raising fares to maintain service.", choices:[{text:"Raise fares",economy:5,people:-4,infrastructure:3},{text:"Reject the increase",economy:-4,people:4,justice:3},{text:"Raise fares slightly",economy:3,people:-2,infrastructure:2}]},
  { id:97, title:"Emergency Food Storage Program", principle:"Role of Government", situation:"Officials suggest building emergency food reserves.", choices:[{text:"Create food reserves",economy:-4,people:3,infrastructure:5},{text:"Reject the plan",economy:4,people:-3,infrastructure:-4},{text:"Create smaller reserves",economy:-2,people:2,infrastructure:3}]},
  { id:98, title:"Community Mental Health Hotline", principle:"Human Dignity", situation:"Advocates request a 24-hour mental health crisis hotline.", choices:[{text:"Fund the hotline",faith:4,economy:-4,people:5},{text:"Reject funding",faith:-4,economy:4,people:-4},{text:"Partner with nonprofits",faith:3,economy:-2,people:3}]},
  { id:99, title:"Urban Bike Share Program", principle:"Stewardship of Creation", situation:"Transportation planners propose a bike-share system.", choices:[{text:"Launch the system",economy:-4,people:4,environment:6},{text:"Reject the proposal",economy:3,people:-3,environment:-5},{text:"Pilot the system",economy:-2,people:2,environment:3}]},
  { id:100, title:"Citywide Volunteer Day", principle:"Community and the Common Good", situation:"Community leaders propose an annual volunteer day for the whole city.", choices:[{text:"Organize the event",faith:4,economy:-2,people:5},{text:"Reject the idea",faith:-3,economy:2,people:-3},{text:"Encourage community groups to organize it",faith:2,economy:-2,people:3}]}
];


/**
 * loadScenarios()
 *
 * Previously used fetch() — which fails on file:// (opening HTML directly
 * on Mac/Windows without a local server). All scenario data is now embedded
 * above so no network request is needed. The async signature is kept so
 * any calling code using await still works without changes.
 */
async function loadScenarios() {
  gameState.scenarios = ALL_SCENARIOS;
  console.log(`[loadScenarios] ${gameState.scenarios.length} scenarios ready (embedded).`);
}

/**
 * getRandomScenario()
 *
 * Returns the next scenario to display. Priority order:
 *   1. A pending consequence whose triggerMonth <= current month
 *   2. A random unseen scenario from the main pool
 *
 * Once all 100 scenarios have been used the pool resets so the game
 * can keep going past scenario #100 without crashing.
 */
function getRandomScenario() {
  if (gameState.scenarios.length === 0) {
    console.warn('[getRandomScenario] No scenarios loaded — using placeholder.');
    return PLACEHOLDER_SCENARIO;
  }

  // 1. Check consequence queue — serve the earliest due consequence
  const now = gameState.month;
  const dueIdx = gameState.pendingConsequences.findIndex(c => c.triggerMonth <= now);
  if (dueIdx !== -1) {
    const [due] = gameState.pendingConsequences.splice(dueIdx, 1);
    console.log(`[consequence] Serving chain scenario "${due.scenario.title}" at month ${now}`);
    return due.scenario;
  }

  // 2. Regular random pool
  let pool = gameState.scenarios.filter(s => !gameState.usedScenarioIds.has(s.id));
  if (pool.length === 0) {
    console.log('[getRandomScenario] All scenarios used — resetting pool.');
    gameState.usedScenarioIds.clear();
    pool = gameState.scenarios;
  }

  const scenario = pool[Math.floor(Math.random() * pool.length)];
  gameState.usedScenarioIds.add(scenario.id);
  return scenario;
}

// ── STAT CONFIGURATION ────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: 'faith',          barId: 'faithBar',   valId: 'faithVal',   label: 'Faith',  miniClass: 'mini-faith',   detailClass: 'detail-faith'   },
  { key: 'economy',        barId: 'economyBar',  valId: 'economyVal',  label: 'Econ',  miniClass: 'mini-economy',  detailClass: 'detail-economy'  },
  { key: 'people',         barId: 'peopleBar',   valId: 'peopleVal',   label: 'Ppl',   miniClass: 'mini-people',   detailClass: 'detail-people'   },
  { key: 'environment',    barId: 'envBar',      valId: 'envVal',      label: 'Env',   miniClass: 'mini-env',      detailClass: 'detail-env'      },
  { key: 'justice',        barId: 'justiceBar',  valId: 'justiceVal',  label: 'Just',  miniClass: 'mini-justice',  detailClass: 'detail-justice'  },
  { key: 'infrastructure', barId: 'infraBar',    valId: 'infraVal',    label: 'Infra', miniClass: 'mini-infra',    detailClass: 'detail-infra'    }
];

// ── DOM REFERENCES ────────────────────────────────────────────────────────────

const els = {
  // Header + game screen
  gameHeader:      document.querySelector('.game-header'),
  gameMain:        document.querySelector('.game-main'),
  monthDisplay:    document.getElementById('monthDisplay'),
  termFill:        null, // removed — term progress bar deprecated
  overallScore:    document.getElementById('overallScore'),

  // Scenario panel
  principleTag:        document.getElementById('principleText'),
  principleDefinition: document.getElementById('principleDefinition'),
  scenarioTitle:   document.getElementById('scenarioTitle'),
  scenarioDesc:    document.getElementById('scenarioDesc'),

  // Choice buttons
  choice0:         document.getElementById('choice0'),
  choice1:         document.getElementById('choice1'),
  choice2:         document.getElementById('choice2'),
  choiceText0:     document.getElementById('choiceText0'),
  choiceText1:     document.getElementById('choiceText1'),
  choiceText2:     document.getElementById('choiceText2'),
  choiceHints0:    document.getElementById('choiceHints0'),
  choiceHints1:    document.getElementById('choiceHints1'),
  choiceHints2:    document.getElementById('choiceHints2'),

  // Approval / re-election bar
  reelectFill:     document.getElementById('reelectFill'),
  reelectValue:    document.getElementById('reelectValue'),
  reelectionFill:    document.getElementById('reelectionFill'),
  reelectionValue:   document.getElementById('reelectionValue'),
  reelectionVerdict: document.getElementById('reelectionVerdict'),

  // Right panel
  logEntries:      document.getElementById('logEntries'),
  advisorName:     document.getElementById('advisorName'),
  advisorQuote:    document.getElementById('advisorQuote'),
  advisorPortrait: document.getElementById('advisorPortrait'),
  advisorTraits:   document.getElementById('advisorTraits'),

  // City view image panel
  cityViewImg:     document.getElementById('cityViewImg'),
  cityBanner:      document.getElementById('cityBanner'),
  cityBannerIcon:  document.getElementById('cityBannerIcon'),
  cityBannerText:  document.getElementById('cityBannerText'),

  // Toast
  toast:           document.getElementById('toast'),
  toastText:       document.getElementById('toastText'),

  // Selection screen
  selectionScreen: document.getElementById('selectionScreen'),
  mayorGrid:       document.getElementById('mayorGrid'),
  detailName:      document.getElementById('detailName'),
  detailStats:     document.getElementById('detailStats'),

  // Game over screen
  gameoverScreen:      document.getElementById('gameoverScreen'),
  gameoverReason:      document.getElementById('gameoverReason'),
  gameoverStats:       document.getElementById('gameoverStats'),
  gameoverMonths:      document.getElementById('gameoverMonths'),
  gameoverIcon:        document.getElementById('gameoverIcon'),
  gameoverRestartBtn:  document.getElementById('gameoverRestartBtn'),

  // Election / endgame screen
  electionScreen:   document.getElementById('electionScreen'),
  electionIcon:     document.getElementById('electionIcon'),
  electionTitle:    document.getElementById('electionTitle'),
  electionVerdict:  document.getElementById('electionVerdict'),
  verdictLabel:     document.getElementById('verdictLabel'),
  electionDesc:     document.getElementById('electionDesc'),
  electionEpilogue: document.getElementById('electionEpilogue'),
  electionStats:    document.getElementById('electionStats'),
  electionAvg:      document.getElementById('electionAvg'),
  electionPlayBtn:  document.getElementById('electionPlayBtn'),
  breakdownStats:   document.getElementById('breakdownStats'),
  breakdownApproval:document.getElementById('breakdownApproval'),
  highscoreList:    document.getElementById('highscoreList'),

  // Mid-game report screen
  midgameScreen:       document.getElementById('midgameScreen'),
  instructionScreen:   document.getElementById('instructionScreen'),
  instructionBtn:      document.getElementById('instructionBtn'),
  midgameEyebrow:      document.getElementById('midgameEyebrow'),
  midgameIcon:         document.getElementById('midgameIcon'),
  midgameTitle:        document.getElementById('midgameTitle'),
  midgameHeadline:     document.getElementById('midgameHeadline'),
  midgameDesc:         document.getElementById('midgameDesc'),
  midgameStats:        document.getElementById('midgameStats'),
  midgameScore:        document.getElementById('midgameScore'),
  midgameContinueBtn:  document.getElementById('midgameContinueBtn')
};

// Pre-resolve stat bar DOM nodes
STAT_CONFIG.forEach(cfg => {
  cfg.barEl = document.getElementById(cfg.barId);
  cfg.valEl = document.getElementById(cfg.valId);
});

// ── UTILITY ───────────────────────────────────────────────────────────────────

function clamp(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ── STAT META ─────────────────────────────────────────────────────────────────

const STAT_COLOR = {
  faith:          '#a78bfa',
  economy:        '#34d399',
  people:         '#f87171',
  environment:    '#4ade80',
  justice:        '#60a5fa',
  infrastructure: '#fb923c'
};

const STAT_SHORT = {
  faith:          'Faith',
  economy:        'Econ',
  people:         'People',
  environment:    'Env',
  justice:        'Justice',
  infrastructure: 'Infra'
};

// ── CHOICE HINTS ──────────────────────────────────────────────────────────────

/**
 * renderChoiceHints(scenario)
 *
 * For each of the three choice buttons, reads the scenario's stat deltas and
 * renders small coloured chip tags — e.g. "+5 Faith", "-3 Econ" — so the player
 * can see consequences before committing.
 *
 * Shows up to 4 chips per button, sorted by absolute impact descending.
 * Zero-delta stats are silently skipped.
 */
function renderChoiceHints(scenario) {
  [0, 1, 2].forEach(i => {
    const choice    = scenario.choices[i];
    const hintsEl   = els[`choiceHints${i}`];
    if (!choice || !hintsEl) return;

    const statKeys = ['faith','economy','people','environment','justice','infrastructure'];

    // Collect non-zero deltas, sort by absolute magnitude descending
    const impacts = statKeys
      .map(k => ({ key: k, val: choice[k] || 0 }))
      .filter(d => d.val !== 0)
      .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

    hintsEl.innerHTML = impacts.map(({ key, val }) => {
      const sign  = val > 0 ? '+' : '';
      const color = STAT_COLOR[key];
      return `<span class="hint-chip" style="color:${color};border-color:${color}40">${sign}${val} ${STAT_SHORT[key]}</span>`;
    }).join('');
  });
}

// ── DELTA POPUP ───────────────────────────────────────────────────────────────

let _deltaTimer = null;

/**
 * showDeltaPopup(choice)
 *
 * Briefly displays a floating panel listing every non-zero stat change
 * from the just-made decision. Auto-hides after 2.5 s.
 */
function showDeltaPopup(choice) {
  const statKeys = ['faith','economy','people','environment','justice','infrastructure'];

  const items = statKeys
    .map(k => ({ key: k, val: choice[k] || 0 }))
    .filter(d => d.val !== 0)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

  if (!items.length) return;

  els.deltaPopup.innerHTML = items.map(({ key, val }) => {
    const sign  = val > 0 ? '+' : '';
    const color = val > 0 ? STAT_COLOR[key] : '#f87171';
    return `<span class="delta-item" style="color:${color}">${sign}${val} ${STAT_SHORT[key]}</span>`;
  }).join('');

  els.deltaPopup.classList.add('show');

  if (_deltaTimer) clearTimeout(_deltaTimer);
  _deltaTimer = setTimeout(() => els.deltaPopup.classList.remove('show'), 2500);
}

// ── APPROVAL / RE-ELECTION BAR ────────────────────────────────────────────────

/**
 * updateApprovalBar()
 *
 * Approval starts at 50 (just elected — neutral mandate) and shifts based on
 * how much each stat has improved or worsened since the mayor took office.
 *
 * Formula:
 *   For each of the 6 stats, delta = current − baseline (mayor's starting value).
 *   Weighted sum:  People 35% | Faith 15% | Economy 15% | Environment 15%
 *                  Justice 10% | Infrastructure 10%
 *   Max possible swing per stat = 100 points (0→100 or 100→0).
 *   Weighted max swing = 100.  Map weighted sum to ±50 around 50.
 *   approval = clamp(50 + weightedDeltaSum * 0.5, 0, 100)
 *
 * Effect: a mayor who inherited strong People/Faith stats starts truly neutral
 * and has more to lose; a mayor with weak starting stats has more room to impress.
 */
function updateApprovalBar() {
  const s  = gameState.stats;
  const b  = gameState.baselineStats || s; // fallback if baseline not yet set

  const weights = {
    people:         0.35,
    faith:          0.15,
    economy:        0.15,
    environment:    0.15,
    justice:        0.10,
    infrastructure: 0.10,
  };

  let weightedDelta = 0;
  for (const [key, w] of Object.entries(weights)) {
    weightedDelta += (s[key] - b[key]) * w;
  }

  // weightedDelta is in range −100..+100; map to 0..100 centred on 50
  const approval = Math.round(clamp(50 + weightedDelta * 0.5));
  gameState.approval = approval;

  const pct = approval + '%';
  els.reelectFill.style.width      = pct;
  els.reelectValue.textContent     = approval > 0 ? approval + '%' : '—';

  els.reelectFill.classList.remove('approval-low', 'approval-mid', 'approval-high');
  if      (approval >= 60) els.reelectFill.classList.add('approval-high');
  else if (approval >= 35) els.reelectFill.classList.add('approval-mid');
  else                     els.reelectFill.classList.add('approval-low');

  updateReelectionBar(approval);
}

/**
 * updateReelectionBar(approval)
 *
 * Maps the current approval rating to a re-election likelihood percentage
 * and verdict label. Uses a slight S-curve so mid-range approval (40–60)
 * produces genuine uncertainty, while extremes read as decisive.
 *
 * Verdict tiers:
 *   >= 72  → Very Likely
 *   >= 58  → Likely
 *   >= 44  → Toss-Up
 *   >= 30  → Unlikely
 *   <  30  → Very Unlikely
 */
function updateReelectionBar(approval) {
  // Slight S-curve: compress the middle, stretch the extremes
  const raw        = approval / 100;
  const curved     = raw < 0.5
    ? 2 * raw * raw
    : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  const likelihood = Math.round(curved * 100);

  els.reelectionFill.style.width    = likelihood + '%';
  els.reelectionValue.textContent   = likelihood > 0 ? likelihood + '%' : '—';

  // Colour class and verdict label
  let cls, label;
  if      (approval >= 72) { cls = 'relect-very-likely';   label = 'LIKELY WIN';   }
  else if (approval >= 58) { cls = 'relect-likely';         label = 'FAVOURED';     }
  else if (approval >= 44) { cls = 'reelect-tossup';        label = 'TOSS-UP';      }
  else if (approval >= 30) { cls = 'reelect-unlikely';      label = 'TRAILING';     }
  else                     { cls = 'reelect-very-unlikely'; label = 'AT RISK';      }

  els.reelectionFill.classList.remove(
    'relect-very-likely','relect-likely','reelect-tossup','reelect-unlikely','reelect-very-unlikely'
  );
  els.reelectionFill.classList.add(cls);

  els.reelectionVerdict.textContent = label;
  els.reelectionVerdict.className   = `reelection-verdict ${cls}`;
}

// ── MID-GAME REPORT ───────────────────────────────────────────────────────────

const MIDGAME_CHECKPOINTS = new Set([13, 25, 27]); // months after: 12, 24, 26

/**
 * Maps each Catholic Social Teaching principle to its most relevant stat.
 * Used by the mid-game hints to flag if that stat is currently weak.
 */
const PRINCIPLE_STAT = {
  'Dignity of Work and Rights of Workers': 'justice',
  'Option for the Poor and Vulnerable':    'people',
  'Stewardship of Creation':               'environment',
  'Community and the Common Good':         'people',
  'Human Dignity':                         'people',
  'Global Solidarity':                     'faith',
  'Participation in Society':              'people',
  'Promotion of Peace':                    'justice',
  'Rights and Responsibilities':           'justice',
  'Role of Government':                    'infrastructure',
};

/**
 * CONSEQUENCE_CHAINS
 *
 * Defines follow-up scenarios that are injected into the queue after
 * a specific source scenario is decided upon.
 *
 * Structure:
 *   key   — source scenario ID
 *   value — array of chain entries, each with:
 *     choiceIndex  : which choice (0/1/2) triggers this chain
 *                    (use -1 to trigger on ANY choice)
 *     delay        : how many months later the follow-up appears
 *     scenario     : a full inline scenario object (no id needed)
 *
 * The triggered scenario is injected into gameState.pendingConsequences
 * as { scenario, triggerMonth }. getRandomScenario() checks the queue first.
 */
const CONSEQUENCE_CHAINS = {

  // Factory Expansion → worker complaint or community thanks
  1: [
    {
      choiceIndex: 0,   // "Approve the factory to create jobs"
      delay: 6,
      scenario: {
        id: 'chain_1a',
        title: 'Factory Workers Demand Safety Review',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'Six months after the factory opened, union leaders report a surge in workplace injuries. Workers demand an independent safety audit — and warn of a strike if ignored.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Factory Expansion Proposal',
        choices: [
          { text: 'Order an independent safety audit', faith: 3, economy: -2, people: 2, environment: 0, justice: 4, infrastructure: 0 },
          { text: 'Dismiss the complaint', faith: -3, economy: 2, people: -3, environment: 0, justice: -4, infrastructure: 0 },
          { text: 'Commission an internal review', faith: 1, economy: 0, people: 0, environment: 0, justice: 1, infrastructure: 0 }
        ]
      }
    },
    {
      choiceIndex: 1,   // "Reject the factory to protect residents"
      delay: 5,
      scenario: {
        id: 'chain_1b',
        title: 'Neighbourhood Celebrates Clean Air Victory',
        principle: 'Stewardship of Creation',
        situation: 'Residents near the rejected factory site have organised a community land trust to turn the area into green space. They ask the city for a small matching grant.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Factory Expansion Proposal',
        choices: [
          { text: 'Provide the matching grant', faith: 2, economy: -2, people: 3, environment: 4, justice: 2, infrastructure: 1 },
          { text: 'Decline — let them fundraise independently', faith: 0, economy: 1, people: 0, environment: 1, justice: 0, infrastructure: 0 },
          { text: 'Offer land but no funds', faith: 1, economy: 0, people: 1, environment: 2, justice: 1, infrastructure: 0 }
        ]
      }
    }
  ],

  // Refugee Resettlement → integration success or tension
  2: [
    {
      choiceIndex: 0,   // "Welcome the refugees"
      delay: 8,
      scenario: {
        id: 'chain_2a',
        title: 'Refugee Integration Program Needs Funding',
        principle: 'Global Solidarity',
        situation: 'Eight months in, the refugee families are settling well — but the integration program is underfunded. Community groups warn services will collapse without city support.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Refugee Resettlement Request',
        choices: [
          { text: 'Increase city funding', faith: 4, economy: -3, people: 2, environment: 0, justice: 3, infrastructure: 1 },
          { text: 'Seek federal cost-sharing', faith: 2, economy: -1, people: 1, environment: 0, justice: 2, infrastructure: 0 },
          { text: 'Reduce program scope', faith: -2, economy: 1, people: -2, environment: 0, justice: -2, infrastructure: 0 }
        ]
      }
    },
    {
      choiceIndex: 1,   // "Refuse the request"
      delay: 7,
      scenario: {
        id: 'chain_2b',
        title: 'Faith Communities Open Private Shelter',
        principle: 'Global Solidarity',
        situation: 'After the city\'s refusal, local churches and mosques have quietly housed dozens of refugees themselves. They now ask the city for zoning exemptions to expand.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Refugee Resettlement Request',
        choices: [
          { text: 'Grant the zoning exemptions', faith: 5, economy: -1, people: 2, environment: 0, justice: 3, infrastructure: 0 },
          { text: 'Deny the exemptions', faith: -5, economy: 0, people: -2, environment: 0, justice: -3, infrastructure: 0 },
          { text: 'Grant limited exemptions with conditions', faith: 2, economy: 0, people: 1, environment: 0, justice: 1, infrastructure: 0 }
        ]
      }
    }
  ],

  // Homeless Shelter Funding → neighbourhood response
  3: [
    {
      choiceIndex: 0,   // "Fully fund the shelter"
      delay: 9,
      scenario: {
        id: 'chain_3a',
        title: 'Shelter Reports Housing Transitions',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'The downtown shelter has successfully moved 40 residents into permanent housing. The director asks for expansion funding to help the remaining 120 on the waitlist.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Homeless Shelter Funding',
        choices: [
          { text: 'Fund the expansion', faith: 5, economy: -3, people: 3, environment: 0, justice: 4, infrastructure: 2 },
          { text: 'Maintain current funding only', faith: 1, economy: 0, people: 0, environment: 0, justice: 1, infrastructure: 0 },
          { text: 'Partner with provincial housing authority', faith: 3, economy: -1, people: 2, environment: 0, justice: 2, infrastructure: 1 }
        ]
      }
    }
  ],

  // Minimum Wage Debate → economic ripple
  4: [
    {
      choiceIndex: 0,   // "Support a wage increase"
      delay: 7,
      scenario: {
        id: 'chain_4a',
        title: 'Small Businesses Report Wage Pressure',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'Seven months after the wage increase passed, a coalition of small restaurants and shops reports it is struggling to absorb costs. Some have cut hours; two have closed.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Minimum Wage Debate',
        choices: [
          { text: 'Introduce small business relief fund', faith: 2, economy: -2, people: 1, environment: 0, justice: 2, infrastructure: 0 },
          { text: 'Hold the line — wages must be maintained', faith: 1, economy: -3, people: 2, environment: 0, justice: 3, infrastructure: 0 },
          { text: 'Phase in a slower rate increase', faith: 0, economy: 1, people: -1, environment: 0, justice: -1, infrastructure: 0 }
        ]
      }
    }
  ],

  // Water Pollution Crisis → long-term cleanup outcome
  16: [
    {
      choiceIndex: -1,  // any choice
      delay: 10,
      scenario: {
        id: 'chain_16a',
        title: 'River Health Report Released',
        principle: 'Stewardship of Creation',
        situation: 'A year after action was taken on the factory pollution, the annual river health report is in. Residents are asking the city to commit to ongoing water quality monitoring.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Water Pollution Crisis',
        choices: [
          { text: 'Fund permanent water monitoring stations', faith: 2, economy: -3, people: 2, environment: 5, justice: 2, infrastructure: 3 },
          { text: 'Commission a one-time review only', faith: 0, economy: 0, people: 0, environment: 1, justice: 0, infrastructure: 0 },
          { text: 'Partner with university researchers', faith: 1, economy: -1, people: 1, environment: 3, justice: 1, infrastructure: 1 }
        ]
      }
    }
  ],

  // Affordable Housing Project → neighbourhood pushback or success
  11: [
    {
      choiceIndex: 0,  // "Fund the housing project"
      delay: 8,
      scenario: {
        id: 'chain_11a',
        title: 'Housing Project Faces Zoning Appeal',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'Neighbouring homeowners have filed a zoning appeal against the affordable housing project, citing concerns about density and property values. The project is stalled.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Affordable Housing Project',
        choices: [
          { text: 'Override the appeal and proceed', faith: 3, economy: -1, people: 1, environment: 0, justice: 4, infrastructure: 2 },
          { text: 'Negotiate a reduced development', faith: 1, economy: 0, people: -1, environment: 0, justice: 1, infrastructure: 1 },
          { text: 'Pause and hold public consultations', faith: 2, economy: -1, people: 2, environment: 0, justice: 2, infrastructure: 0 }
        ]
      }
    }
  ],

  // Public Transit Expansion → ridership milestone
  6: [
    {
      choiceIndex: 0,  // "Build the full expansion"
      delay: 10,
      scenario: {
        id: 'chain_6a',
        title: 'Transit Expansion Hits Ridership Target',
        principle: 'Community and the Common Good',
        situation: 'The expanded transit lines have exceeded ridership projections by 30%. The transit authority wants to add two more routes to underserved areas — but needs budget approval.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Public Transit Expansion',
        choices: [
          { text: 'Approve the new routes', people: 4, environment: 3, infrastructure: 4, economy: -3 },
          { text: 'Defer to next budget cycle', economy: 1, people: -1 },
          { text: 'Approve one route now, one later', people: 2, environment: 1, infrastructure: 2, economy: -2 }
        ]
      }
    }
  ],

  // Police Budget → community trust or resentment
  5: [
    {
      choiceIndex: 0,  // "Increase police funding"
      delay: 7,
      scenario: {
        id: 'chain_5a',
        title: 'Police Oversight Review Demanded',
        principle: 'Promotion of Peace',
        situation: 'Seven months after the budget increase, a series of incidents involving officers has sparked calls for an independent oversight body. Community groups are organizing.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Police Budget Increase',
        choices: [
          { text: 'Establish independent oversight', justice: 5, people: 4, economy: -3 },
          { text: 'Reject external oversight', justice: -5, people: -4, economy: 2 },
          { text: 'Create internal review board', justice: 2, people: 2, economy: -2 }
        ]
      }
    },
    {
      choiceIndex: 1,  // "Fund social programs instead"
      delay: 8,
      scenario: {
        id: 'chain_5b',
        title: 'Community Programs Report Early Results',
        principle: 'Promotion of Peace',
        situation: 'The social programs funded instead of police have shown promising results — youth referrals to counselling are up, and local conflict calls are down. Advocates want to expand.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Police Budget Increase',
        choices: [
          { text: 'Expand the programs citywide', justice: 5, people: 4, economy: -4 },
          { text: 'Maintain current scope', justice: 2, people: 2, economy: -1 },
          { text: 'Redirect some funding back to police', justice: -3, people: -2, economy: 2 }
        ]
      }
    }
  ],

  // Worker Strike → long-term labour relations
  7: [
    {
      choiceIndex: 0,  // "Support the workers"
      delay: 6,
      scenario: {
        id: 'chain_7a',
        title: 'Sanitation Workers Win Contract',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'Following your support, workers secured a new contract. Now other city unions are emboldened — transit and park workers are jointly requesting similar terms.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Worker Strike',
        choices: [
          { text: 'Negotiate new contracts across the board', justice: 5, people: 3, economy: -5 },
          { text: 'Hold the line — one deal at a time', justice: -2, people: -2, economy: 3 },
          { text: 'Establish a fair wages commission', justice: 3, people: 2, economy: -2 }
        ]
      }
    },
    {
      choiceIndex: 1,  // "Force them back to work"
      delay: 5,
      scenario: {
        id: 'chain_7b',
        title: 'Sanitation Workers Plan General Strike',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'Forced back without a deal, sanitation workers have coordinated with other unions for a general strike in two weeks. The city risks a public health crisis if garbage goes uncollected.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Worker Strike',
        choices: [
          { text: 'Open urgent contract negotiations', justice: 4, people: 3, economy: -4 },
          { text: 'Seek a court injunction to block the strike', justice: -5, people: -3, economy: 2 },
          { text: 'Bring in temporary contractors', justice: -3, people: -2, economy: -2 }
        ]
      }
    }
  ],

  // Park vs Housing → development outcome
  8: [
    {
      choiceIndex: 0,  // "Approve development"
      delay: 9,
      scenario: {
        id: 'chain_8a',
        title: 'Residents Demand Green Space Replacement',
        principle: 'Stewardship of Creation',
        situation: 'A year after the park was developed, the loss of green space has become a flashpoint. A petition with 8,000 signatures demands the city create a replacement park elsewhere.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Park vs Housing Development',
        choices: [
          { text: 'Fund a new park in an underserved area', environment: 5, people: 4, economy: -4 },
          { text: 'Create a rooftop garden program instead', environment: 3, people: 2, economy: -2 },
          { text: 'Decline — the housing was the right call', environment: -4, people: -3, economy: 2 }
        ]
      }
    }
  ],

  // Youth Advisory Council → youth engagement
  9: [
    {
      choiceIndex: 0,  // "Create the council"
      delay: 8,
      scenario: {
        id: 'chain_9a',
        title: 'Youth Council Proposes Climate Policy',
        principle: 'Participation in Society',
        situation: 'The Youth Advisory Council has produced its first report: a detailed climate action plan for city buildings, complete with cost estimates. Councillors are divided.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Youth Advisory Council',
        choices: [
          { text: 'Adopt the youth climate plan', environment: 5, faith: 3, economy: -4 },
          { text: 'Refer it for further study', people: 2, environment: 1, economy: -1 },
          { text: 'Dismiss the report as inexperienced', people: -4, faith: -3, justice: -2 }
        ]
      }
    }
  ],

  // School Funding → academic outcomes
  14: [
    {
      choiceIndex: 0,  // "Increase school funding"
      delay: 10,
      scenario: {
        id: 'chain_14a',
        title: 'Schools Report Improved Outcomes',
        principle: 'Rights and Responsibilities',
        situation: 'The additional school funding has reduced class sizes and improved graduation rates. Teachers are now requesting a permanent salary increase to retain staff.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: School Funding Debate',
        choices: [
          { text: 'Grant permanent salary increases', justice: 5, people: 4, economy: -5 },
          { text: 'Offer one-time bonuses instead', justice: 2, people: 2, economy: -3 },
          { text: 'Freeze pay — the class sizes are fixed now', justice: -3, people: -3, economy: 2 }
        ]
      }
    },
    {
      choiceIndex: 1,  // "Maintain current funding"
      delay: 8,
      scenario: {
        id: 'chain_14b',
        title: 'Teacher Shortage Hits City Schools',
        principle: 'Rights and Responsibilities',
        situation: 'Without new funding, three schools are critically understaffed. Teachers are leaving for better-paid suburban districts. Parents are threatening to pull their children.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: School Funding Debate',
        choices: [
          { text: 'Emergency funding injection', people: 5, justice: 4, economy: -5 },
          { text: 'Merge under-enrolled schools', people: -3, economy: 2, infrastructure: 2 },
          { text: 'Launch recruitment campaign only', people: 2, economy: -2, justice: 1 }
        ]
      }
    }
  ],

  // Public Health Clinic → community health outcomes
  15: [
    {
      choiceIndex: 0,  // "Open the clinic"
      delay: 9,
      scenario: {
        id: 'chain_15a',
        title: 'Clinic Overwhelmed by Demand',
        principle: 'Human Dignity',
        situation: 'The free clinic has been packed since opening — it is seeing three times the expected patients. The medical director says they need a second location or must start turning people away.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Public Health Clinic',
        choices: [
          { text: 'Fund a second clinic location', people: 5, faith: 4, economy: -5 },
          { text: 'Expand the existing site', people: 3, faith: 2, economy: -3 },
          { text: 'Introduce an income-means test', people: -3, faith: -3, economy: 2 }
        ]
      }
    }
  ],

  // Food Bank Funding → food security
  19: [
    {
      choiceIndex: 0,  // "Increase funding"
      delay: 7,
      scenario: {
        id: 'chain_19a',
        title: 'Food Bank Launches Community Kitchen',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'Buoyed by city support, the food bank has partnered with a culinary school to open a community kitchen offering free hot meals and job training. They need zoning approval.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Food Bank Funding',
        choices: [
          { text: 'Approve zoning and provide a grant', faith: 5, people: 4, economy: -4 },
          { text: 'Approve zoning but no extra funding', faith: 3, people: 3, economy: -1 },
          { text: 'Deny zoning — mixed commercial use concern', faith: -4, people: -4, economy: 2 }
        ]
      }
    }
  ],

  // Industrial Waste Regulation → compliance or evasion
  21: [
    {
      choiceIndex: 0,  // "Pass strict regulations"
      delay: 8,
      scenario: {
        id: 'chain_21a',
        title: 'Factory Challenges Waste Regulations in Court',
        principle: 'Stewardship of Creation',
        situation: 'Three industrial operators have launched a legal challenge to the new waste regulations, claiming unreasonable cost burdens. A judge has issued a temporary stay pending review.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Industrial Waste Regulation',
        choices: [
          { text: 'Fight the challenge — defend the regulations', environment: 5, justice: 4, economy: -4 },
          { text: 'Negotiate amended regulations', environment: 3, economy: -2, justice: 2 },
          { text: 'Withdraw and start over', environment: -4, justice: -3, economy: 2 }
        ]
      }
    }
  ],

  // Affordable Housing → zoning appeal (already exists at id 11)

  // Local Job Training → employment outcomes
  43: [
    {
      choiceIndex: 0,  // "Fund the training program"
      delay: 9,
      scenario: {
        id: 'chain_43a',
        title: 'Job Training Graduates Need Placement Support',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'The first cohort of 120 graduates is ready — but many are struggling to find placements. The program director asks the city to create a business incentive to hire graduates.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Local Job Training Program',
        choices: [
          { text: 'Create a hiring incentive for employers', justice: 4, people: 4, economy: -3 },
          { text: 'Partner with a trade union for placements', justice: 4, people: 3, economy: -2 },
          { text: 'Leave graduates to find jobs independently', justice: -3, people: -3, economy: 2 }
        ]
      }
    }
  ],

  // Public Housing Renovation → tenant outcomes
  54: [
    {
      choiceIndex: 0,  // "Fund full renovations"
      delay: 10,
      scenario: {
        id: 'chain_54a',
        title: 'Renovated Housing Wins Tenant Trust',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'Renovations have dramatically improved conditions. Inspired, a tenant association is now asking the city to give residents a formal say in future housing decisions through a resident board.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Public Housing Renovation',
        choices: [
          { text: 'Establish a formal resident board', justice: 5, people: 5, economy: -3 },
          { text: 'Create an informal consultation process', justice: 3, people: 3, economy: -1 },
          { text: 'Maintain city-only decision making', justice: -4, people: -4, economy: 2 }
        ]
      }
    },
    {
      choiceIndex: 1,  // "Delay renovations"
      delay: 6,
      scenario: {
        id: 'chain_54b',
        title: 'Housing Conditions Reach Crisis Point',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'Without renovations, two buildings have been condemned by inspectors. Over 300 residents need emergency temporary housing. The story has made the local news.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Public Housing Renovation',
        choices: [
          { text: 'Emergency repairs and temporary housing fund', people: 5, justice: 4, economy: -5 },
          { text: 'Relocate residents to private rentals at city cost', people: 3, economy: -4, infrastructure: -2 },
          { text: 'Issue safety notices and let tenants self-relocate', people: -5, faith: -4, justice: -3 }
        ]
      }
    }
  ],

  // Subsidized School Meals → student health
  59: [
    {
      choiceIndex: 0,  // "Fund the program"
      delay: 8,
      scenario: {
        id: 'chain_59a',
        title: 'School Meal Program Seeks Expansion',
        principle: 'Option for the Poor and Vulnerable',
        situation: 'Attendance and concentration have measurably improved since the meal program launched. Educators want to extend it to include breakfast and offer it across all grade levels.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Subsidized School Meals',
        choices: [
          { text: 'Expand to full breakfast and lunch program', people: 5, faith: 4, economy: -5 },
          { text: 'Add breakfast only', people: 3, faith: 2, economy: -3 },
          { text: 'Keep current scope — costs are sufficient', people: 1, economy: -1, justice: 1 }
        ]
      }
    }
  ],

  // Flood Barrier Project → disaster preparedness
  67: [
    {
      choiceIndex: 0,  // "Build the barriers"
      delay: 11,
      scenario: {
        id: 'chain_67a',
        title: 'Flood Season Tests the New Barriers',
        principle: 'Role of Government',
        situation: 'A major storm has hit — and the flood barriers held. No homes were lost. Now the federal government is offering matching funds to expand the barrier network to two more vulnerable areas.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Flood Barrier Project',
        choices: [
          { text: 'Accept matching funds and expand', infrastructure: 6, people: 4, economy: -4 },
          { text: 'Accept funds but delay construction', infrastructure: 3, economy: -2, people: 1 },
          { text: 'Decline — current barriers are sufficient', infrastructure: -2, people: -2, economy: 2 }
        ]
      }
    },
    {
      choiceIndex: 1,  // "Reject the project"
      delay: 9,
      scenario: {
        id: 'chain_67b',
        title: 'Flooding Devastates Unprotected Neighbourhoods',
        principle: 'Role of Government',
        situation: 'A major storm has caused severe flooding in areas that would have been protected. Dozens of families have lost their homes. The mayor\'s office is facing intense criticism.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Flood Barrier Project',
        choices: [
          { text: 'Emergency disaster relief fund', people: 5, faith: 4, economy: -5 },
          { text: 'Fast-track the original barrier plan', infrastructure: 5, economy: -5, people: 2 },
          { text: 'Blame unforeseen weather patterns', faith: -5, people: -5, justice: -4 }
        ]
      }
    }
  ],

  // Worker Paid Sick Leave → public health ripple
  83: [
    {
      choiceIndex: 0,  // "Grant paid sick leave"
      delay: 7,
      scenario: {
        id: 'chain_83a',
        title: 'Sick Leave Policy Credited With Lower Infection Rates',
        principle: 'Dignity of Work and Rights of Workers',
        situation: 'A city health report shows a measurable drop in workplace-transmitted illness since sick leave was introduced. Health officials want to extend the policy to private sector workers.',
        isConsequence: true,
        consequenceNote: '⚑ Follows from: Worker Paid Sick Leave',
        choices: [
          { text: 'Advocate for province-wide sick leave law', justice: 5, people: 4, economy: -3 },
          { text: 'Offer incentives for private employers to adopt it', justice: 3, people: 3, economy: -3 },
          { text: 'Keep it as a city employees policy only', justice: 1, people: 1, economy: -1 }
        ]
      }
    }
  ],
};

/**
 * One-sentence definitions for each Catholic Social Teaching principle.
 * Displayed beneath the principle tag on every scenario card.
 */
const PRINCIPLE_DEFINITIONS = {
  'Dignity of Work and Rights of Workers':
    'Work is more than a job — it is how people participate in creation and provide for their families. Workers deserve fair pay, safe conditions, and respect.',
  'Option for the Poor and Vulnerable':
    'When making decisions, we must ask: how does this affect those who are most in need? The measure of a society is how it treats its most vulnerable members.',
  'Stewardship of Creation':
    'The earth is a gift entrusted to us, not a resource to be consumed. We have a duty to care for the environment for future generations.',
  'Community and the Common Good':
    'We are social by nature. Good governance serves the whole community, not just the powerful few — seeking conditions that allow all people to flourish.',
  'Human Dignity':
    'Every person deserves to be treated with respect. No policy should reduce a person to a statistic or strip away their inherent worth.',
  'Global Solidarity':
    'We are one human family. Our responsibilities do not end at city or national borders — the suffering of distant people is our concern too.',
  'Participation in Society':
    'People have a right and a duty to take part in the decisions that affect their lives. Democracy only works when all voices can be heard.',
  'Promotion of Peace':
    'Peace is not just the absence of violence — it is the presence of justice and right relationships. Leaders must actively build the conditions for peace.',
  'Rights and Responsibilities':
    'Every person has fundamental rights — to education, healthcare, work, and safety. With those rights come responsibilities to one another and to the common good.',
  'Role of Government':
    'Government exists to serve the common good, protect rights, and do what individuals and communities cannot do alone. It must be just, accountable, and effective.',
};

/**
 *
 * Samples n unused scenarios (without marking them used) and returns
 * hint objects: { principle, stat, statValue, isWeak }
 * Used by the mid-game report to preview what kinds of decisions are coming.
 */
function getUpcomingHints(n = 3) {
  const pool = gameState.scenarios.filter(s => !gameState.usedScenarioIds.has(s.id));
  const sample = [];
  const seenPrinciples = new Set();
  // Shuffle a copy
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const s of shuffled) {
    if (!seenPrinciples.has(s.principle)) {
      seenPrinciples.add(s.principle);
      const stat = PRINCIPLE_STAT[s.principle] || 'people';
      const statValue = gameState.stats[stat];
      sample.push({
        principle: s.principle,
        stat,
        statValue,
        isWeak:    statValue < 40,
        isStrong:  statValue >= 65,
      });
    }
    if (sample.length >= n) break;
  }
  return sample;
}

/**
 * showMidgameReport()
 *
 * Pauses the game and displays a narrative checkpoint report.
 * Called when gameState.month enters 13, 25, or 27.
 * Includes a "What lies ahead" preview of upcoming decision themes,
 * cross-referenced against the player's current stat values.
 */
function showMidgameReport() {
  const month  = gameState.month;
  const stats  = gameState.stats;
  const avg    = Math.round(
    (stats.faith + stats.economy + stats.people +
     stats.environment + stats.justice + stats.infrastructure) / 6
  );

  // ── Label / title ──
  let eyebrow, title;
  if (month === 13) {
    eyebrow = 'END OF YEAR ONE';
    title   = 'Year One Complete';
  } else if (month === 25) {
    eyebrow = 'MID-TERM REPORT';
    title   = 'Two Years In';
  } else {
    eyebrow = 'FINAL STRETCH';
    title   = '10 Months Remaining';
  }

  // ── Narrative based on avg score ──
  let icon, headline, desc;
  if (avg >= 70) {
    icon     = '🏙️';
    headline = 'The city is thriving under your leadership.';
    desc     = 'Residents are proud and optimistic. Your approval is high — but the hardest decisions may still lie ahead.';
  } else if (avg >= 55) {
    icon     = '🌤️';
    headline = 'The city is making solid progress.';
    desc     = 'Most indicators are trending upward. A few stubborn challenges remain — address them before the election.';
  } else if (avg >= 40) {
    icon     = '⚠️';
    headline = 'The city is under strain.';
    desc     = 'Some areas are struggling. The public is watching closely — decisive action now could still turn the tide.';
  } else {
    icon     = '🚨';
    headline = 'The city is in serious trouble.';
    desc     = 'Multiple systems are faltering. Without urgent intervention, your term may end early or in defeat.';
  }

  // ── Highlight weakest stat ──
  const statKeys = ['faith','economy','people','environment','justice','infrastructure'];
  const weakest  = statKeys.reduce((a, b) => stats[a] < stats[b] ? a : b);
  desc += ` Your ${STAT_SHORT[weakest]} is your weakest area — watch it closely.`;

  // ── Upcoming hints ──
  const hints = getUpcomingHints(3);
  const hintsHTML = hints.map(h => {
    const statLabel = STAT_CONFIG.find(c => c.key === h.stat)?.label || h.stat;
    const color     = STAT_COLOR[h.stat];
    let   advisory, tier;
    if (h.isWeak) {
      tier     = 'hint-weak';
      advisory = `Your ${statLabel} is at ${h.statValue} — these decisions carry real risk.`;
    } else if (h.isStrong) {
      tier     = 'hint-strong';
      advisory = `Your ${statLabel} is at ${h.statValue} — you're well positioned here.`;
    } else {
      tier     = 'hint-neutral';
      advisory = `Your ${statLabel} is at ${h.statValue} — room to improve or to lose ground.`;
    }
    return `
      <div class="midgame-hint-card ${tier}">
        <div class="hint-principle">${h.principle}</div>
        <div class="hint-stat-row">
          <span class="hint-stat-chip" style="color:${color};border-color:${color}40">${statLabel} ${h.statValue}</span>
        </div>
        <div class="hint-advisory">${advisory}</div>
      </div>`;
  }).join('');

  // ── Populate screen ──
  els.midgameEyebrow.textContent  = eyebrow;
  els.midgameIcon.textContent     = icon;
  els.midgameTitle.textContent    = title;
  els.midgameHeadline.textContent = headline;
  els.midgameDesc.textContent     = desc;
  els.midgameScore.textContent    = avg;

  document.getElementById('midgameHints').innerHTML = hintsHTML;

  els.midgameStats.innerHTML = STAT_CONFIG.map(({ key, label, detailClass }) => `
    <div class="midgame-stat-item">
      <span class="midgame-stat-label">${label}</span>
      <span class="midgame-stat-value ${detailClass}">${stats[key]}</span>
    </div>
  `).join('');

  els.midgameScreen.classList.add('visible');
  console.log(`[midgame] Checkpoint at month ${month} | avg=${avg} | hints:`, hints.map(h => h.principle));
}

// ── STAT BAR RENDERING ────────────────────────────────────────────────────────

/**
 * updateStatBars()
 *
 * Reads every stat from gameState.stats and updates:
 *   - bar width (% = stat value)
 *   - numeric label
 *   - flash animation
 *   - overall score
 *   - city background
 */
function updateStatBars() {
  const stats = gameState.stats;
  let total = 0;

  STAT_CONFIG.forEach(({ key, barEl, valEl }) => {
    const clamped  = clamp(stats[key]);
    stats[key]     = clamped;

    barEl.style.width  = clamped + '%';
    valEl.textContent  = clamped;

    valEl.classList.remove('stat-flash');
    void valEl.offsetWidth;
    valEl.classList.add('stat-flash');

    total += clamped;
  });

  els.overallScore.textContent = total;
  updateCityBackground();
  updateApprovalBar();
}

// ── BACKGROUND MANAGER ────────────────────────────────────────────────────────

/**
 * updateCityBackground()
 *
 * Picks the city image based on individual stat thresholds (priority order):
 *   1. environment > 65    → city_green.png
 *   2. environment < 25    → city_polluted.png
 *   3. economy > 65        → city_prosperous.png
 *   4. economy < 25        → city_struggling.png
 *   5. infrastructure > 65 → city_industrial.png
 *   6. (default)           → city_normal.png
 *
 * Thresholds calibrated for 20–50 starting stats: players must actively build
 * a stat above 65 to unlock a positive cityscape, or let one fall below 25 for
 * a negative one. Shows a toast notification whenever the state changes.
 */
function updateCityBackground() {
  const { environment, economy, infrastructure } = gameState.stats;

  let file, icon, labelText;
  if      (environment    > 65) { file = 'city_green.png';      icon = '🌿'; labelText = 'Your city has become Green & Sustainable'; }
  else if (environment    < 25) { file = 'city_polluted.png';   icon = '🏭'; labelText = 'Pollution is taking hold of your city'; }
  else if (economy        > 65) { file = 'city_prosperous.png'; icon = '📈'; labelText = 'Your city is now Prosperous'; }
  else if (economy        < 25) { file = 'city_struggling.png'; icon = '📉'; labelText = 'Your city is Struggling economically'; }
  else if (infrastructure > 65) { file = 'city_industrial.png'; icon = '🏗️'; labelText = 'Your city has become Industrialised'; }
  else                          { file = 'city_normal.png';     icon = null; labelText = null; }

  const next = `backgrounds/${file}`;
  if (els.cityViewImg.getAttribute('src') !== next) {
    // Flash the panel border to draw attention to the change
    const panel = els.cityViewImg.parentElement;
    panel.classList.remove('city-flash');
    void panel.offsetWidth;
    panel.classList.add('city-flash');

    els.cityViewImg.style.opacity = '0';
    els.cityViewImg.src = next;
    els.cityViewImg.onload = () => { els.cityViewImg.style.opacity = '1'; };

    // Show prominent in-panel banner — but only after game has started (month > 1)
    if (icon && gameState.month > 1) showCityBanner(icon, labelText);
    console.log(`[bg] → ${file}`);
  }
}


// ── TERM PROGRESS ─────────────────────────────────────────────────────────────

function updateTermProgress() {
  els.monthDisplay.textContent = gameState.month;
}

// ── MAYOR SELECTION SCREEN ────────────────────────────────────────────────────

/** Currently highlighted card element (for keyboard nav / detail strip) */
let _selectedCardEl = null;

/**
 * Build and show the mayor selection grid.
 * Called once during init() before the game screen is visible.
 */
function buildMayorGrid() {
  MAYORS.forEach(mayor => {
    const card = document.createElement('div');
    card.className  = 'mayor-card';
    card.dataset.id = mayor.id;

    // ── Mini stat rows ──
    const miniRows = STAT_CONFIG.map(cfg => `
      <div class="mayor-mini-row">
        <span class="mayor-mini-label">${cfg.label}</span>
        <div class="mayor-mini-track">
          <div class="mayor-mini-fill ${cfg.miniClass}"
               style="width: ${mayor.stats[cfg.key]}%"></div>
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="mayor-portrait-wrap">
        <img src="${mayor.portrait}" alt="${mayor.name}" loading="lazy" />
      </div>
      <div class="mayor-card-name">${mayor.name}</div>
      <div class="mayor-card-tag">${mayor.tag}</div>
      <div class="mayor-traits">
        <span class="mayor-trait mayor-trait--bonus">⬆ ${mayor.traits.bonus.label}</span>
        <span class="mayor-trait mayor-trait--penalty">⬇ ${mayor.traits.penalty.label}</span>
      </div>
      <div class="mayor-mini-stats">${miniRows}</div>
      <button class="mayor-confirm-btn" data-id="${mayor.id}">
        ▶ &nbsp;SELECT THIS MAYOR
      </button>
    `;

    // Hover → update detail strip
    card.addEventListener('mouseenter', () => showMayorDetail(mayor));
    card.addEventListener('mouseleave', () => {
      if (_selectedCardEl !== card) clearMayorDetail();
    });

    // Click card → toggle selected state
    card.addEventListener('click', e => {
      // Don't double-fire if the confirm button was clicked
      if (e.target.classList.contains('mayor-confirm-btn')) return;
      selectCard(card, mayor);
    });

    // Confirm button → start game
    card.querySelector('.mayor-confirm-btn').addEventListener('click', () => {
      startGameWithMayor(mayor);
    });

    els.mayorGrid.appendChild(card);
  });
}

/**
 * Mark a card as selected (shows confirm button, keeps detail strip visible).
 */
function selectCard(cardEl, mayor) {
  // Deselect previous
  if (_selectedCardEl) _selectedCardEl.classList.remove('selected');

  cardEl.classList.add('selected');
  _selectedCardEl = cardEl;
  showMayorDetail(mayor);
}

/**
 * Populate the detail strip with a mayor's full stat breakdown.
 */
function showMayorDetail(mayor) {
  els.detailName.textContent = mayor.name;

  els.detailStats.innerHTML = STAT_CONFIG.map(cfg => `
    <div class="detail-stat-item">
      <span class="detail-stat-label">${cfg.label}</span>
      <span class="detail-stat-value ${cfg.detailClass}">${mayor.stats[cfg.key]}</span>
    </div>
  `).join('');
}

/**
 * Reset the detail strip to its default idle message.
 */
function clearMayorDetail() {
  els.detailName.textContent = 'Hover a mayor to preview their stats';
  els.detailStats.innerHTML  = '';
}

// ── GAME START TRANSITION ─────────────────────────────────────────────────────

/**
 * startGameWithMayor(mayor)
 *
 * 1. Write the mayor's stats into gameState.
 * 2. Update the mayor portrait in the sidebar advisor box.
 * 3. Render all stat bars from the new values.
 * 4. Fade out the selection screen.
 * 5. Reveal the game header + main area.
 * 6. Show a welcome toast.
 */
function startGameWithMayor(mayor) {
  // 1. Apply starting stats and record baseline for approval tracking
  gameState.mayor         = mayor;
  Object.assign(gameState.stats, mayor.stats);
  gameState.baselineStats = { ...mayor.stats };
  gameState.approval      = 50; // neutral — just elected

  // 2. Update sidebar advisor portrait
  els.advisorPortrait.innerHTML = `
    <img src="${mayor.portrait}" alt="${mayor.name}" />
  `;
  els.advisorName.textContent  = mayor.name;
  els.advisorQuote.textContent = `"${mayor.tag}"`;

  // Trait badges — bonus (green) and penalty (red) shown persistently
  if (els.advisorTraits && mayor.traits) {
    const { bonus, penalty } = mayor.traits;
    const bonusLabel   = STAT_CONFIG.find(c => c.key === bonus.stat)?.label || bonus.stat;
    const penaltyLabel = STAT_CONFIG.find(c => c.key === penalty.stat)?.label || penalty.stat;
    els.advisorTraits.innerHTML = `
      <div class="trait-badge trait-badge--bonus">
        <span class="trait-icon">▲</span>
        <span class="trait-text">+${bonus.amount} ${bonusLabel} per decision</span>
      </div>
      <div class="trait-badge trait-badge--penalty">
        <span class="trait-icon">▼</span>
        <span class="trait-text">-${penalty.amount} ${penaltyLabel} per decision</span>
      </div>
    `;
  }

  // 3. Render stat bars immediately — force city_normal first so starting
  //    stats never trigger a background state before the player has acted
  if (els.cityViewImg) els.cityViewImg.src = 'backgrounds/city_normal.png';
  updateStatBars();
  updateTermProgress();

  // 4. Fade out selection screen
  els.selectionScreen.classList.add('hiding');
  els.selectionScreen.addEventListener('animationend', () => {
    els.selectionScreen.style.display = 'none';
  }, { once: true });

  // 5. Show instruction screen (player dismisses it to begin)
  if (els.instructionScreen) {
    const imgEl = document.getElementById('instructionHandshake');
    if (imgEl) {
      const filename = INSTRUCTION_IMG_MAP[mayor.id] || `instruction_${mayor.id}.png`;
      imgEl.src = `instruction/${filename}`;
    }
    els.instructionScreen.classList.add('visible');
  }

  console.log('[gameState] Mayor selected:', mayor.name);
  console.log('[gameState] Starting stats:', { ...gameState.stats });
}

// ── PLACEHOLDER SCENARIO ──────────────────────────────────────────────────────

const PLACEHOLDER_SCENARIO = {
  title:     'Factory Expansion Proposal',
  principle: 'Dignity of Work and Rights of Workers',
  situation: 'A manufacturing company proposes building a new factory that would create hundreds of jobs but increase pollution near a working-class neighbourhood. The city council awaits your decision, Mayor.',
  choices: [
    { text: 'Approve the factory to create jobs' },
    { text: 'Reject the factory to protect residents' },
    { text: 'Approve with strict environmental rules' }
  ]
};

// Tracks when the current scenario was rendered — used for reading bonus
let _scenarioRenderTime = 0;

function renderScenario(scenario) {
  els.principleTag.textContent  = scenario.principle;
  els.scenarioTitle.textContent = scenario.title;
  els.scenarioDesc.textContent  = scenario.situation;

  // Principle definition
  if (els.principleDefinition) {
    els.principleDefinition.textContent = PRINCIPLE_DEFINITIONS[scenario.principle] || '';
  }

  // Show consequence note if this scenario is a chain follow-up
  let noteEl = document.getElementById('consequenceNote');
  if (scenario.isConsequence && scenario.consequenceNote) {
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = 'consequenceNote';
      noteEl.className = 'consequence-note';
      els.scenarioDesc.parentNode.insertBefore(noteEl, els.scenarioDesc);
    }
    noteEl.textContent = scenario.consequenceNote;
    noteEl.style.display = 'block';
  } else if (noteEl) {
    noteEl.style.display = 'none';
  }

  [0, 1, 2].forEach(i => {
    const choice = scenario.choices[i];
    const btn    = document.getElementById(`choice${i}`);
    const label  = document.getElementById(`choiceText${i}`);
    if (choice) {
      label.textContent = choice.text;
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });

  renderChoiceHints(scenario);

  // Reading bonus — record when this scenario was shown
  _scenarioRenderTime = Date.now();
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg) {
  els.toastText.textContent = msg;
  els.toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
}

/**
 * showCityBanner(icon, text)
 *
 * Shows a prominent overlay banner directly on the city view image
 * whenever the cityscape state changes. Auto-dismisses after 3.5s.
 */
let _cityBannerTimer = null;
function showCityBanner(icon, text) {
  if (!els.cityBanner) return;
  els.cityBannerIcon.textContent = icon;
  els.cityBannerText.textContent = text;
  els.cityBanner.classList.remove('city-banner--hide');
  els.cityBanner.classList.add('city-banner--show');
  if (_cityBannerTimer) clearTimeout(_cityBannerTimer);
  _cityBannerTimer = setTimeout(() => {
    els.cityBanner.classList.remove('city-banner--show');
    els.cityBanner.classList.add('city-banner--hide');
  }, 3500);
}

// ── LOG ───────────────────────────────────────────────────────────────────────

function addLogEntry(scenario, choice) {
  gameState.log.unshift({ month: gameState.month, title: scenario.title, choice: choice.text });

  const placeholder = els.logEntries.querySelector('.log-entry--placeholder');
  if (placeholder) placeholder.remove();

  // ── Net sentiment ──
  const statKeys = ['faith','economy','people','environment','justice','infrastructure'];
  const netSum   = statKeys.reduce((sum, k) => sum + (choice[k] || 0), 0);
  const sentimentClass = netSum > 3 ? 'log-entry--positive'
                       : netSum < -3 ? 'log-entry--negative'
                       : 'log-entry--mixed';

  // ── Delta chips (non-zero only, sorted by magnitude) ──
  const chips = statKeys
    .map(k => ({ key: k, val: choice[k] || 0 }))
    .filter(d => d.val !== 0)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
    .map(({ key, val }) => {
      const sign  = val > 0 ? '+' : '';
      const color = STAT_COLOR[key];
      return `<span class="log-chip" style="color:${color};border-color:${color}40">${sign}${val} ${STAT_SHORT[key]}</span>`;
    }).join('');

  // Reading bonus chip — shown if the player earned it this turn
  const bonusChip = choice._readingBonus
    ? `<span class="log-chip log-chip--bonus">📖 +1 Faith</span>`
    : '';

  const entry = document.createElement('div');
  entry.className = `log-entry ${sentimentClass}`;
  entry.innerHTML = `
    <div class="log-header">
      <span class="log-month">Month ${gameState.month}</span>
      <span class="log-principle">${scenario.principle}</span>
    </div>
    <span class="log-text">${choice.text}</span>
    ${(chips || bonusChip) ? `<div class="log-chips">${chips}${bonusChip}</div>` : ''}
  `;
  els.logEntries.prepend(entry);
}

// ── CHOICE LOGIC ─────────────────────────────────────────────────────────────

/**
 * applyChoice(choice)
 *
 * Adds each stat delta from the chosen option to gameState.stats.
 * clamp() keeps every value within 0–100.
 */
function applyChoice(choice) {
  const s = gameState.stats;
  s.faith          = clamp(s.faith          + (choice.faith          || 0));
  s.economy        = clamp(s.economy        + (choice.economy        || 0));
  s.people         = clamp(s.people         + (choice.people         || 0));
  s.environment    = clamp(s.environment    + (choice.environment    || 0));
  s.justice        = clamp(s.justice        + (choice.justice        || 0));
  s.infrastructure = clamp(s.infrastructure + (choice.infrastructure || 0));

  // Apply mayor passive traits every decision
  if (gameState.mayor && gameState.mayor.traits) {
    const { bonus, penalty } = gameState.mayor.traits;
    s[bonus.stat]   = clamp(s[bonus.stat]   + bonus.amount);
    s[penalty.stat] = clamp(s[penalty.stat] - penalty.amount);
  }
}

/**
 * checkLoseConditions()
 *
 * Checks every stat. Returns the display name of the first stat that
 * has hit 0, or null if the city is still standing.
 *
 * @returns {string|null}
 */
function checkLoseConditions() {
  const labels = {
    faith:          'Faith',
    economy:        'Economy',
    people:         'People',
    environment:    'Environment',
    justice:        'Justice',
    infrastructure: 'Infrastructure'
  };
  for (const [key, label] of Object.entries(labels)) {
    if (gameState.stats[key] <= 0) return label;
  }
  return null;
}

/**
 * showGameOver(collapsedStat)
 *
 * Reveals the game over overlay with the collapsed stat name,
 * a snapshot of all final stats, and months served.
 *
 * @param {string} collapsedStat  - Display name e.g. "Economy"
 */
function showGameOver(collapsedStat) {
  // Pick a thematic icon per collapsed stat
  const icons = {
    Faith:          '✝',
    Economy:        '💸',
    People:         '💔',
    Environment:    '🌫',
    Justice:        '⚖',
    Infrastructure: '🏚'
  };
  els.gameoverIcon.textContent   = icons[collapsedStat] || '💀';
  els.gameoverReason.textContent = `The city's ${collapsedStat.toLowerCase()} has collapsed.`;
  els.gameoverMonths.textContent = gameState.month - 1;

  // Final stat snapshot
  els.gameoverStats.innerHTML = STAT_CONFIG.map(({ key, label, detailClass }) => {
    const val       = gameState.stats[key];
    const collapsed = val <= 0 ? ' collapsed' : '';
    return `
      <div class="gameover-stat-item">
        <span class="gameover-stat-label">${label}</span>
        <span class="gameover-stat-value ${detailClass}${collapsed}">${val}</span>
      </div>
    `;
  }).join('');

  els.gameoverScreen.classList.add('visible');
  playTrack('loss');
}

/**
 * restartGame()
 *
 * Resets all game state and sends the player back to the
 * mayor selection screen without reloading the page.
 * Scenarios stay loaded — no need to re-fetch.
 */
function restartGame() {
  // Reset state
  gameState.month           = 1;
  gameState.mayor           = null;
  gameState.currentScenario = null;
  gameState.log             = [];
  gameState.approval        = 50;
  gameState.baselineStats   = null;
  gameState.pendingConsequences = [];
  gameState.triggeredChains.clear();
  gameState.usedScenarioIds.clear();
  Object.assign(gameState.stats, { faith: 50, economy: 50, people: 50, environment: 50, justice: 50, infrastructure: 50 });

  // Hide game over screen
  els.gameoverScreen.classList.remove('visible');

  // Hide election screen
  els.electionScreen.classList.remove('visible');

  // Hide mid-game report screen
  if (els.midgameScreen)      els.midgameScreen.classList.remove('visible');
  if (els.instructionScreen)  els.instructionScreen.classList.remove('visible');

  // Hide game UI
  els.gameHeader.classList.remove('visible');
  els.gameMain.classList.remove('visible');

  // Reset log panel
  els.logEntries.innerHTML = `
    <div class="log-entry log-entry--placeholder">
      <span class="log-month">—</span>
      <span class="log-text">Your decisions will appear here...</span>
    </div>
  `;

  // Reset advisor box
  els.advisorPortrait.innerHTML = '<div class="portrait-placeholder">👤</div>';
  els.advisorName.textContent   = 'City Advisor';
  els.advisorQuote.textContent  = '"The city awaits your leadership, Mayor."';
  if (els.advisorTraits) els.advisorTraits.innerHTML = '';

  // Reset selection screen
  if (_selectedCardEl) {
    _selectedCardEl.classList.remove('selected');
    _selectedCardEl = null;
  }
  clearMayorDetail();
  els.selectionScreen.classList.remove('hiding');
  els.selectionScreen.style.display = '';

  // Reset city view image
  els.cityViewImg.src = 'backgrounds/city_normal.png';
  els.cityViewImg.style.opacity = '1';

  // Reset term bar and approval bar
  updateTermProgress();
  if (els.reelectFill) {
    els.reelectFill.style.width = '0%';
    els.reelectFill.classList.remove('approval-low', 'approval-mid', 'approval-high');
  }
  if (els.reelectValue) els.reelectValue.textContent = '—';
  if (els.reelectionFill) {
    els.reelectionFill.style.width = '0%';
    els.reelectionFill.classList.remove('relect-very-likely','relect-likely','reelect-tossup','reelect-unlikely','reelect-very-unlikely');
  }
  if (els.reelectionValue)  els.reelectionValue.textContent  = '—';
  if (els.reelectionVerdict) {
    els.reelectionVerdict.textContent = '';
    els.reelectionVerdict.className   = 'reelection-verdict';
  }

  // Return to menu music
  playTrack('menu');

  console.log('[restartGame] Game reset. Awaiting mayor selection.');
}

/**
 * generateEpilogue(mayor, stats, verdict, score)
 *
 * Builds a 2–3 sentence personalised legacy paragraph for the election screen.
 * Draws on: mayor archetype, strongest stat, weakest stat, and election outcome.
 */
function generateEpilogue(mayor, stats, verdict, score) {
  const statKeys  = ['faith','economy','people','environment','justice','infrastructure'];
  const statNames = { faith:'faith community', economy:'local economy', people:'residents',
                      environment:'environment', justice:'social justice', infrastructure:'city infrastructure' };
  const strongest = statKeys.reduce((a, b) => stats[a] > stats[b] ? a : b);
  const weakest   = statKeys.reduce((a, b) => stats[a] < stats[b] ? a : b);
  const mayorName = mayor ? mayor.name : 'The Mayor';
  const won       = score >= 50;

  // Opening — what they'll be remembered for
  const legacyLines = {
    faith:          `${mayorName} will be remembered for a term defined by compassion and moral conviction, earning the deep trust of the city's faith communities.`,
    economy:        `${mayorName} will be remembered as a steady economic hand — local businesses grew, and unemployment fell during their time in office.`,
    people:         `${mayorName} will be remembered as a people's mayor — accessible, empathetic, and tireless in championing the needs of ordinary residents.`,
    environment:    `${mayorName} will be remembered for an ambitious environmental legacy, leaving the city measurably greener than they found it.`,
    justice:        `${mayorName} will be remembered for a fierce commitment to fairness — pushing for workers' rights, equal access, and accountability throughout their term.`,
    infrastructure: `${mayorName} will be remembered for building a stronger city from the ground up — new transit, roads, and civic infrastructure that will serve residents for decades.`,
  };

  // Middle — the trade-off they struggled with
  const struggleLines = {
    faith:          `Questions of community trust and moral leadership were a recurring challenge that divided public opinion.`,
    economy:        `Balancing the city's books against the needs of vulnerable residents proved a persistent tension throughout the term.`,
    people:         `Despite genuine care for residents, translating that goodwill into lasting systems of support proved difficult.`,
    environment:    `Environmental commitments were often squeezed by competing economic pressures, leaving some promises unfinished.`,
    justice:        `The pursuit of justice was sometimes outpaced by institutional resistance and short-term political calculus.`,
    infrastructure: `Critical infrastructure investments were hampered by budget constraints, and some projects stalled mid-term.`,
  };

  // Closing — outcome-based coda
  let coda;
  if (score >= 75) {
    coda = `The landslide result was a rare mandate — a city united behind a vision of the common good.`;
  } else if (score >= 62) {
    coda = `Reelected with a clear majority, they head into a second term with momentum and a mandate to finish what they started.`;
  } else if (score >= 50) {
    coda = `A narrow victory confirmed that the city believed in them — barely. The next term will demand bolder choices.`;
  } else if (score >= 38) {
    coda = `Defeat, narrowly, by a city that wanted more. The margin was close enough to leave real hope for the future.`;
  } else {
    coda = `The voters sought a new direction. Whether that search leads somewhere better remains to be seen.`;
  }

  return `${legacyLines[strongest]} ${struggleLines[weakest]} ${coda}`;
}

/**
 * showElection()
 *
 * Blends stat average (50%) with approval rating (50%) for the final score.
 * Five outcome tiers:
 *   >= 75  → Landslide Reelection
 *   >= 62  → Reelected
 *   >= 50  → Narrow Victory
 *   >= 38  → Narrow Loss
 *   <  38  → Defeated
 * Saves result to localStorage high score table (top 5).
 */
function showElection() {
  const stats    = gameState.stats;
  const statAvg  = Math.round(Object.values(stats).reduce((a, b) => a + b, 0) / 6);
  const approval = Math.round(gameState.approval);
  const final    = Math.round(statAvg * 0.5 + approval * 0.5);

  // Determine outcome
  let outcomeClass, verdictText, icon, desc;
  if (final >= 75) {
    outcomeClass = 'outcome-landslide';
    verdictText  = 'Landslide Reelection!';
    icon         = '🏆';
    desc         = 'The city overwhelmingly chose you for another term. A historic mandate.';
  } else if (final >= 62) {
    outcomeClass = 'outcome-reelected';
    verdictText  = 'Reelected';
    icon         = '✅';
    desc         = 'The voters have returned you to office. Your steady leadership earned their trust.';
  } else if (final >= 50) {
    outcomeClass = 'outcome-narrow-win';
    verdictText  = 'Narrow Victory';
    icon         = '📈';
    desc         = 'A hard-fought win — the city believed in you, just barely. Every vote counted.';
  } else if (final >= 38) {
    outcomeClass = 'outcome-narrow';
    verdictText  = 'Narrow Loss';
    icon         = '📊';
    desc         = 'A close race — the city was divided. Your opponent won by the slimmest of margins.';
  } else {
    outcomeClass = 'outcome-defeated';
    verdictText  = 'Defeated';
    icon         = '🗞';
    desc         = 'The voters chose a new direction. Your term ends today.';
  }

  // Populate screen
  els.electionIcon.textContent     = icon;
  els.verdictLabel.textContent     = verdictText;
  els.electionDesc.textContent     = desc;
  els.electionAvg.textContent      = final;
  els.breakdownStats.textContent   = statAvg;
  els.breakdownApproval.textContent = approval;

  els.electionVerdict.className = `election-verdict ${outcomeClass}`;

  // Final stat grid
  els.electionStats.innerHTML = STAT_CONFIG.map(({ key, label, detailClass }) => `
    <div class="gameover-stat-item">
      <span class="gameover-stat-label">${label}</span>
      <span class="gameover-stat-value ${detailClass}">${stats[key]}</span>
    </div>
  `).join('');

  // Epilogue paragraph
  const epilogue = generateEpilogue(gameState.mayor, gameState.stats, verdictText, final);
  if (els.electionEpilogue) els.electionEpilogue.textContent = epilogue;
  renderHighScores();

  els.electionScreen.classList.add('visible');
  playTrack('ending');
  console.log(`[showElection] statAvg=${statAvg} approval=${approval} final=${final} → ${verdictText}`);
}

// ── HIGH SCORES ───────────────────────────────────────────────────────────────

const HS_KEY = 'mayorGame_highScores';

function saveHighScore(score, verdict) {
  let scores = [];
  try { scores = JSON.parse(localStorage.getItem(HS_KEY)) || []; } catch(e) {}
  scores.push({
    score,
    verdict,
    mayor:  gameState.mayor ? gameState.mayor.name : '—',
    date:   new Date().toLocaleDateString('en-CA')  // YYYY-MM-DD
  });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 5);
  try { localStorage.setItem(HS_KEY, JSON.stringify(scores)); } catch(e) {}
}

function renderHighScores() {
  let scores = [];
  try { scores = JSON.parse(localStorage.getItem(HS_KEY)) || []; } catch(e) {}

  if (!scores.length) {
    els.highscoreList.innerHTML = '<div class="hs-empty">No scores yet — this is your first run!</div>';
    return;
  }

  els.highscoreList.innerHTML = scores.map((s, i) => `
    <div class="hs-row ${i === 0 ? 'hs-row--top' : ''}">
      <span class="hs-rank">${['🥇','🥈','🥉','4th','5th'][i]}</span>
      <span class="hs-mayor">${s.mayor}</span>
      <span class="hs-verdict">${s.verdict}</span>
      <span class="hs-score">${s.score}</span>
      <span class="hs-date">${s.date}</span>
    </div>
  `).join('');
}

/**
 * onChoiceClick(index)
 *
 * Full decision handler:
 *   1. Apply stat deltas from the chosen option
 *   2. Update stat bars
 *   3. Log the decision
 *   4. Check lose conditions → show game over if triggered
 *   5. Advance the month counter
 *   6. Load the next random scenario
 */
function onChoiceClick(index) {
  const scenario  = gameState.currentScenario || PLACEHOLDER_SCENARIO;
  let   choice    = scenario.choices[index];
  if (!choice) return;

  // Reading bonus — reward +1 Faith if player spent ≥10s reading the scenario.
  // Faith represents moral reflection; spending time on the principle earns a small boost.
  const readSeconds = (Date.now() - _scenarioRenderTime) / 1000;
  const earnedBonus = readSeconds >= 10 && _scenarioRenderTime > 0;
  if (earnedBonus) {
    gameState.stats.faith = clamp(gameState.stats.faith + 1);
    choice = { ...choice, _readingBonus: true };
  }
  _scenarioRenderTime = 0; // reset so bonus can't fire twice

  // 1. Apply stat changes
  applyChoice(choice);

  // 2. Trigger any consequence chains attached to this scenario + choice
  const srcId = scenario.id;
  if (srcId && CONSEQUENCE_CHAINS[srcId] && !gameState.triggeredChains.has(srcId)) {
    const chains = CONSEQUENCE_CHAINS[srcId];
    chains.forEach(chain => {
      if (chain.choiceIndex === -1 || chain.choiceIndex === index) {
        const triggerMonth = gameState.month + chain.delay;
        gameState.pendingConsequences.push({ scenario: chain.scenario, triggerMonth });
        console.log(`[consequence] Queued "${chain.scenario.title}" for month ${triggerMonth}`);
      }
    });
    gameState.triggeredChains.add(srcId);
  }

  // 2. Track recent People deltas for trend window (last 4 decisions)
  // 3. Recalculate approval (called inside updateStatBars → updateApprovalBar)

  // 4. Update all stat bars (also calls updateApprovalBar)
  updateStatBars();

  // 5. Log the decision
  addLogEntry(scenario, choice);

  // 6. Check for collapse
  const collapsed = checkLoseConditions();
  if (collapsed) {
    showGameOver(collapsed);
    return;
  }

  // 7. Advance month
  gameState.month++;
  updateTermProgress();

  // 8. Mid-game checkpoint (months 12 → 13, 24 → 25, 26 → 27)
  if (MIDGAME_CHECKPOINTS.has(gameState.month)) {
    showMidgameReport();
    return;   // resume via Continue button
  }

  // 9. Check for term end (36 months completed)
  if (gameState.month > gameState.maxMonths) {
    showElection();
    return;
  }

  // 10. Load next scenario
  const next = getRandomScenario();
  gameState.currentScenario = next;
  renderScenario(next);

  console.log(`[gameState] Month ${gameState.month} | approval=${Math.round(gameState.approval)} | stats:`, { ...gameState.stats });
}

els.choice0.addEventListener('click', () => onChoiceClick(0));
els.choice1.addEventListener('click', () => onChoiceClick(1));
els.choice2.addEventListener('click', () => onChoiceClick(2));

// Restart / play-again buttons — guarded against null in case HTML is out of sync
if (els.gameoverRestartBtn) els.gameoverRestartBtn.addEventListener('click', restartGame);
if (els.electionPlayBtn)    els.electionPlayBtn.addEventListener('click', restartGame);

// Maps mayor ID → instruction image filename (handles naming mismatches)
const INSTRUCTION_IMG_MAP = {
  businessleader:   'instruction_businessleader.png',
  environmental:    'instruction_environmentalist.png',
  communitybuilder: 'instruction_communitybuilder.png',
  faithleader:      'instruction_faithleader.png',
  idealist:         'instruction_idealist.png',
  lawandorder:      'instruction_lawandorder.png',
  policytechnocrat: 'instruction_policytechnocrat.png',
  socialjustice:    'instruction_socialjustice.png',
};
if (els.instructionBtn) {
  els.instructionBtn.addEventListener('click', () => {
    els.instructionScreen.classList.remove('visible');

    // Reveal game UI
    els.gameHeader.classList.add('visible');
    els.gameMain.classList.add('visible');

    // Load first scenario
    const first = getRandomScenario();
    gameState.currentScenario = first;
    renderScenario(first);

    // Welcome toast
    setTimeout(() => {
      showToast(`Mayor ${gameState.mayor.name} — your term begins. Good luck!`);
    }, 300);

    // Switch to gameplay music
    playTrack('gameplay');
  });
}

// Mid-game continue — hide report then load next scenario
if (els.midgameContinueBtn) {
  els.midgameContinueBtn.addEventListener('click', () => {
    els.midgameScreen.classList.remove('visible');
    // Check for term end (could have hit 36 at same checkpoint)
    if (gameState.month > gameState.maxMonths) {
      showElection();
      return;
    }
    const next = getRandomScenario();
    gameState.currentScenario = next;
    renderScenario(next);
  });
}

// Music toggle
document.getElementById('musicToggle').addEventListener('click', toggleMusic);

document.addEventListener('keydown', e => {
  // Only fire keyboard shortcuts while the game screen is active
  if (els.selectionScreen.style.display === 'none') {
    if (e.key === 'a' || e.key === 'A' || e.key === '1') onChoiceClick(0);
    if (e.key === 'b' || e.key === 'B' || e.key === '2') onChoiceClick(1);
    if (e.key === 'c' || e.key === 'C' || e.key === '3') onChoiceClick(2);
  }
});

// ── DEV HELPERS ───────────────────────────────────────────────────────────────
//  devSetStat('faith', 20)   → change one stat and re-render bars
//  devSetAllStats(30)         → set all stats to 30 and re-render bars

function devSetStat(key, value) {
  if (!(key in gameState.stats)) {
    console.warn(`[dev] Unknown stat "${key}". Valid:`, Object.keys(gameState.stats));
    return;
  }
  gameState.stats[key] = value;
  updateStatBars();
}

function devSetAllStats(value) {
  Object.keys(gameState.stats).forEach(k => { gameState.stats[k] = value; });
  updateStatBars();
}

window.gameState         = gameState;
window.updateStatBars    = updateStatBars;
window.devSetStat        = devSetStat;
window.devSetAllStats    = devSetAllStats;
window.loadScenarios     = loadScenarios;
window.getRandomScenario = getRandomScenario;
window.restartGame       = restartGame;
window.showGameOver      = showGameOver;
window.showElection      = showElection;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  await loadScenarios();

  renderScenario(PLACEHOLDER_SCENARIO);
  updateTermProgress();

  buildMayorGrid();

  // Hide the selection screen — the main menu sits in front on load.
  // startGameFromMenu() will reveal it when the player presses Start Game.
  els.selectionScreen.style.display = 'none';

  // Wire main menu buttons
  document.getElementById('menuStartBtn').addEventListener('click', startGameFromMenu);
  document.getElementById('menuMusicBtn').addEventListener('click', () => {
    toggleMusic();
    // If music was just turned on and we're still on the menu, start menu track
    if (_musicEnabled && !_currentTrack) playTrack('menu');
  });

  // Show the main menu
  showMainMenu();

  console.log('[Mayor for the Common Good] Ready. Showing main menu.');
}

init();
