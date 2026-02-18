// ==== Configuration: CSV data sources ====
const TEAMS_CSV_URL   = "teams.csv";
const MATCHES_CSV_URL = "matches.csv";

// List of valid teams for this tournament
const VALID_TEAMS = [
  "Caramel Dogs",
  "Rolling Thunder",
  "G/G",
  "MSVC Rats",
  "Fireball",
  "Nata",
  "Next Level",
  "MSVC Beavers"
];

// Lineup / rotation helpers
const ROLE_ORDER = [
  "Setter",
  "Opposite",
  "Outside 1",
  "Middle 1",
  "Outside 2",
  "Middle 2",
  "Libero",
  "DS/Bench 1",
  "Bench 2",
  "Bench 3",
  "Bench 4",
  "Bench 5",
  "Bench 6",
  "Bench 7"
];

const ROLE_KEY_LABELS = {
  S: "Setter",
  OPP: "Opposite",
  OH1: "Outside 1",
  OH2: "Outside 2",
  MB1: "Middle 1",
  MB2: "Middle 2",
  L: "Libero",
  DS: "DS/Bench 1"
};

const SAMPLE_LINEUP = "Setter, Opposite, Outside 1, Middle 1, Outside 2, Middle 2, Libero, DS/Bench 1";

const ZONE_HINTS = [
  "Zone 1: Server / Setter base in R1",
  "Zone 2: Opposite / Right-side",
  "Zone 3: Middle blocker (front middle)",
  "Zone 4: Outside hitter (front left)",
  "Zone 5: Libero/DS in reception",
  "Zone 6: Outside / DS (back middle)"
];

// ==== Helper Functions ====
const DEFAULT_SEASON_PHASE = "league"; // "league" | "cup"
function getSeasonPhase() {
  const q = new URLSearchParams(window.location.search).get("phase");
  return (q === "cup" || q === "league") ? q : DEFAULT_SEASON_PHASE;
}
const SHOW_PLAYOFF_BRACKET = getSeasonPhase() === "cup";
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).map(l => l.split(","));
  const headers = lines[0].map(h => h.trim());
  return lines.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, (row[i] || "").trim()]))
  );
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0; // Convert valid numbers, default to 0 for invalid ones
}
function groupBy(arr, key) {
  const m = new Map();
  arr.forEach(item => {
    const k = item[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  });
  return m;
}

// Compute standings from match results, optionally up to a given round
function computeStandings(matches, upToRound = null) {
  const teamsSet = new Set(VALID_TEAMS);
  const byTeam = {};
  [...teamsSet].forEach(name => {
    byTeam[name] = {
      team: name, gp: 0, w: 0, l: 0, pts: 0,
      sets_w: 0, sets_l: 0, pf: 0, pa: 0
    };
  });

  matches
    .filter(m => m.status === "played" || m.status === "final")
    .filter(m => upToRound == null || m.round <= upToRound)
    .forEach(m => {
      const homeIsValid = VALID_TEAMS.includes(m.home_team);
      const awayIsValid = VALID_TEAMS.includes(m.away_team);
      if (!homeIsValid && !awayIsValid) return;
      let hs = 0, as = 0, hp = 0, ap = 0;
      const isBestOfFive = m.id >= 6;
      const requiredSetsToWin = isBestOfFive ? 3 : 2;
      [[m.set1_h, m.set1_a], [m.set2_h, m.set2_a], [m.set3_h, m.set3_a],
       [m.set4_h, m.set4_a], [m.set5_h, m.set5_a]].forEach(set => {
        const [h, a] = set;
        if (h == null || a == null) return;
        if (h === 0 && a === 0) return;
        if (h > a) hs++; else if (a > h) as++;
        hp += Number(h) || 0;
        ap += Number(a) || 0;
      });
      if (homeIsValid) {
        const H = byTeam[m.home_team];
        H.gp++;
        H.sets_w += hs; H.sets_l += as; H.pf += hp; H.pa += ap;
      }
      if (awayIsValid) {
        const A = byTeam[m.away_team];
        A.gp++;
        A.sets_w += as; A.sets_l += hs; A.pf += ap; A.pa += hp;
      }
      if (hs >= requiredSetsToWin && hs > as) {
        if (homeIsValid) {
          if (as === 0) { byTeam[m.home_team].w++; byTeam[m.home_team].pts += 3; }
          else { byTeam[m.home_team].w++; byTeam[m.home_team].pts += 2; }
        }
        if (awayIsValid) {
          byTeam[m.away_team].l++;
          if (as === 0) { byTeam[m.away_team].pts += 0; }
          else { byTeam[m.away_team].pts += 1; }
        }
      } else if (as >= requiredSetsToWin && as > hs) {
        if (awayIsValid) {
          if (hs === 0) { byTeam[m.away_team].w++; byTeam[m.away_team].pts += 3; }
          else { byTeam[m.away_team].w++; byTeam[m.away_team].pts += 2; }
        }
        if (homeIsValid) {
          byTeam[m.home_team].l++;
          if (hs === 0) { byTeam[m.home_team].pts += 0; }
          else { byTeam[m.home_team].pts += 1; }
        }
      }
    });
  const rows = Object.values(byTeam).map(team => ({
    ...team,
    set_ratio: team.sets_l ? team.sets_w / team.sets_l : (team.sets_w ? team.sets_w : 0),
    points_ratio: team.pa ? team.pf / team.pa : (team.pf ? team.pf : 0)
  }));
  rows.sort((a, b) =>
    b.pts - a.pts ||
    b.set_ratio - a.set_ratio ||
    b.points_ratio - a.points_ratio ||
    a.team.localeCompare(b.team)
  );
  return rows;
}

// Helper to get team positions by name
function getTeamPositions(rows) {
  const pos = {};
  rows.forEach((r, i) => { pos[r.team] = i; });
  return pos;
}

// Modified renderStandings to accept movement info
function renderStandings(rows, movement) {
  const tableDiv = document.getElementById("standingsTable");
  const headers = ["Team", "Pts", "GP", "W", "L", "Sets W–L", "Set Ratio", "PF", "PA", "Pts Ratio"];
  const html = [
    `<table class="table">`,
    `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`,
    `<tbody>`,
    ...rows.map(r => {
      let arrow = "";
      if (movement && movement[r.team]) {
        if (movement[r.team] === "up") arrow = '<span style="color:green;font-size:1.1em;">▲</span> ';
        else if (movement[r.team] === "down") arrow = '<span style="color:red;font-size:1.1em;">▼</span> ';
      }
      return `<tr>
        <td>${arrow}${r.team}</td>
        <td>${r.pts}</td>
        <td>${r.gp}</td>
        <td>${r.w}</td>
        <td>${r.l}</td>
        <td>${r.sets_w}–${r.sets_l}</td>
        <td>${r.set_ratio.toFixed(2)}</td>
        <td>${r.pf}</td>
        <td>${r.pa}</td>
        <td>${r.points_ratio.toFixed(2)}</td>
      </tr>`;
    }),
    `</tbody></table>`
  ].join("");
  tableDiv.innerHTML = html;
}

// Group matches by round and sort by time
function groupMatchesByRound(matches) {
  const groupedMap = groupBy(matches, "round");
  const rounds = [...groupedMap.entries()].map(([round, list]) => [
    Number(round),
    list.sort((a, b) => (`${a.date} ${a.time}`).localeCompare(`${b.date} ${b.time}`))
  ]);
  rounds.sort((a, b) => a[0] - b[0]);
  return rounds;
}

function getMatchSets(m) {
  let homeSets = 0;
  let awaySets = 0;
  [[m.set1_h, m.set1_a], [m.set2_h, m.set2_a], [m.set3_h, m.set3_a],
   [m.set4_h, m.set4_a], [m.set5_h, m.set5_a]].forEach(set => {
    if (!set || set[0] == null || set[1] == null) return;
    if (set[0] > set[1]) homeSets++;
    else if (set[1] > set[0]) awaySets++;
  });
  return { homeSets, awaySets };
}

function getBracketLabel(m) {
  return (m.notes || "").trim() || "Match";
}

function buildBracketMatch(m, extraClass = "") {
  const whenText = (m.date || "TBD") + (m.time ? " " + m.time : "");
  const statusText = (m.status === "played") ? "Final" : "Scheduled";
  const { homeSets, awaySets } = getMatchSets(m);
  const scoreText = (m.status === "played") ? `${homeSets}-${awaySets}` : "";
  const metaLeft = `${getBracketLabel(m)} - ${statusText}${scoreText ? ` - ${scoreText}` : ""}`;
  return `
    <div class="bracket-match ${extraClass}">
      <div class="bracket-team">
        <span>${m.home_team}</span>
      </div>
      <div class="bracket-team">
        <span>${m.away_team}</span>
      </div>
      <div class="bracket-meta">
        <span>${metaLeft}</span>
        <span class="bracket-time">${whenText}</span>
      </div>
    </div>
  `;
}

function renderBracketFromStandings(matches, standingsRows) {
  const bracketSection = document.getElementById("bracketSection");
  const bracketWrap = document.getElementById("bracketWrap");
  if (!bracketSection || !bracketWrap) return;

  const standings = (standingsRows || []).map(r => r.team);
  const seedPairs = [[0, 4], [1, 5], [2, 6], [3, 7]];
  const qfDate = "19/04/2026";
  const qfTimes = ["10:00", "11:30", "13:00", "14:30"];
  const finalsDate = "17/05/2026";
  const finalsTimes = ["10:00", "11:30", "13:00", "14:30"];

  const quarters = seedPairs.map((pair, idx) => {
    return {
      home_team: standings[pair[0]] || `${pair[0] + 1}st Place`,
      away_team: standings[pair[1]] || `${pair[1] + 1}th Place`,
      date: qfDate,
      time: qfTimes[idx] || "",
      status: "scheduled",
      notes: "Quarterfinal"
    };
  });

  const semis = [
    { home_team: "Winner QF1", away_team: "Winner QF4", notes: "Semifinal" },
    { home_team: "Winner QF2", away_team: "Winner QF3", notes: "Semifinal" }
  ].map((m, i) => ({
    ...m,
    date: finalsDate,
    time: finalsTimes[i] || "",
    status: "scheduled"
  }));

  const third = {
    home_team: "Loser SF1",
    away_team: "Loser SF2",
    notes: "Third Place",
    date: finalsDate,
    time: finalsTimes[2] || "",
    status: "scheduled"
  };
  const finalMatch = {
    home_team: "Winner SF1",
    away_team: "Winner SF2",
    notes: "Final",
    date: finalsDate,
    time: finalsTimes[3] || "",
    status: "scheduled"
  };

  if (!quarters.length && !semis.length) {
    bracketSection.classList.add("hidden");
    bracketWrap.innerHTML = "";
    return;
  }

  bracketWrap.innerHTML = `
    <div class="bracket-column bracket-quarters">
      <div class="bracket-round-title">Quarterfinals</div>
      <div class="bracket-stack">
        ${quarters.map((m, i) => buildBracketMatch(m, `qf-${i + 1}`)).join("")}
      </div>
    </div>
    <div class="bracket-column bracket-semis">
      <div class="bracket-round-title">Semifinals</div>
      <div class="bracket-stack">
        ${semis.map((m, i) => buildBracketMatch(m, `sf-${i + 1}`)).join("")}
      </div>
    </div>
    <div class="bracket-column bracket-finals">
      <div class="bracket-round-title">Third Place / Final</div>
      <div class="bracket-stack">
        ${[third, finalMatch].map((m, i) => buildBracketMatch(m, i === 0 ? "tp-1" : `f-${i}`)).join("")}
      </div>
    </div>
  `;

  bracketSection.classList.remove("hidden");
}

// Find the index of the next upcoming round (the first round with any scheduled future match)
function findNextRoundIndex(groupedRounds) {
  const today = new Date().toISOString().slice(0, 10);
  const idx = groupedRounds.findIndex(([rnd, matches]) =>
    matches.some(m => m.status === "scheduled" && (m.date ? m.date >= today : true))
  );
  return idx === -1 ? 0 : idx;
}

function buildRotationTemplates(baseOrder) {
  const rotations = {};
  for (let i = 0; i < 6; i++) {
    const key = `R${i + 1}`;
    rotations[key] = baseOrder.map((_, idx) => baseOrder[(idx + i) % baseOrder.length]);
  }
  return rotations;
}

const ROTATIONS = {
  serve: buildRotationTemplates(["S", "OPP", "MB2", "OH2", "MB1", "OH1"]),    // setter starts serving in 1
  receive: buildRotationTemplates(["S", "OPP", "MB2", "OH2", "L", "OH1"])    // libero replaces Middle 1 in reception
};

function parseLineupInput(value) {
  const raw = value.split(",").map(n => n.trim());
  const names = raw.filter(Boolean).slice(0, 14);
  const warnings = [];
  if (raw.filter(Boolean).length > 14) warnings.push("Only the first 14 players are used.");
  const hasDup = new Set(names).size !== names.length;
  if (hasDup) warnings.push("Duplicate names found. Check commas and spelling.");
  return { names, warnings };
}

function assignRoles(names) {
  const map = {};
  ROLE_ORDER.forEach((role, idx) => {
    map[role] = names[idx] || "";
  });
  return map;
}

function resolveName(roleKey, roleMap) {
  const label = ROLE_KEY_LABELS[roleKey] || roleKey;
  return roleMap[label] || label;
}

function renderCourt(names, rotationKey, phase) {
  const court = document.getElementById("courtPreview");
  if (!court) return;
  const roleMap = assignRoles(names);
  const template = (ROTATIONS[phase] || ROTATIONS.serve)[rotationKey] || ROTATIONS.serve.R1;
  const zones = template.map((roleCode, idx) => ({
    zone: idx + 1,
    roleCode
  }));
  const layoutOrder = [4, 3, 2, 5, 6, 1]; // front row then back row
  const html = layoutOrder.map(zoneNumber => {
    const data = zones.find(z => z.zone === zoneNumber) || { roleCode: "" };
    const playerName = resolveName(data.roleCode, roleMap);
    const roleLabel = ROLE_KEY_LABELS[data.roleCode] || "Open";
    const classes = ["zone"];
    if (phase === "serve" && data.zone === 1) classes.push("server");
    if (phase === "receive" && data.roleCode === "L") classes.push("libero");
    const hint = ZONE_HINTS[data.zone - 1] || "";
    return `<div class="${classes.join(" ")}" data-hint="${hint}">
      <div class="zone-number">Zone ${data.zone}</div>
      <div class="player">${playerName}</div>
      <div class="role">${roleLabel}</div>
    </div>`;
  }).join("");
  court.innerHTML = html;
}

function initLineupHelper() {
  const textarea = document.getElementById("lineupInput");
  if (!textarea) return;
  const countEl = document.getElementById("lineupCount");
  const warningsEl = document.getElementById("lineupWarnings");
  const rotationSelect = document.getElementById("rotationSelect");
  const serveBtn = document.getElementById("serveView");
  const receiveBtn = document.getElementById("receiveView");
  const loadSampleBtn = document.getElementById("loadSample");
  const clearBtn = document.getElementById("clearLineup");

  const state = { rotation: "R1", phase: "serve", names: [] };

  function update() {
    const { names, warnings } = parseLineupInput(textarea.value);
    state.names = names;
    countEl.textContent = `${names.length} / 14`;
    warningsEl.textContent = warnings.join(" ");
    renderCourt(state.names, state.rotation, state.phase);
  }

  textarea.addEventListener("input", update);
  rotationSelect.addEventListener("change", (e) => {
    state.rotation = e.target.value;
    update();
  });
  serveBtn.addEventListener("click", () => {
    state.phase = "serve";
    serveBtn.classList.add("active");
    receiveBtn.classList.remove("active");
    update();
  });
  receiveBtn.addEventListener("click", () => {
    state.phase = "receive";
    receiveBtn.classList.add("active");
    serveBtn.classList.remove("active");
    update();
  });
  loadSampleBtn.addEventListener("click", () => {
    textarea.value = SAMPLE_LINEUP;
    update();
  });
  clearBtn.addEventListener("click", () => {
    textarea.value = "";
    update();
  });

  update();
}

// Real-time live score overlay using Firestore
async function attachLiveOverlay(matchList) {
  // Remove any existing listeners to avoid duplicates
  if (!window._liveUnsubs) window._liveUnsubs = [];
  window._liveUnsubs.forEach(unsub => { try { unsub(); } catch(e){} });
  window._liveUnsubs = [];

  // Dynamically import Firestore functions for listening (already initialized in index.html)
  const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
  
  matchList.forEach(match => {
    const ref = doc(window.db, "matches", String(match.id));
    const unsubscribe = onSnapshot(ref, snapshot => {
      const data = snapshot.data();
      const li = document.querySelector(`li.round-item[data-id="${match.id}"]`);
      if (!li) return;  // If match element is not in the current round view, skip
      const statusEl = li.querySelector(".status");
      const rightEl = li.querySelector(".round-right");
      const whenText = (match.date || "TBD") + (match.time ? " " + match.time : "");

      if (!data) {
        // No live data for this match: use CSV status
        if (match.status.toLowerCase() === "played") {
          statusEl.textContent = "Final";
          statusEl.className = "status played";
        } else {
          statusEl.textContent = "Scheduled";
          statusEl.className = "status scheduled";
        }
        rightEl.textContent = whenText;
        return;
      }

      // Compute sets won from the live data
      let homeSets = 0, awaySets = 0;
      [[data.set1_h, data.set1_a], [data.set2_h, data.set2_a], [data.set3_h, data.set3_a],
       [data.set4_h, data.set4_a], [data.set5_h, data.set5_a]].forEach(set => {
        if (!set || set[0] == null || set[1] == null) return; // Skip incomplete sets
        if (set[0] > set[1]) homeSets++;
        else if (set[1] > set[0]) awaySets++;
      });

      console.log("Match ID:", match.id);
      console.log("Set Scores:", data.set1_h, data.set1_a, data.set2_h, data.set2_a, data.set3_h, data.set3_a, data.set4_h, data.set4_a, data.set5_h, data.set5_a);
      console.log("Home sets:", homeSets, "Away sets:", awaySets);

      if (data.status === "live") {
        statusEl.textContent = "Live";
        statusEl.className = "status live";
        rightEl.textContent = `${homeSets} – ${awaySets} | ${whenText}`;
      } else if (data.status === "played") {
        statusEl.textContent = "Final";
        statusEl.className = "status played";
        rightEl.textContent = `${homeSets} – ${awaySets} | ${whenText}`;
      } else {
        // Fallback for any other status
        statusEl.textContent = "Scheduled";
        statusEl.className = "status scheduled";
        rightEl.textContent = whenText;
      }
    });
    window._liveUnsubs.push(unsubscribe);
  });
}

// Render a given round’s fixture list and attach live listeners
function renderRound(groupedRounds, index) {
  const [roundNum, matches] = groupedRounds[index] || [0, []];
  document.getElementById("roundTitle").textContent = `Round ${roundNum}`;
  const ul = document.getElementById("roundList");

  ul.innerHTML = matches.map(m => {
    const whenText = (m.date || "TBD") + (m.time ? " " + m.time : "");
    const statusText = (m.status === "played") ? "Final" : "Scheduled";
    const statusClass = (m.status === "played") ? "status played" : "status scheduled";

    // Calculate sets won
    let homeSets = 0, awaySets = 0;
    [[m.set1_h, m.set1_a], [m.set2_h, m.set2_a], [m.set3_h, m.set3_a],
     [m.set4_h, m.set4_a], [m.set5_h, m.set5_a]].forEach(set => {
      if (!set || set[0] == null || set[1] == null) return; // Skip incomplete sets
      if (set[0] > set[1]) homeSets++;
      else if (set[1] > set[0]) awaySets++;
    });

    console.log("Match ID:", m.id);
    console.log("Set Scores:", m.set1_h, m.set1_a, m.set2_h, m.set2_a, m.set3_h, m.set3_a, m.set4_h, m.set4_a, m.set5_h, m.set5_a);
    console.log("Home sets:", homeSets, "Away sets:", awaySets);

    return `<li class="round-item" data-id="${m.id}">
              <div>
                <div><strong>${m.home_team}</strong> vs <strong>${m.away_team}</strong></div>
                <div class="${statusClass} status">${statusText}</div>
              </div>
              <div class="round-right">${homeSets} – ${awaySets} | ${whenText}</div>
            </li>`;
  }).join("");
}

// ==== Initial Load ====
(async function() {
  // Fetch initial data from CSV files
  const rawMatches = await fetchCSV(MATCHES_CSV_URL);
  const matches = rawMatches.map(m => ({
    id: Number(m.id),
    round: Number(m.round),
    date: m.date || "",
    time: m.time || "",
    home_team: m.home_team,
    away_team: m.away_team,
    set1_h: toNum(m.set1_h), set1_a: toNum(m.set1_a),
    set2_h: toNum(m.set2_h), set2_a: toNum(m.set2_a),
    set3_h: toNum(m.set3_h), set3_a: toNum(m.set3_a),
    set4_h: toNum(m.set4_h), set4_a: toNum(m.set4_a),
    set5_h: toNum(m.set5_h), set5_a: toNum(m.set5_a),
    status: (m.status || "scheduled").toLowerCase(),
    notes: m.notes || ""
  }))
  // Filter out matches with no valid id or round
  .filter(m => Number.isFinite(m.id) && m.id > 0 && Number.isFinite(m.round) && m.round > 0);

  // Compute and display standings
  const standingsData = computeStandings(matches);
  renderStandings(standingsData);

  // Group matches by round and show the nearest upcoming round
  const groupedRounds = groupMatchesByRound(matches);
  let currentIndex = findNextRoundIndex(groupedRounds);
  renderRound(groupedRounds, currentIndex);
  if (SHOW_PLAYOFF_BRACKET) {
    renderBracketFromStandings(matches, standingsData);
  }

  // Carousel navigation for rounds
  document.getElementById("prevRound").addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + groupedRounds.length) % groupedRounds.length;
    renderRound(groupedRounds, currentIndex);
  });
  document.getElementById("nextRound").addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % groupedRounds.length;
    renderRound(groupedRounds, currentIndex);
  });
})();

// Initialize lineup helper UI
initLineupHelper();
