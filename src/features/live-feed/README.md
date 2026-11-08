# Live Feed feature — React

`LiveFeedPanel` owns the buyer/holder tabs, cards, loading/error/empty states and horizontal rail. It preserves the existing GET endpoints (`/api/live-feed/buyers?limit=100` and `/api/live-feed/holders?limit=100`), query values, no-store request policy, request cancellation, stale-response checks, feed-version comparison, five-second post-request refresh schedule, wallet shortening and amount formatting. The previous feed remains visible while a newly selected feed is loading; scroll anchoring is preserved during same-feed updates.

The previous DOM-based controller and its duplicate archive have been deleted; the React component is the only active Live Feed UI implementation.
