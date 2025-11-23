# SSE scripts

### run-sse-concurrent
Concurrent SSE Load Test (Parallel Runner)
Purpose

A full parallel load-testing orchestrator.

Key Characteristics

✔ Runs multiple instances of sse-load-test.js in parallel (background processes)
✔ Distributes clients across instances (ex: 600 clients → 10 processes → 60 each)
✔ Creates a logs directory per test run
✔ Tracks PIDs, cleans up, and kills all child processes on Ctrl+C
✔ Generates summary report (total votes)
✔ Supports interactive mode (instructions, live tail logs)
✔ Handles SIGINT/SIGTERM for graceful shutdown
✔ Automatically loads .env.ssetest
✔ Assigns start/end code ranges to each instance
✔ Suitable for massive concurrency (hundreds to thousands of SSE clients)

When to use

➡️ High-load stress tests, where you need:

Multiple parallel processes

Big client numbers

Automatic logging

Summary reports

Long-running interactive behavior

### run-sse-test 
Simple SSE Load Test Runner (Single Process)
Purpose

A basic single-run launcher for sse-load-test.js.

Key Characteristics

✔ Runs only ONE instance
✔ No parallelism
✔ Does not split clients
✔ No PID tracking
✔ No log directory
✔ No summary report
✔ Minimal validation (only checks Node and codes.mjs)
✔ Simpler configuration
✔ Designed for testing one batch of clients (e.g., 50–200)

When to use

➡️ Small tests, where you just need:

One process

Quick load test

Minimal setup