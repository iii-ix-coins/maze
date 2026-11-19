# Live Feed

`LiveFeedPanel` displays the Top 100 Holders feed only. It reads `/api/live-feed/holders?limit=100` with `cache: 'no-store'`, cancels superseded requests, ignores stale responses, compares feed versions, refreshes five seconds after each request, preserves horizontal scroll anchoring, and animates newly appearing holder cards. The former buyer/purchase feed and its transaction-database dependency have been removed.
