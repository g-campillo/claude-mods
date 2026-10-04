# usage-meter

Shows your plan usage next to the prompt:

```
5h Limit 96% left resets at 3:19 AM   Weekly Limit 47% left resets on Sun Oct 4 at 6:59 PM   Fable Limit 100% left resets on Sun Oct 4 at 7:00 PM   Cache 59m left expires at 2:43 AM
```

- Desktop app: drawn in the band just above the input (the app does not let mods draw below it yet;
  if it ever asks for the hint line, the meter moves there by itself). It steps aside for surveys.
- Terminal: appended to the hint line under the prompt.
- Shows what is left of each window: green with 50% or more left, yellow from 20%, red below 20%.
  The cache is green with more than 15 minutes left, yellow above 5, red after that.
  `⚠ stale` means the last refresh failed.
- `/usage-meter` prints the full report (with time until each reset); `/usage-meter raw` dumps the
  API response, useful if Anthropic renames a field; `/usage-meter debug` lists what the app asks
  the mod to draw.

## Where the numbers come from

- **5-hour and weekly**: the rate-limit headers on the session's own responses (`session.measure`,
  free and live), and `GET https://api.anthropic.com/api/oauth/usage` every 5 minutes and after
  each turn (at most every 2 minutes; 15-minute backoff on HTTP 429). Each window shows whichever
  source read it last.
- **Fable**: only the usage endpoint reports it; the key containing `fable` is used.
- **Cache**: the prompt cache lives for its TTL after each main-thread model response; the meter
  counts down from the last one. Set the TTL with the `cacheTtl` option (`1h` default, or `5m`).

The OAuth credential never reaches the mod: `$.session.authorize()` hands it an opaque handle the
engine spends on the request.
