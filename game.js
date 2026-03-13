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
    stats: { faith: 45, economy: 75, people: 55, environment: 40, justice: 50, infrastructure: 65 },
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
    stats: { faith: 60, economy: 40, people: 55, environment: 80, justice: 60, infrastructure: 45 },
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
    stats: { faith: 60, economy: 50, people: 75, environment: 55, justice: 65, infrastructure: 50 },
    traits: {
      bonus:   { stat: 'people',    amount: 1, label: '+1 People on every decision' },
      penalty: { stat: 'infrastructure', amount: 1, label: '-1 Infrastructure on every decision' }
    }
  },
  {
    id:       'faithleader',
    name:     'Faith Leader',
    tag:      'Grounds civic life in compassion & moral purpose',
    portrait: 'sprites/mayors/mayor_faithleader.png',
    stats: { faith: 80, economy: 45, people: 60, environment: 60, justice: 70, infrastructure: 40 },
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
    stats: { faith: 70, economy: 45, people: 65, environment: 55, justice: 60, infrastructure: 40 },
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
    stats: { faith: 55, economy: 60, people: 50, environment: 45, justice: 75, infrastructure: 60 },
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
    stats: { faith: 50, economy: 65, people: 45, environment: 50, justice: 55, infrastructure: 75 },
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
    stats: { faith: 65, economy: 40, people: 70, environment: 60, justice: 80, infrastructure: 45 },
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
  { id:1, title:"Factory Expansion Proposal", principle:"Dignity of Work and Rights of Workers", situation:"A manufacturing company proposes building a new factory that would create hundreds of jobs but increase pollution near a working-class neighbourhood.", choices:[{text:"Approve the factory to create jobs",faith:-1,economy:8,people:4,environment:-7,justice:-3,infrastructure:2},{text:"Reject the factory to protect residents",faith:3,economy:-6,people:-2,environment:7,justice:4,infrastructure:0},{text:"Approve with strict environmental rules",faith:4,economy:3,people:2,environment:3,justice:2,infrastructure:-1}]},
  { id:2, title:"Refugee Resettlement Request", principle:"Global Solidarity", situation:"The federal government asks your city to welcome 200 refugees fleeing war. Some residents support the plan while others worry about costs.", choices:[{text:"Welcome the refugees",faith:7,economy:-3,people:-2,environment:0,justice:5,infrastructure:-3},{text:"Refuse the request",faith:-6,economy:2,people:2,environment:0,justice:-5,infrastructure:1},{text:"Accept refugees with federal funding",faith:5,economy:-1,people:1,environment:0,justice:4,infrastructure:-1}]},
  { id:3, title:"Homeless Shelter Funding", principle:"Option for the Poor and Vulnerable", situation:"A charity asks the city to help fund a new homeless shelter downtown. Business leaders worry it may discourage tourism.", choices:[{text:"Fully fund the shelter",faith:6,economy:-4,people:2,environment:0,justice:5,infrastructure:2},{text:"Reject funding",faith:-6,economy:4,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Fund a smaller shelter",faith:4,economy:-2,people:1,environment:0,justice:3,infrastructure:1}]},
  { id:4, title:"Minimum Wage Debate", principle:"Dignity of Work and Rights of Workers", situation:"Worker groups demand the city support raising the local minimum wage. Small businesses warn it could lead to layoffs.", choices:[{text:"Support a wage increase",faith:3,economy:-4,people:3,environment:0,justice:5,infrastructure:0},{text:"Oppose the increase",faith:-3,economy:5,people:-2,environment:0,justice:-5,infrastructure:0},{text:"Gradually raise wages",faith:2,economy:2,people:2,environment:0,justice:3,infrastructure:0}]},
  { id:5, title:"Police Budget Increase", principle:"Promotion of Peace", situation:"Police leaders request a larger budget to respond to rising crime. Community groups want investment in social programs instead.", choices:[{text:"Increase police funding",faith:0,economy:-2,people:3,environment:0,justice:1,infrastructure:-2},{text:"Fund social programs instead",faith:2,economy:-3,people:2,environment:0,justice:4,infrastructure:1},{text:"Split the funding",faith:1,economy:-2,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:6, title:"Public Transit Expansion", principle:"Community and the Common Good", situation:"Your city considers expanding public transit to underserved neighbourhoods. The project would improve mobility but cost millions.", choices:[{text:"Build the full expansion",faith:2,economy:-5,people:4,environment:3,justice:2,infrastructure:7},{text:"Cancel the project",faith:-1,economy:3,people:-2,environment:-2,justice:-1,infrastructure:-5},{text:"Build a smaller version",faith:1,economy:-2,people:2,environment:1,justice:1,infrastructure:3}]},
  { id:7, title:"Worker Strike", principle:"Dignity of Work and Rights of Workers", situation:"City sanitation workers go on strike demanding better pay and safer conditions. Garbage is piling up across the city.", choices:[{text:"Support the workers",faith:3,economy:-3,people:-2,environment:-1,justice:5,infrastructure:0},{text:"Force them back to work",faith:-2,economy:3,people:2,environment:0,justice:-5,infrastructure:1},{text:"Negotiate a compromise",faith:2,economy:1,people:2,environment:0,justice:3,infrastructure:0}]},
  { id:8, title:"Park vs Housing Development", principle:"Stewardship of Creation", situation:"Developers want to build housing on a large green space. The project would ease the housing shortage but remove a major park.", choices:[{text:"Approve development",faith:-1,economy:4,people:1,environment:-7,justice:0,infrastructure:5},{text:"Protect the park",faith:3,economy:-3,people:3,environment:7,justice:1,infrastructure:0},{text:"Allow partial development",faith:1,economy:2,people:2,environment:2,justice:0,infrastructure:3}]},
  { id:9, title:"Youth Advisory Council", principle:"Participation in Society", situation:"Students ask the city to create a youth advisory council so young people can help influence policy.", choices:[{text:"Create the council",faith:2,economy:-1,people:4,environment:0,justice:3,infrastructure:1},{text:"Reject the idea",faith:-1,economy:0,people:-3,environment:0,justice:-3,infrastructure:0},{text:"Create a small pilot program",faith:1,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:10, title:"Military Equipment Donation", principle:"Promotion of Peace", situation:"The federal government offers surplus military equipment to local police forces.", choices:[{text:"Accept the equipment",faith:-1,economy:0,people:2,environment:0,justice:-3,infrastructure:2},{text:"Reject the equipment",faith:1,economy:0,people:-1,environment:0,justice:3,infrastructure:0},{text:"Accept with strict oversight",faith:1,economy:0,people:1,environment:0,justice:2,infrastructure:1}]},
  { id:11, title:"Affordable Housing Project", principle:"Option for the Poor and Vulnerable", situation:"A proposal would build affordable housing for low-income families but requires higher city spending.", choices:[{text:"Fund the housing project",faith:5,economy:-4,people:3,environment:0,justice:5,infrastructure:4},{text:"Reject the project",faith:-5,economy:3,people:-2,environment:0,justice:-4,infrastructure:0},{text:"Build fewer units",faith:2,economy:-2,people:1,environment:0,justice:2,infrastructure:2}]},
  { id:12, title:"Community Garden Initiative", principle:"Stewardship of Creation", situation:"Residents propose turning unused land into community gardens.", choices:[{text:"Support the gardens",faith:2,economy:-1,people:3,environment:5,justice:1,infrastructure:1},{text:"Sell land to developers",faith:-1,economy:4,people:0,environment:-4,justice:0,infrastructure:2},{text:"Divide the land between both",faith:1,economy:2,people:2,environment:1,justice:0,infrastructure:1}]},
  { id:13, title:"Local Business Tax Break", principle:"Role of Government", situation:"Business leaders ask for tax breaks to encourage investment in the city.", choices:[{text:"Grant tax breaks",faith:-1,economy:6,people:1,environment:0,justice:-2,infrastructure:-2},{text:"Reject the request",faith:1,economy:-3,people:-1,environment:0,justice:2,infrastructure:1},{text:"Offer limited incentives",faith:1,economy:3,people:1,environment:0,justice:1,infrastructure:-1}]},
  { id:14, title:"School Funding Debate", principle:"Rights and Responsibilities", situation:"Teachers request increased school funding for overcrowded classrooms.", choices:[{text:"Increase school funding",faith:3,economy:-3,people:4,environment:0,justice:4,infrastructure:3},{text:"Maintain current funding",faith:-1,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Provide partial funding",faith:1,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:15, title:"Public Health Clinic", principle:"Human Dignity", situation:"Health advocates propose opening a free clinic for low-income residents.", choices:[{text:"Open the clinic",faith:4,economy:-3,people:4,environment:0,justice:4,infrastructure:3},{text:"Reject the plan",faith:-4,economy:2,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Partner with charities",faith:3,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:16, title:"Water Pollution Crisis", principle:"Stewardship of Creation", situation:"Tests show a nearby factory may be polluting the city's river.", choices:[{text:"Fine the factory heavily",faith:2,economy:-3,people:2,environment:6,justice:3,infrastructure:0},{text:"Ignore the issue",faith:-4,economy:2,people:-2,environment:-6,justice:-4,infrastructure:0},{text:"Negotiate cleanup plan",faith:2,economy:0,people:2,environment:3,justice:2,infrastructure:0}]},
  { id:17, title:"Immigrant Support Services", principle:"Global Solidarity", situation:"Community groups ask the city to fund language and job training programs for immigrants.", choices:[{text:"Fund the programs",faith:4,economy:-2,people:3,environment:0,justice:4,infrastructure:2},{text:"Reject funding",faith:-3,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Offer limited funding",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:1}]},
  { id:18, title:"Public Protest Permit", principle:"Participation in Society", situation:"Activists request permission to hold a large protest downtown.", choices:[{text:"Approve the protest",faith:1,economy:-1,people:2,environment:0,justice:4,infrastructure:0},{text:"Deny the permit",faith:-1,economy:1,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Approve with restrictions",faith:1,economy:0,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:19, title:"Food Bank Funding", principle:"Option for the Poor and Vulnerable", situation:"Local food banks are struggling with rising demand.", choices:[{text:"Increase funding",faith:5,economy:-2,people:3,environment:0,justice:4,infrastructure:1},{text:"Maintain current funding",faith:-2,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Partner with charities",faith:3,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:20, title:"Bike Lane Expansion", principle:"Stewardship of Creation", situation:"Cycling groups want the city to expand bike lanes across downtown.", choices:[{text:"Build extensive bike lanes",faith:2,economy:-2,people:3,environment:5,justice:1,infrastructure:4},{text:"Reject the proposal",faith:-1,economy:1,people:-2,environment:-3,justice:0,infrastructure:0},{text:"Build limited lanes",faith:1,economy:-1,people:2,environment:2,justice:0,infrastructure:2}]},
  { id:21, title:"Industrial Waste Regulation", principle:"Stewardship of Creation", situation:"New regulations could reduce industrial waste but businesses say costs will rise.", choices:[{text:"Pass strict regulations",faith:3,economy:-4,people:2,environment:6,justice:3,infrastructure:0},{text:"Reject the regulations",faith:-2,economy:4,people:-1,environment:-5,justice:-2,infrastructure:0},{text:"Introduce gradual rules",faith:2,economy:1,people:1,environment:2,justice:1,infrastructure:0}]},
  { id:22, title:"Public Library Expansion", principle:"Community and the Common Good", situation:"Residents want to expand the public library system.", choices:[{text:"Build new libraries",faith:2,economy:-3,people:4,environment:0,justice:3,infrastructure:4},{text:"Reject expansion",faith:-1,economy:1,people:-3,environment:0,justice:-2,infrastructure:-2},{text:"Renovate existing libraries",faith:1,economy:-1,people:2,environment:0,justice:2,infrastructure:2}]},
  { id:23, title:"Senior Care Funding", principle:"Human Dignity", situation:"Advocates say senior care homes need additional city funding.", choices:[{text:"Increase funding",faith:4,economy:-3,people:3,environment:0,justice:4,infrastructure:3},{text:"Reject the request",faith:-4,economy:2,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Provide partial funding",faith:2,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:24, title:"International Sister City Program", principle:"Global Solidarity", situation:"Your city is invited to form a partnership with a city in a developing country.", choices:[{text:"Join the partnership",faith:3,economy:-1,people:2,environment:0,justice:2,infrastructure:1},{text:"Decline the offer",faith:-2,economy:1,people:-1,environment:0,justice:-1,infrastructure:0},{text:"Join with limited commitments",faith:2,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:25, title:"Community Mediation Program", principle:"Promotion of Peace", situation:"Community leaders propose mediation programs to resolve neighbourhood conflicts.", choices:[{text:"Fund the program",faith:3,economy:-1,people:4,environment:0,justice:4,infrastructure:1},{text:"Reject the proposal",faith:-2,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Launch a pilot program",faith:2,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},

  // ── scenarios_2.json ──
  { id:26, title:"Urban Tree Planting Program", principle:"Stewardship of Creation", situation:"Environmental groups propose planting thousands of trees across the city to improve air quality and reduce heat.", choices:[{text:"Fund the full program",faith:2,economy:-3,people:3,environment:7,justice:1,infrastructure:2},{text:"Reject the proposal",faith:-1,economy:1,people:-2,environment:-4,justice:0,infrastructure:0},{text:"Plant trees gradually",faith:1,economy:-1,people:2,environment:3,justice:0,infrastructure:1}]},
  { id:27, title:"Local Farm Subsidies", principle:"Community and the Common Good", situation:"Local farmers ask for subsidies to help them compete with large agricultural corporations.", choices:[{text:"Provide subsidies",faith:2,economy:-3,people:3,environment:2,justice:3,infrastructure:0},{text:"Refuse subsidies",faith:-1,economy:2,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Offer limited support",faith:1,economy:-1,people:1,environment:1,justice:1,infrastructure:0}]},
  { id:28, title:"Worker Safety Regulations", principle:"Dignity of Work and Rights of Workers", situation:"New workplace safety rules could protect employees but businesses warn they will increase operating costs.", choices:[{text:"Adopt strict regulations",faith:3,economy:-4,people:2,environment:0,justice:5,infrastructure:0},{text:"Reject the regulations",faith:-2,economy:4,people:-1,environment:0,justice:-4,infrastructure:0},{text:"Adopt moderate rules",faith:2,economy:1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:29, title:"Public Art Funding", principle:"Participation in Society", situation:"Artists propose a city program to fund murals and cultural art projects.", choices:[{text:"Fund the arts program",faith:1,economy:-2,people:4,environment:0,justice:1,infrastructure:1},{text:"Reject funding",faith:0,economy:1,people:-2,environment:0,justice:0,infrastructure:0},{text:"Create a small arts grant",faith:1,economy:-1,people:2,environment:0,justice:0,infrastructure:0}]},
  { id:30, title:"Public WiFi Expansion", principle:"Participation in Society", situation:"Tech groups want the city to expand free public WiFi access in low-income areas.", choices:[{text:"Fund full expansion",faith:2,economy:-2,people:4,environment:0,justice:3,infrastructure:4},{text:"Reject the proposal",faith:-1,economy:1,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Pilot program in some areas",faith:1,economy:0,people:2,environment:0,justice:2,infrastructure:2}]},
  { id:31, title:"Community Policing Initiative", principle:"Promotion of Peace", situation:"Police suggest launching community policing programs to improve trust with residents.", choices:[{text:"Launch the program",faith:2,economy:-1,people:4,environment:0,justice:4,infrastructure:1},{text:"Reject the plan",faith:-1,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Test the program in one district",faith:1,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:32, title:"Emergency Disaster Fund", principle:"Role of Government", situation:"Officials recommend creating an emergency disaster fund for floods and storms.", choices:[{text:"Create the fund",faith:2,economy:-3,people:3,environment:1,justice:2,infrastructure:2},{text:"Reject the proposal",faith:-1,economy:2,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Create a smaller fund",faith:1,economy:-1,people:1,environment:0,justice:1,infrastructure:1}]},
  { id:33, title:"Local Recycling Program", principle:"Stewardship of Creation", situation:"Environmental groups push for a citywide recycling initiative.", choices:[{text:"Launch the program",faith:2,economy:-2,people:3,environment:6,justice:1,infrastructure:3},{text:"Reject the program",faith:-1,economy:1,people:-2,environment:-5,justice:0,infrastructure:0},{text:"Start a smaller program",faith:1,economy:0,people:2,environment:3,justice:0,infrastructure:1}]},
  { id:34, title:"Childcare Subsidy", principle:"Human Dignity", situation:"Parents request city subsidies to make childcare more affordable.", choices:[{text:"Provide subsidies",faith:4,economy:-4,people:4,environment:0,justice:4,infrastructure:3},{text:"Reject the subsidies",faith:-4,economy:3,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Provide limited assistance",faith:2,economy:-2,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:35, title:"Local Business Grant", principle:"Role of Government", situation:"Small businesses request grants to recover from a recent economic downturn.", choices:[{text:"Provide grants",faith:1,economy:4,people:2,environment:0,justice:1,infrastructure:0},{text:"Reject the request",faith:-1,economy:-2,people:-2,environment:0,justice:-1,infrastructure:0},{text:"Provide smaller grants",faith:0,economy:2,people:1,environment:0,justice:0,infrastructure:0}]},
  { id:36, title:"Public Park Renovation", principle:"Community and the Common Good", situation:"Residents want the city to renovate an aging public park.", choices:[{text:"Fully renovate the park",faith:1,economy:-3,people:4,environment:4,justice:1,infrastructure:4},{text:"Cancel the renovation",faith:-1,economy:1,people:-3,environment:-1,justice:0,infrastructure:-2},{text:"Renovate part of the park",faith:0,economy:-1,people:2,environment:2,justice:0,infrastructure:2}]},
  { id:37, title:"Mental Health Services", principle:"Human Dignity", situation:"Doctors urge the city to fund more mental health services.", choices:[{text:"Expand services",faith:4,economy:-3,people:4,environment:0,justice:4,infrastructure:2},{text:"Reject expansion",faith:-4,economy:2,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Expand services gradually",faith:2,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:38, title:"City Festival Funding", principle:"Community and the Common Good", situation:"Tourism leaders propose a large annual festival to attract visitors.", choices:[{text:"Fund the festival",faith:1,economy:4,people:3,environment:-1,justice:0,infrastructure:1},{text:"Reject funding",faith:0,economy:-2,people:-2,environment:0,justice:0,infrastructure:0},{text:"Fund a smaller event",faith:0,economy:2,people:2,environment:0,justice:0,infrastructure:0}]},
  { id:39, title:"Food Waste Reduction Law", principle:"Stewardship of Creation", situation:"A proposal would require grocery stores to donate unsold food instead of throwing it away.", choices:[{text:"Pass the law",faith:3,economy:-2,people:3,environment:4,justice:3,infrastructure:1},{text:"Reject the law",faith:-2,economy:2,people:-1,environment:-3,justice:-2,infrastructure:0},{text:"Encourage voluntary programs",faith:1,economy:0,people:1,environment:1,justice:1,infrastructure:0}]},
  { id:40, title:"Community Sports Funding", principle:"Participation in Society", situation:"Youth organizations request funding for community sports leagues.", choices:[{text:"Fund the leagues",faith:2,economy:-2,people:4,environment:0,justice:2,infrastructure:1},{text:"Reject funding",faith:0,economy:1,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Provide partial funding",faith:1,economy:0,people:2,environment:0,justice:1,infrastructure:0}]},
  { id:41, title:"Affordable Transit Pass", principle:"Option for the Poor and Vulnerable", situation:"Advocates ask the city to offer discounted transit passes for low-income residents.", choices:[{text:"Introduce the discount",faith:4,economy:-3,people:3,environment:1,justice:4,infrastructure:2},{text:"Reject the proposal",faith:-3,economy:2,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Offer limited discounts",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:1}]},
  { id:42, title:"Green Energy Incentives", principle:"Stewardship of Creation", situation:"Environmental groups propose incentives for homes installing solar panels.", choices:[{text:"Provide incentives",faith:2,economy:-3,people:2,environment:6,justice:1,infrastructure:1},{text:"Reject incentives",faith:-1,economy:1,people:-1,environment:-4,justice:0,infrastructure:0},{text:"Offer smaller incentives",faith:1,economy:-1,people:1,environment:3,justice:0,infrastructure:0}]},
  { id:43, title:"Local Job Training Program", principle:"Dignity of Work and Rights of Workers", situation:"A program could train unemployed residents for skilled jobs.", choices:[{text:"Fund the training program",faith:3,economy:2,people:4,environment:0,justice:4,infrastructure:2},{text:"Reject the program",faith:-2,economy:-2,people:-3,environment:0,justice:-3,infrastructure:0},{text:"Fund a smaller program",faith:1,economy:1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:44, title:"Community Conflict Mediation", principle:"Promotion of Peace", situation:"Community leaders propose programs to mediate neighbourhood conflicts.", choices:[{text:"Fund the program",faith:3,economy:-1,people:4,environment:0,justice:4,infrastructure:1},{text:"Reject the proposal",faith:-2,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Launch a pilot program",faith:2,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:45, title:"Historic Building Preservation", principle:"Community and the Common Good", situation:"Developers want to demolish a historic building to build offices.", choices:[{text:"Preserve the building",faith:2,economy:-3,people:3,environment:1,justice:2,infrastructure:0},{text:"Allow demolition",faith:-1,economy:4,people:-1,environment:-1,justice:-1,infrastructure:2},{text:"Integrate building into development",faith:1,economy:2,people:2,environment:0,justice:1,infrastructure:1}]},
  { id:46, title:"Food Truck Regulations", principle:"Rights and Responsibilities", situation:"Restaurant owners want strict limits on food trucks competing downtown.", choices:[{text:"Restrict food trucks",faith:0,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Allow open competition",faith:1,economy:2,people:2,environment:0,justice:2,infrastructure:0},{text:"Create balanced regulations",faith:1,economy:1,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:47, title:"Public Swimming Pool", principle:"Community and the Common Good", situation:"Residents want the city to build a new public swimming pool.", choices:[{text:"Build the pool",faith:1,economy:-3,people:4,environment:0,justice:1,infrastructure:4},{text:"Reject the project",faith:0,economy:1,people:-3,environment:0,justice:0,infrastructure:-2},{text:"Renovate an existing pool",faith:1,economy:-1,people:2,environment:0,justice:0,infrastructure:2}]},
  { id:48, title:"Urban Farming Project", principle:"Stewardship of Creation", situation:"A proposal would support rooftop farming in the city.", choices:[{text:"Fund the project",faith:2,economy:-2,people:2,environment:5,justice:1,infrastructure:1},{text:"Reject the project",faith:-1,economy:1,people:-1,environment:-3,justice:0,infrastructure:0},{text:"Pilot the project",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:0}]},
  { id:49, title:"City Scholarship Program", principle:"Rights and Responsibilities", situation:"Educators propose scholarships for low-income students.", choices:[{text:"Create scholarships",faith:4,economy:-3,people:3,environment:0,justice:5,infrastructure:1},{text:"Reject the plan",faith:-4,economy:2,people:-2,environment:0,justice:-4,infrastructure:0},{text:"Create limited scholarships",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:50, title:"Noise Regulation Debate", principle:"Rights and Responsibilities", situation:"Residents complain about nightlife noise downtown.", choices:[{text:"Enforce strict noise rules",faith:1,economy:-2,people:2,environment:0,justice:2,infrastructure:0},{text:"Allow businesses to operate freely",faith:0,economy:3,people:-2,environment:0,justice:-1,infrastructure:0},{text:"Create balanced regulations",faith:1,economy:1,people:1,environment:0,justice:1,infrastructure:0}]},

  // ── scenarios_3.json ──
  { id:51, title:"Senior Transportation Program", principle:"Human Dignity", situation:"Community advocates propose a transportation service for seniors who can no longer drive.", choices:[{text:"Fund the program",faith:4,economy:-3,people:4,environment:1,justice:4,infrastructure:3},{text:"Reject the proposal",faith:-4,economy:2,people:-3,environment:0,justice:-3,infrastructure:0},{text:"Create a limited service",faith:2,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:52, title:"River Cleanup Initiative", principle:"Stewardship of Creation", situation:"Environmental groups ask the city to fund a large river cleanup project.", choices:[{text:"Fund the full cleanup",faith:3,economy:-4,people:3,environment:7,justice:2,infrastructure:1},{text:"Reject the project",faith:-2,economy:2,people:-2,environment:-6,justice:-2,infrastructure:0},{text:"Start a smaller cleanup",faith:2,economy:-1,people:2,environment:3,justice:1,infrastructure:0}]},
  { id:53, title:"Refugee Job Training", principle:"Global Solidarity", situation:"Charities propose job training programs to help refugees integrate into the workforce.", choices:[{text:"Fund the program",faith:4,economy:1,people:3,environment:0,justice:4,infrastructure:1},{text:"Reject funding",faith:-4,economy:1,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Provide limited support",faith:2,economy:0,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:54, title:"Public Housing Renovation", principle:"Option for the Poor and Vulnerable", situation:"Public housing buildings are aging and require costly renovations.", choices:[{text:"Fund full renovations",faith:5,economy:-5,people:3,environment:1,justice:5,infrastructure:5},{text:"Delay renovations",faith:-4,economy:2,people:-3,environment:0,justice:-4,infrastructure:-3},{text:"Renovate gradually",faith:3,economy:-2,people:2,environment:0,justice:3,infrastructure:2}]},
  { id:55, title:"City Compost Program", principle:"Stewardship of Creation", situation:"A proposal would introduce compost collection across the city.", choices:[{text:"Implement citywide composting",faith:2,economy:-2,people:2,environment:6,justice:1,infrastructure:3},{text:"Reject the program",faith:-1,economy:1,people:-2,environment:-4,justice:0,infrastructure:0},{text:"Pilot program",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:1}]},
  { id:56, title:"Worker Overtime Rules", principle:"Dignity of Work and Rights of Workers", situation:"Labour groups push for stronger overtime protections.", choices:[{text:"Adopt new protections",faith:3,economy:-3,people:2,environment:0,justice:5,infrastructure:0},{text:"Reject changes",faith:-3,economy:3,people:-1,environment:0,justice:-4,infrastructure:0},{text:"Adopt moderate protections",faith:2,economy:1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:57, title:"Neighbourhood Watch Program", principle:"Promotion of Peace", situation:"Residents propose organizing neighbourhood watch groups.", choices:[{text:"Support the program",faith:2,economy:-1,people:3,environment:0,justice:3,infrastructure:1},{text:"Reject the proposal",faith:-1,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Test in select neighbourhoods",faith:1,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:58, title:"Immigrant Cultural Festival", principle:"Participation in Society", situation:"Community leaders propose a festival celebrating immigrant cultures.", choices:[{text:"Fund the festival",faith:2,economy:2,people:4,environment:0,justice:3,infrastructure:1},{text:"Reject funding",faith:-1,economy:0,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Fund a smaller festival",faith:1,economy:1,people:2,environment:0,justice:1,infrastructure:0}]},
  { id:59, title:"Subsidized School Meals", principle:"Option for the Poor and Vulnerable", situation:"Educators propose subsidized meals for students from low-income families.", choices:[{text:"Fund the program",faith:5,economy:-3,people:4,environment:0,justice:5,infrastructure:2},{text:"Reject funding",faith:-5,economy:2,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Provide limited funding",faith:2,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:60, title:"Green Roof Requirement", principle:"Stewardship of Creation", situation:"Developers may be required to include green roofs on new buildings.", choices:[{text:"Require green roofs",faith:2,economy:-3,people:2,environment:6,justice:1,infrastructure:1},{text:"Reject the proposal",faith:-1,economy:2,people:-1,environment:-5,justice:0,infrastructure:0},{text:"Encourage but not require",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:0}]},
  { id:61, title:"Accessible Sidewalks Program", principle:"Human Dignity", situation:"Disability advocates push for accessible sidewalks citywide.", choices:[{text:"Fund accessibility upgrades",faith:4,economy:-4,people:3,environment:0,justice:5,infrastructure:5},{text:"Reject the plan",faith:-4,economy:2,people:-3,environment:0,justice:-4,infrastructure:-2},{text:"Upgrade gradually",faith:2,economy:-1,people:2,environment:0,justice:3,infrastructure:2}]},
  { id:62, title:"Youth Job Program", principle:"Dignity of Work and Rights of Workers", situation:"A program could help teenagers find summer jobs.", choices:[{text:"Fund the program",faith:2,economy:2,people:3,environment:0,justice:3,infrastructure:1},{text:"Reject funding",faith:-1,economy:-1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Launch a pilot program",faith:1,economy:1,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:63, title:"Urban Wildlife Protection", principle:"Stewardship of Creation", situation:"Conservationists ask the city to protect habitats for wildlife.", choices:[{text:"Protect habitats",faith:2,economy:-2,people:2,environment:6,justice:1,infrastructure:0},{text:"Allow development",faith:-1,economy:3,people:-1,environment:-5,justice:-1,infrastructure:1},{text:"Protect some areas",faith:1,economy:1,people:1,environment:2,justice:0,infrastructure:0}]},
  { id:64, title:"City Mediation Service", principle:"Promotion of Peace", situation:"The city could fund mediation services to resolve disputes.", choices:[{text:"Fund the service",faith:3,economy:-1,people:3,environment:0,justice:4,infrastructure:1},{text:"Reject funding",faith:-2,economy:1,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Pilot the program",faith:1,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:65, title:"Affordable Internet Access", principle:"Participation in Society", situation:"Advocates propose subsidized internet for low-income households.", choices:[{text:"Subsidize internet",faith:3,economy:-2,people:4,environment:0,justice:4,infrastructure:2},{text:"Reject subsidies",faith:-2,economy:1,people:-3,environment:0,justice:-3,infrastructure:0},{text:"Limited subsidies",faith:1,economy:0,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:66, title:"City Peace Conference", principle:"Promotion of Peace", situation:"Faith leaders propose a conference promoting peace and dialogue.", choices:[{text:"Fund the conference",faith:4,economy:-1,people:3,environment:0,justice:3,infrastructure:1},{text:"Reject funding",faith:-3,economy:0,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Support through partnerships",faith:2,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:67, title:"Flood Barrier Project", principle:"Role of Government", situation:"Engineers propose building barriers to protect against future flooding.", choices:[{text:"Build the barriers",faith:2,economy:-5,people:3,environment:2,justice:2,infrastructure:6},{text:"Reject the project",faith:-1,economy:2,people:-3,environment:-2,justice:-1,infrastructure:-4},{text:"Build smaller barriers",faith:1,economy:-2,people:1,environment:1,justice:1,infrastructure:3}]},
  { id:68, title:"Community Health Campaign", principle:"Human Dignity", situation:"Health officials propose a campaign promoting healthier lifestyles.", choices:[{text:"Fund the campaign",faith:3,economy:-2,people:4,environment:0,justice:3,infrastructure:1},{text:"Reject the campaign",faith:-2,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Run a smaller campaign",faith:1,economy:0,people:2,environment:0,justice:1,infrastructure:0}]},
  { id:69, title:"Public Transit Safety", principle:"Promotion of Peace", situation:"Officials propose additional safety measures on public transit.", choices:[{text:"Increase safety funding",faith:1,economy:-2,people:3,environment:0,justice:2,infrastructure:2},{text:"Reject the proposal",faith:-1,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Increase security gradually",faith:1,economy:0,people:1,environment:0,justice:1,infrastructure:1}]},
  { id:70, title:"City Tree Protection Law", principle:"Stewardship of Creation", situation:"Environmentalists want stronger protections for city trees.", choices:[{text:"Pass the law",faith:2,economy:-2,people:2,environment:6,justice:1,infrastructure:0},{text:"Reject the law",faith:-1,economy:2,people:-1,environment:-5,justice:-1,infrastructure:0},{text:"Create moderate protections",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:0}]},
  { id:71, title:"Worker Cooperative Grants", principle:"Dignity of Work and Rights of Workers", situation:"Workers want grants to start employee-owned cooperatives.", choices:[{text:"Provide grants",faith:3,economy:1,people:3,environment:0,justice:4,infrastructure:1},{text:"Reject grants",faith:-2,economy:0,people:-2,environment:0,justice:-3,infrastructure:0},{text:"Provide smaller grants",faith:1,economy:1,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:72, title:"Urban Air Quality Monitoring", principle:"Stewardship of Creation", situation:"Scientists want air quality monitoring stations across the city.", choices:[{text:"Fund monitoring stations",faith:2,economy:-2,people:2,environment:5,justice:1,infrastructure:2},{text:"Reject the proposal",faith:-1,economy:1,people:-1,environment:-3,justice:0,infrastructure:0},{text:"Install limited stations",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:1}]},
  { id:73, title:"Neighbourhood Community Centers", principle:"Community and the Common Good", situation:"Residents want more community centers for social activities.", choices:[{text:"Build new centers",faith:2,economy:-4,people:4,environment:0,justice:2,infrastructure:5},{text:"Reject the proposal",faith:-1,economy:2,people:-3,environment:0,justice:-1,infrastructure:-2},{text:"Renovate existing centers",faith:1,economy:-1,people:2,environment:0,justice:1,infrastructure:2}]},
  { id:74, title:"Fair Housing Enforcement", principle:"Rights and Responsibilities", situation:"Investigations reveal discrimination in housing rentals.", choices:[{text:"Increase enforcement",faith:3,economy:-1,people:2,environment:0,justice:5,infrastructure:0},{text:"Ignore the issue",faith:-4,economy:0,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Create a review committee",faith:2,economy:0,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:75, title:"Community Volunteer Program", principle:"Participation in Society", situation:"Leaders propose a volunteer initiative to support community services.", choices:[{text:"Launch the program",faith:3,economy:-1,people:4,environment:0,justice:2,infrastructure:1},{text:"Reject the idea",faith:-1,economy:1,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Pilot the program",faith:1,economy:0,people:2,environment:0,justice:1,infrastructure:0}]},

  // ── scenarios_4.json ──
  { id:76, title:"Public Health Emergency Fund", principle:"Role of Government", situation:"Health experts recommend creating a reserve fund for future health emergencies.", choices:[{text:"Create the fund",faith:2,economy:-4,people:3,environment:0,justice:2,infrastructure:2},{text:"Reject the fund",faith:-1,economy:2,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Create a smaller reserve",faith:1,economy:-2,people:1,environment:0,justice:1,infrastructure:1}]},
  { id:77, title:"Low-Income Utility Assistance", principle:"Option for the Poor and Vulnerable", situation:"Utility prices are rising and low-income families are struggling to pay bills.", choices:[{text:"Provide assistance",faith:5,economy:-3,people:4,environment:0,justice:5,infrastructure:1},{text:"Reject assistance",faith:-5,economy:2,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Limited assistance",faith:2,economy:-1,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:78, title:"Urban Floodplain Development", principle:"Stewardship of Creation", situation:"Developers want to build homes on land that occasionally floods.", choices:[{text:"Allow development",faith:-1,economy:4,people:1,environment:-5,justice:-1,infrastructure:2},{text:"Protect the floodplain",faith:3,economy:-3,people:2,environment:6,justice:1,infrastructure:0},{text:"Allow limited development",faith:1,economy:2,people:1,environment:1,justice:0,infrastructure:1}]},
  { id:79, title:"International Disaster Relief", principle:"Global Solidarity", situation:"A foreign city suffering from a natural disaster asks for assistance.", choices:[{text:"Send financial aid",faith:4,economy:-3,people:2,environment:0,justice:3,infrastructure:0},{text:"Decline the request",faith:-4,economy:1,people:-1,environment:0,justice:-3,infrastructure:0},{text:"Send limited support",faith:2,economy:-1,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:80, title:"Affordable Daycare Center", principle:"Human Dignity", situation:"Families request affordable daycare to help parents return to work.", choices:[{text:"Build the daycare center",faith:4,economy:1,people:4,environment:0,justice:4,infrastructure:3},{text:"Reject the project",faith:-4,economy:1,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Provide daycare subsidies",faith:2,economy:0,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:81, title:"Renewable Energy City Contract", principle:"Stewardship of Creation", situation:"Energy companies offer a renewable power contract that costs more than fossil fuels.", choices:[{text:"Adopt renewable energy",faith:3,economy:-4,people:2,environment:7,justice:1,infrastructure:1},{text:"Keep current energy sources",faith:-2,economy:2,people:-1,environment:-6,justice:-1,infrastructure:0},{text:"Transition gradually",faith:2,economy:-1,people:1,environment:3,justice:0,infrastructure:0}]},
  { id:82, title:"City Youth Parliament", principle:"Participation in Society", situation:"Students propose a youth parliament to debate city issues.", choices:[{text:"Create the program",faith:2,economy:-1,people:4,environment:0,justice:3,infrastructure:1},{text:"Reject the idea",faith:-1,economy:0,people:-3,environment:0,justice:-2,infrastructure:0},{text:"Pilot the program",faith:1,economy:0,people:2,environment:0,justice:2,infrastructure:0}]},
  { id:83, title:"Worker Paid Sick Leave", principle:"Dignity of Work and Rights of Workers", situation:"Labour groups demand paid sick leave for city employees.", choices:[{text:"Grant paid sick leave",faith:4,economy:-3,people:2,environment:0,justice:5,infrastructure:0},{text:"Reject the demand",faith:-4,economy:2,people:-2,environment:0,justice:-5,infrastructure:0},{text:"Offer limited leave",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:84, title:"Peace Education in Schools", principle:"Promotion of Peace", situation:"Educators propose peace-building programs in schools.", choices:[{text:"Fund the program",faith:4,economy:-2,people:4,environment:0,justice:3,infrastructure:2},{text:"Reject funding",faith:-3,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Pilot the program",faith:2,economy:0,people:2,environment:0,justice:1,infrastructure:1}]},
  { id:85, title:"Emergency Homeless Shelter", principle:"Option for the Poor and Vulnerable", situation:"Winter is approaching and advocates urge opening emergency shelters.", choices:[{text:"Open emergency shelters",faith:5,economy:-3,people:3,environment:0,justice:5,infrastructure:2},{text:"Reject the proposal",faith:-5,economy:2,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Open limited shelters",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:1}]},
  { id:86, title:"Public EV Charging Network", principle:"Stewardship of Creation", situation:"Officials propose building electric vehicle charging stations.", choices:[{text:"Build the network",faith:2,economy:-4,people:2,environment:6,justice:1,infrastructure:4},{text:"Reject the plan",faith:-1,economy:1,people:-1,environment:-4,justice:0,infrastructure:0},{text:"Build limited stations",faith:1,economy:-1,people:1,environment:2,justice:0,infrastructure:2}]},
  { id:87, title:"Public Legal Aid Program", principle:"Rights and Responsibilities", situation:"Lawyers suggest city funding for legal aid for low-income residents.", choices:[{text:"Fund legal aid",faith:4,economy:-3,people:3,environment:0,justice:5,infrastructure:1},{text:"Reject funding",faith:-4,economy:2,people:-2,environment:0,justice:-5,infrastructure:0},{text:"Fund limited legal aid",faith:2,economy:-1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:88, title:"Local Peace March", principle:"Promotion of Peace", situation:"Faith leaders want to organize a city-wide peace march.", choices:[{text:"Support the march",faith:4,economy:-1,people:3,environment:0,justice:2,infrastructure:1},{text:"Refuse support",faith:-3,economy:0,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Allow the march without funding",faith:2,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:89, title:"Public Housing Waiting List Reform", principle:"Option for the Poor and Vulnerable", situation:"Thousands of families are waiting for affordable housing.", choices:[{text:"Expand housing programs",faith:5,economy:-5,people:3,environment:0,justice:5,infrastructure:5},{text:"Do nothing",faith:-5,economy:2,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Reform allocation system",faith:3,economy:-1,people:1,environment:0,justice:3,infrastructure:1}]},
  { id:90, title:"Community Food Market", principle:"Community and the Common Good", situation:"Residents propose a weekly community food market.", choices:[{text:"Support the market",faith:2,economy:2,people:4,environment:1,justice:2,infrastructure:1},{text:"Reject the plan",faith:-1,economy:0,people:-2,environment:0,justice:-1,infrastructure:0},{text:"Pilot the market",faith:1,economy:1,people:2,environment:0,justice:1,infrastructure:0}]},
  { id:91, title:"Urban Heat Reduction Plan", principle:"Stewardship of Creation", situation:"Climate scientists propose measures to reduce urban heat.", choices:[{text:"Implement the plan",faith:2,economy:-3,people:2,environment:6,justice:1,infrastructure:2},{text:"Reject the plan",faith:-1,economy:2,people:-2,environment:-5,justice:0,infrastructure:0},{text:"Implement partially",faith:1,economy:0,people:1,environment:2,justice:0,infrastructure:1}]},
  { id:92, title:"Local Peace Education Grants", principle:"Promotion of Peace", situation:"Schools ask for grants to teach conflict resolution.", choices:[{text:"Provide grants",faith:4,economy:-2,people:3,environment:0,justice:3,infrastructure:1},{text:"Reject the request",faith:-3,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Pilot grants",faith:2,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:93, title:"Community Health Clinic", principle:"Human Dignity", situation:"Doctors propose a new community health clinic in a low-income area.", choices:[{text:"Build the clinic",faith:5,economy:-4,people:4,environment:0,justice:5,infrastructure:4},{text:"Reject the project",faith:-5,economy:2,people:-3,environment:0,justice:-5,infrastructure:0},{text:"Partner with charities",faith:3,economy:-1,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:94, title:"Worker Safety Inspection Program", principle:"Dignity of Work and Rights of Workers", situation:"Officials propose stronger workplace inspections.", choices:[{text:"Expand inspections",faith:3,economy:-3,people:2,environment:0,justice:5,infrastructure:0},{text:"Reject the program",faith:-3,economy:3,people:-1,environment:0,justice:-4,infrastructure:0},{text:"Moderate inspections",faith:2,economy:1,people:1,environment:0,justice:2,infrastructure:0}]},
  { id:95, title:"City Cultural Exchange", principle:"Global Solidarity", situation:"International groups propose student exchange programs.", choices:[{text:"Fund exchanges",faith:3,economy:-2,people:3,environment:0,justice:2,infrastructure:1},{text:"Reject funding",faith:-2,economy:1,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Limited exchanges",faith:1,economy:0,people:1,environment:0,justice:1,infrastructure:0}]},
  { id:96, title:"Public Transport Fare Increase", principle:"Rights and Responsibilities", situation:"Transit officials suggest raising fares to maintain service.", choices:[{text:"Raise fares",faith:-1,economy:3,people:-3,environment:1,justice:-2,infrastructure:2},{text:"Reject the increase",faith:1,economy:-3,people:2,environment:0,justice:1,infrastructure:-2},{text:"Raise fares slightly",faith:0,economy:1,people:1,environment:0,justice:0,infrastructure:1}]},
  { id:97, title:"Emergency Food Storage Program", principle:"Role of Government", situation:"Officials suggest building emergency food reserves.", choices:[{text:"Create food reserves",faith:2,economy:-3,people:3,environment:0,justice:2,infrastructure:2},{text:"Reject the plan",faith:-1,economy:2,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Create smaller reserves",faith:1,economy:-1,people:1,environment:0,justice:1,infrastructure:1}]},
  { id:98, title:"Community Mental Health Hotline", principle:"Human Dignity", situation:"Advocates request a 24-hour mental health crisis hotline.", choices:[{text:"Fund the hotline",faith:4,economy:-2,people:4,environment:0,justice:4,infrastructure:2},{text:"Reject funding",faith:-4,economy:1,people:-3,environment:0,justice:-4,infrastructure:0},{text:"Partner with nonprofits",faith:2,economy:0,people:2,environment:0,justice:2,infrastructure:1}]},
  { id:99, title:"Urban Bike Share Program", principle:"Stewardship of Creation", situation:"Transportation planners propose a bike-share system.", choices:[{text:"Launch the system",faith:2,economy:-3,people:3,environment:6,justice:1,infrastructure:3},{text:"Reject the proposal",faith:-1,economy:1,people:-2,environment:-4,justice:0,infrastructure:0},{text:"Pilot the system",faith:1,economy:-1,people:1,environment:2,justice:0,infrastructure:1}]},
  { id:100, title:"Citywide Volunteer Day", principle:"Community and the Common Good", situation:"Community leaders propose an annual volunteer day for the whole city.", choices:[{text:"Organize the event",faith:3,economy:-1,people:4,environment:0,justice:2,infrastructure:1},{text:"Reject the idea",faith:-1,economy:0,people:-2,environment:0,justice:-2,infrastructure:0},{text:"Encourage community groups to organize it",faith:2,economy:0,people:2,environment:0,justice:1,infrastructure:0}]}
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
  termFill:        document.getElementById('termFill'),
  overallScore:    document.getElementById('overallScore'),

  // Scenario panel
  principleTag:    document.getElementById('principleText'),
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
          { text: 'Approve the new routes', faith: 2, economy: -3, people: 4, environment: 3, justice: 2, infrastructure: 4 },
          { text: 'Defer to next budget cycle', faith: 0, economy: 1, people: -1, environment: 0, justice: 0, infrastructure: 0 },
          { text: 'Approve one route now, one later', faith: 1, economy: -1, people: 2, environment: 1, justice: 1, infrastructure: 2 }
        ]
      }
    }
  ],
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
 *   1. environment > 70    → city_green.png
 *   2. environment < 35    → city_polluted.png
 *   3. economy > 70        → city_prosperous.png
 *   4. economy < 35        → city_struggling.png
 *   5. infrastructure > 70 → city_industrial.png
 *   6. (default)           → city_normal.png
 *
 * Updates the <img> inside the City View panel rather than the page background.
 */
function updateCityBackground() {
  const { environment, economy, infrastructure } = gameState.stats;

  let file;
  if      (environment    > 70) file = 'city_green.png';
  else if (environment    < 35) file = 'city_polluted.png';
  else if (economy        > 70) file = 'city_prosperous.png';
  else if (economy        < 35) file = 'city_struggling.png';
  else if (infrastructure > 70) file = 'city_industrial.png';
  else                          file = 'city_normal.png';

  const next = `backgrounds/${file}`;
  if (els.cityViewImg.getAttribute('src') !== next) {
    els.cityViewImg.style.opacity = '0';
    els.cityViewImg.src = next;
    els.cityViewImg.onload = () => { els.cityViewImg.style.opacity = '1'; };
    console.log(`[bg] → ${file}`);
  }
}


// ── TERM PROGRESS ─────────────────────────────────────────────────────────────

function updateTermProgress() {
  const pct = ((gameState.month - 1) / gameState.maxMonths) * 100;
  els.termFill.style.width     = Math.max(1, pct) + '%';
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
    const bonusColor   = STAT_COLOR[bonus.stat];
    const penaltyColor = STAT_COLOR[penalty.stat];
    const bonusLabel   = STAT_CONFIG.find(c => c.key === bonus.stat)?.label || bonus.stat;
    const penaltyLabel = STAT_CONFIG.find(c => c.key === penalty.stat)?.label || penalty.stat;
    els.advisorTraits.innerHTML = `
      <div class="trait-badge trait-badge--bonus"
           style="color:${bonusColor};border-color:${bonusColor}30;background:${bonusColor}12">
        <span class="trait-icon">▲</span>
        <span class="trait-text">+${bonus.amount} ${bonusLabel} per decision</span>
      </div>
      <div class="trait-badge trait-badge--penalty"
           style="color:${penaltyColor};border-color:${penaltyColor}30;background:${penaltyColor}12">
        <span class="trait-icon">▼</span>
        <span class="trait-text">-${penalty.amount} ${penaltyLabel} per decision</span>
      </div>
    `;
  }

  // 3. Render stat bars immediately (no animation delay — bars should pop in)
  updateStatBars();
  updateTermProgress();

  // 4. Fade out selection screen
  els.selectionScreen.classList.add('hiding');
  els.selectionScreen.addEventListener('animationend', () => {
    els.selectionScreen.style.display = 'none';
  }, { once: true });

  // 5. Reveal game UI
  els.gameHeader.classList.add('visible');
  els.gameMain.classList.add('visible');

  // 6. Load and display the first scenario
  const first = getRandomScenario();
  gameState.currentScenario = first;
  renderScenario(first);

  // 7. Welcome toast
  setTimeout(() => {
    showToast(`Mayor ${mayor.name} — your term begins. Good luck!`);
  }, 300);

  // 8. Switch to gameplay music
  playTrack('gameplay');

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

function renderScenario(scenario) {
  els.principleTag.textContent  = scenario.principle;
  els.scenarioTitle.textContent = scenario.title;
  els.scenarioDesc.textContent  = scenario.situation;

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
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg) {
  els.toastText.textContent = msg;
  els.toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
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

  const entry = document.createElement('div');
  entry.className = `log-entry ${sentimentClass}`;
  entry.innerHTML = `
    <div class="log-header">
      <span class="log-month">Month ${gameState.month}</span>
      <span class="log-principle">${scenario.principle}</span>
    </div>
    <span class="log-text">${choice.text}</span>
    ${chips ? `<div class="log-chips">${chips}</div>` : ''}
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
  if (els.midgameScreen) els.midgameScreen.classList.remove('visible');

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
  const scenario = gameState.currentScenario || PLACEHOLDER_SCENARIO;
  const choice   = scenario.choices[index];
  if (!choice) return;

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
