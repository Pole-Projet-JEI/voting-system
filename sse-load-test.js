#!/usr/bin/env node

import http from "http";
import https from "https";
import { parse } from "url";
import { readFileSync } from "fs";
import { writeFileSync } from "fs";
import readline from "readline";

// Configuration
const config = {
  BASE_URL: process.env.BASE_URL || "http://voting.jeinsat.com",
  NUM_CLIENTS: parseInt(process.env.NUM_CLIENTS) || 50,
  DURATION_MS: parseInt(process.env.DURATION_MS) || 60000,
  RECONNECT_DELAY: parseInt(process.env.RECONNECT_DELAY) || 3000,
  STAGGER_DELAY: parseInt(process.env.STAGGER_DELAY) || 100, // ms between client connects
  INTERACTIVE_MODE: process.env.INTERACTIVE_MODE !== "false", // Auto voting + manual team change
  CODE_START_INDEX: parseInt(process.env.CODE_START_INDEX) || 0, // For parallel execution
  CODE_END_INDEX: parseInt(process.env.CODE_END_INDEX) || 0, // For parallel execution
  INSTANCE_ID: parseInt(process.env.INSTANCE_ID) || 0, // For parallel execution
};

// ANSI Colors
const c = {
  r: "\x1b[0m",
  g: "\x1b[32m",
  R: "\x1b[31m",
  y: "\x1b[33m",
  b: "\x1b[34m",
  c: "\x1b[36m",
  m: "\x1b[35m",
};

// Global metrics
const metrics = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0,
  messagesReceived: 0,
  reconnects: 0,
  heartbeats: 0,
  teamChanges: 0,
  errors: 0,
  startTime: Date.now(),
  connTimes: [],
  clients: new Map(),
  votingMetrics: {
    totalVotes: 0,
    successfulVotes: 0,
    failedVotes: 0,
    votesByTeam: new Map(), // teamId -> { yes: 0, no: 0, success: 0, failed: 0 }
  },
};

// Extract voter codes from codes.mjs file
function loadVoterCodes() {
  try {
    const content = readFileSync("./server/src/seed/codes.mjs", "utf8");
    const matches = content.match(/"([A-Za-z0-9]{9})"/g);
    if (!matches) throw new Error("No codes found");

    const allCodes = matches.map((m) => m.replace(/"/g, ""));

    // If CODE_END_INDEX is set, use specific range for parallel execution
    if (config.CODE_END_INDEX > 0) {
      const start = config.CODE_START_INDEX;
      const end = config.CODE_END_INDEX;
      return allCodes.slice(start, end);
    }

    // Otherwise use NUM_CLIENTS from the start
    return allCodes.slice(0, config.NUM_CLIENTS);
  } catch (error) {
    console.error(`${c.R}Error loading voter codes:${c.r}`, error.message);
    process.exit(1);
  }
}

// SSE Client class
class SSEClient {
  constructor(voterCode, id) {
    this.code = voterCode;
    this.id = id;
    this.connected = false;
    this.req = null;
    this.cookie = null;
    this.startTime = null;
    this.lastHB = null;
    this.attempts = 0;
    this.hasVoted = false; // Track if already voted for current team
  }

  async register() {
    return new Promise((resolve, reject) => {
      const url = parse(config.BASE_URL);
      const mod = url.protocol === "https:" ? https : http;

      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: "/api/register",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };

      const req = mod.request(opts, (res) => {
        let data = "";
        const cookie = res.headers["set-cookie"];
        if (cookie) this.cookie = cookie[0].split(";")[0];

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve();
          } else {
            reject(new Error(`Register failed: ${res.statusCode}`));
          }
        });
      });

      req.on("error", reject);
      req.write(JSON.stringify({ code: this.code }));
      req.end();
    });
  }

  async voteForTeam(teamId) {
    return new Promise((resolve, reject) => {
      // 50/50 vote distribution: even IDs vote yes, odd IDs vote no
      const voteChoice = this.id % 2 === 0 ? "yes" : "no";

      const url = parse(config.BASE_URL);
      const mod = url.protocol === "https:" ? https : http;

      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `/api/vote/${teamId}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: this.cookie || "",
        },
      };

      const req = mod.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            metrics.votingMetrics.successfulVotes++;

            // Track vote by team
            if (!metrics.votingMetrics.votesByTeam.has(teamId)) {
              metrics.votingMetrics.votesByTeam.set(teamId, {
                yes: 0,
                no: 0,
                success: 0,
                failed: 0,
              });
            }
            const teamStats = metrics.votingMetrics.votesByTeam.get(teamId);
            teamStats[voteChoice]++;
            teamStats.success++;

            console.log(
              `${c.g}✓${c.r} C${this.id} voted ${
                c.c
              }${voteChoice.toUpperCase()}${c.r} for team ${teamId}`
            );
            resolve({ success: true, vote: voteChoice });
          } else {
            metrics.votingMetrics.failedVotes++;
            if (metrics.votingMetrics.votesByTeam.has(teamId)) {
              metrics.votingMetrics.votesByTeam.get(teamId).failed++;
            }
            console.error(
              `${c.R}✗ C${this.id} vote failed:${c.r} ${res.statusCode}`
            );
            reject(new Error(`Vote failed: ${res.statusCode}`));
          }
        });
      });

      req.on("error", (err) => {
        metrics.votingMetrics.failedVotes++;
        if (metrics.votingMetrics.votesByTeam.has(teamId)) {
          metrics.votingMetrics.votesByTeam.get(teamId).failed++;
        }
        console.error(`${c.R}✗ C${this.id} vote error:${c.r}`, err.message);
        reject(err);
      });

      req.write(JSON.stringify({ vote: voteChoice }));
      req.end();

      metrics.votingMetrics.totalVotes++;
    });
  }

  connect() {
    this.startTime = Date.now();
    const url = parse(config.BASE_URL);
    const mod = url.protocol === "https:" ? https : http;

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: "/api/sendvote",
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    };

    if (this.cookie) opts.headers.Cookie = this.cookie;

    this.req = mod.request(opts, (res) => {
      if (res.statusCode !== 200) {
        this.onError(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      this.connected = true;
      metrics.totalConnections++;
      metrics.activeConnections++;

      const t = Date.now() - this.startTime;
      metrics.connTimes.push(t);

      console.log(
        `${c.g}✓${c.r} C${this.id} connected (${t}ms) | Active: ${metrics.activeConnections}`
      );

      // Fetch current presenting team after connection
      if (config.INTERACTIVE_MODE) {
        this.fetchCurrentTeam().catch((err) => {
          console.error(
            `${c.R}C${this.id} fetch team error:${c.r}`,
            err.message
          );
        });
      }

      let buf = "";

      res.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n\n");
        buf = lines.pop();

        lines.forEach((line) => {
          if (line.startsWith("data: ")) {
            this.onMessage(line.substring(6));
          } else if (line.startsWith(":")) {
            this.onHeartbeat();
          }
        });
      });

      res.on("end", () => this.onDisconnect("ended"));
      res.on("error", (e) => this.onError(e));
    });

    this.req.on("error", (e) => this.onError(e));
    this.req.end();
  }

  async fetchCurrentTeam() {
    return new Promise((resolve, reject) => {
      const url = parse(config.BASE_URL);
      const mod = url.protocol === "https:" ? https : http;

      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: "/api/currentteam",
        method: "GET",
        headers: {
          Cookie: this.cookie || "",
        },
      };

      const req = mod.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const teamData = JSON.parse(data);
              if (teamData.teamID && !this.hasVoted) {
                console.log(
                  `${c.b}ℹ C${this.id}:${c.r} Current team: ${teamData.teamName} (ID: ${teamData.teamID})`
                );
                this.hasVoted = true;
                setTimeout(() => {
                  this.voteForTeam(teamData.teamID).catch((err) => {
                    console.error(
                      `${c.R}C${this.id} initial vote error:${c.r}`,
                      err.message
                    );
                  });
                }, 100);
              }
              resolve(teamData);
            } catch (e) {
              reject(e);
            }
          } else {
            resolve(null);
          }
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

  onMessage(data) {
    try {
      const msg = JSON.parse(data);
      metrics.messagesReceived++;

      // Server sends { connected: true } on initial connection
      if (msg.connected === true) {
        console.log(`${c.b}ℹ C${this.id}:${c.r} Connected to SSE`);
        return;
      }

      // Server sends { teamID, teamName, description } when team starts presenting
      // or { teamID: null, teamName: null, stopped: true } when team stops
      if (msg.hasOwnProperty("teamID")) {
        metrics.teamChanges++;

        if (msg.stopped === true || msg.teamID === null) {
          // Team stopped presenting
          console.log(`${c.y}📢 C${this.id}:${c.r} Team stopped presenting`);
          this.hasVoted = false; // Reset for next team
        } else {
          // New team started presenting
          const team = msg.teamName || "Unknown";
          const teamId = msg.teamID;

          console.log(
            `${c.c}📢 C${this.id}:${c.r} Team → ${team} (ID: ${teamId})`
          );

          // Auto-vote for new team in interactive mode
          if (config.INTERACTIVE_MODE && teamId && !this.hasVoted) {
            this.hasVoted = true;
            setTimeout(() => {
              this.voteForTeam(teamId).catch((err) => {
                console.error(
                  `${c.R}C${this.id} auto-vote error:${c.r}`,
                  err.message
                );
              });
            }, 100); // Small delay to avoid stampede
          }
        }
      }
    } catch (e) {
      metrics.errors++;
      console.error(`${c.R}C${this.id} parse error:${c.r}`, e.message);
    }
  }

  onHeartbeat() {
    this.lastHB = Date.now();
    metrics.heartbeats++;
  }

  onDisconnect(reason) {
    if (!this.connected) return;

    this.connected = false;
    metrics.activeConnections--;

    console.log(
      `${c.y}⚠ C${this.id}:${c.r} Disconnected (${reason}) | Active: ${metrics.activeConnections}`
    );

    if (Date.now() - metrics.startTime < config.DURATION_MS) {
      setTimeout(() => this.reconnect(), config.RECONNECT_DELAY);
    }
  }

  onError(e) {
    metrics.errors++;
    metrics.failedConnections++;
    console.error(`${c.R}✗ C${this.id}:${c.r} Error: ${e.message}`);
    this.onDisconnect("error");
  }

  reconnect() {
    this.attempts++;
    metrics.reconnects++;
    console.log(
      `${c.m}↻ C${this.id}:${c.r} Reconnecting (${this.attempts})...`
    );
    this.connect();
  }

  resetVoteStatus() {
    this.hasVoted = false;
  }

  destroy() {
    if (this.req) this.req.destroy();
    this.connected = false;
    if (metrics.activeConnections > 0) metrics.activeConnections--;
  }
}

// Stats display
function showStats() {
  const runtime = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
  const avgConn =
    metrics.connTimes.length > 0
      ? (
          metrics.connTimes.reduce((a, b) => a + b, 0) /
          metrics.connTimes.length
        ).toFixed(0)
      : 0;
  const msgRate = (metrics.messagesReceived / (runtime || 1)).toFixed(1);
  const successRate =
    metrics.totalConnections > 0
      ? (
          ((metrics.totalConnections - metrics.failedConnections) /
            metrics.totalConnections) *
          100
        ).toFixed(1)
      : 0;

  const voteSuccessRate =
    metrics.votingMetrics.totalVotes > 0
      ? (
          (metrics.votingMetrics.successfulVotes /
            metrics.votingMetrics.totalVotes) *
          100
        ).toFixed(1)
      : 0;

  console.log("\n" + "═".repeat(60));
  console.log(`${c.c}📊 SSE Load Test - Live Stats${c.r}`);
  console.log("═".repeat(60));
  console.log(`Runtime:           ${runtime}s`);
  console.log(
    `Active:            ${c.g}${metrics.activeConnections}${c.r} / ${config.NUM_CLIENTS}`
  );
  console.log(`Total Connects:    ${metrics.totalConnections}`);
  console.log(`Failed:            ${c.R}${metrics.failedConnections}${c.r}`);
  console.log(`Success Rate:      ${successRate}%`);
  console.log(`Reconnects:        ${metrics.reconnects}`);
  console.log(`Messages:          ${metrics.messagesReceived} (${msgRate}/s)`);
  console.log(`  Heartbeats:      ${metrics.heartbeats}`);
  console.log(`  Team Changes:    ${c.c}${metrics.teamChanges}${c.r}`);
  console.log(`Errors:            ${c.R}${metrics.errors}${c.r}`);
  console.log(`Avg Conn Time:     ${avgConn}ms`);

  // Voting stats
  if (config.INTERACTIVE_MODE) {
    console.log("─".repeat(60));
    console.log(`${c.y}⚡ Voting Metrics${c.r}`);
    console.log(`Total Votes:       ${metrics.votingMetrics.totalVotes}`);
    console.log(
      `Successful:        ${c.g}${metrics.votingMetrics.successfulVotes}${c.r}`
    );
    console.log(
      `Failed:            ${c.R}${metrics.votingMetrics.failedVotes}${c.r}`
    );
    console.log(`Vote Success Rate: ${voteSuccessRate}%`);

    if (metrics.votingMetrics.votesByTeam.size > 0) {
      console.log("─".repeat(60));
      console.log(`${c.m}📋 Votes by Team${c.r}`);
      metrics.votingMetrics.votesByTeam.forEach((stats, teamId) => {
        console.log(
          `  Team ${teamId}: YES=${c.g}${stats.yes}${c.r} NO=${c.R}${stats.no}${c.r} (✓${stats.success} ✗${stats.failed})`
        );
      });
    }
  }

  console.log("═".repeat(60) + "\n");
}

// Helper to wait for user input
async function waitForUserInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Main execution
async function run() {
  const instanceLabel =
    config.INSTANCE_ID > 0 ? `[Instance ${config.INSTANCE_ID}] ` : "";

  console.log(`${c.c}🚀 SSE Load Test ${instanceLabel}${c.r}`);
  console.log(`Target:   ${config.BASE_URL}`);
  console.log(`Clients:  ${config.NUM_CLIENTS}`);
  if (config.CODE_END_INDEX > 0) {
    console.log(
      `Range:    Codes ${config.CODE_START_INDEX} - ${
        config.CODE_END_INDEX - 1
      }`
    );
  }
  console.log(`Duration: ${config.DURATION_MS / 1000}s`);
  console.log(`Stagger:  ${config.STAGGER_DELAY}ms`);
  console.log(
    `Mode:     ${
      config.INTERACTIVE_MODE ? "Interactive (Auto-voting)" : "Passive"
    }\n`
  );

  const codes = loadVoterCodes();
  console.log(`${c.g}✓${c.r} Loaded ${codes.length} voter codes\n`);

  const clients = codes.map((code, i) => {
    // Adjust client ID for parallel instances
    const clientId =
      config.INSTANCE_ID > 0 ? config.CODE_START_INDEX + i + 1 : i + 1;
    return new SSEClient(code, clientId);
  });

  // Register all
  console.log(`${c.y}Registering ${clients.length} clients...${c.r}`);
  await Promise.all(
    clients.map((client) =>
      client.register().catch((err) => {
        console.error(`${c.R}✗ C${client.id} reg failed:${c.r}`, err.message);
      })
    )
  );
  console.log(`${c.g}✓${c.r} Registration complete\n`);

  // Connect with stagger
  console.log(
    `${c.y}Connecting clients (staggered ${config.STAGGER_DELAY}ms)...${c.r}\n`
  );
  for (let i = 0; i < clients.length; i++) {
    clients[i].connect();
    metrics.clients.set(clients[i].id, clients[i]);
    if (i < clients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, config.STAGGER_DELAY));
    }
  }

  // Interactive mode: wait for team changes
  if (config.INTERACTIVE_MODE) {
    console.log(`\n${c.c}═`.repeat(60));
    console.log(`${c.c}🎯 INTERACTIVE MODE ACTIVE ${instanceLabel}${c.r}`);
    console.log(`${c.c}═`.repeat(60));
    console.log(
      `All ${config.NUM_CLIENTS} clients are now connected and listening.`
    );
    console.log(`${c.y}Instructions:${c.r}`);
    console.log(`  1. Go to admin dashboard: ${config.BASE_URL}/admin`);
    console.log(`  2. Set a team as "presenting"`);
    console.log(`  3. Clients will auto-detect and vote (50/50 YES/NO)`);
    console.log(
      `  4. Remove team or set new one to trigger another vote cycle`
    );
    console.log(`  5. Press Ctrl+C when done testing\n`);

    // Stats interval
    const statsInt = setInterval(showStats, 10000); // Every 10s in interactive mode

    // Wait for manual stop (Ctrl+C)
    await new Promise(() => {}); // Infinite wait until SIGINT
  } else {
    // Non-interactive: just wait for duration
    const statsInt = setInterval(showStats, 5000);
    await new Promise((resolve) => setTimeout(resolve, config.DURATION_MS));
    clearInterval(statsInt);

    // Cleanup
    console.log(`\n${c.y}Test complete. Disconnecting...${c.r}`);
    clients.forEach((c) => c.destroy());

    showStats();

    // Save report
    const report = {
      config,
      metrics: {
        ...metrics,
        votingMetrics: {
          ...metrics.votingMetrics,
          votesByTeam: Array.from(metrics.votingMetrics.votesByTeam.entries()),
        },
        clients: undefined, // Don't serialize client objects
      },
      timestamp: new Date().toISOString(),
    };

    const path = `performance-testing/sse-test-report-${Date.now()}.json`;
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`${c.g}✓${c.r} Report: ${path}\n`);

    process.exit(0);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n${c.y}SIGINT received. Shutting down...${c.r}`);
  showStats();

  // Save final report in interactive mode
  if (config.INTERACTIVE_MODE) {
    const report = {
      config,
      metrics: {
        ...metrics,
        votingMetrics: {
          ...metrics.votingMetrics,
          votesByTeam: Array.from(metrics.votingMetrics.votesByTeam.entries()),
        },
        clients: undefined,
      },
      timestamp: new Date().toISOString(),
      duration: ((Date.now() - metrics.startTime) / 1000).toFixed(1) + "s",
    };

    const path = `performance-testing/sse-test-report-${Date.now()}.json`;
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`${c.g}✓${c.r} Report saved: ${path}\n`);
  }

  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n${c.y}SIGTERM received. Shutting down...${c.r}`);
  showStats();
  process.exit(0);
});

// Run
run().catch((error) => {
  console.error(`${c.R}Test failed:${c.r}`, error);
  process.exit(1);
});
