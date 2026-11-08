# ADR 0009: Kitchen voice with the browser's own speech synthesis (vi-VN)

- Status: accepted · 2026-11-08

## Context

The owner made the kitchen voice the core feature (TQR-027/028): the kitchen iPad reads new orders aloud ("Bàn 1: hai phở bò, một trà đá") and repeats dishes that have waited too long ("Bàn 5 gọi phở bò đã 10 phút, chưa ra món"), so a cook does not have to look at the screen. It must work in Vietnamese, on shop Wi-Fi that drops, on an iPad in Safari, at no running cost.

Options:

| Option                                                                             | Vietnamese quality                             | Offline        | Cost and data                                                            | Latency              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------------ | -------------------- |
| Browser Speech Synthesis (`speechSynthesis`, `lang = vi-VN`, voice "Linh" on iPad) | good on iPad/macOS ("Linh"); Android/Chrome OK | yes, on device | free; no text leaves the device                                          | immediate            |
| Cloud TTS (Google, Azure, FPT.AI, Viettel)                                         | better and more natural voices                 | no             | per-character fees, an API key to keep, order text sent to a third party | a network round trip |
| Pre-recorded clips joined together                                                 | natural for fixed words only                   | yes            | dish names are free text per restaurant: cannot be recorded in advance   | immediate            |

## Decision

1. Use the browser's Speech Synthesis API through a `SpeechEngine` port (`web/src/features/kitchen/voice/browser-speech.ts`): `lang = 'vi-VN'`, the "Linh" voice when present, rate and volume chosen by the cook and remembered per device.
2. One sentence at a time through a speech queue (`speech-queue.ts`); turning the voice off cancels what is being said and drops what waits (AC57). A guard timer moves on when a browser never fires `end`.
3. What is said is decided by pure functions (`phrases.ts`, `scheduler.ts`, `arrivals.ts`): new dishes deduped by item id (a reconnect never re-reads), reminders on the server-corrected clock (AC63), grouped per table.
4. iOS plays sound only inside a tap: turning the voice on speaks at once ("Đã bật đọc to"), and a remembered "on" is woken by the cook's first tap.
5. The voice also tells the cook when the screen lost the server ("Mất kết nối máy chủ") and when it is back ("Đã kết nối lại") — see ADR 0010.
6. **Voice commands are deferred (TQR-030).** Listening ("xong bàn 5") needs the microphone permission on a shared iPad, the Web Speech recognition API is missing or server-backed in several browsers (it sends audio to the browser vendor), and a noisy kitchen makes misrecognition likely on actions that change the queue. The owner's need — not missing an order — is met by speaking alone; commands come back as their own item with a spike first.

## Consequences

- No new service, key, bill or personal data flow; works when the internet is down as long as the shop's LAN reaches the API.
- Voice quality depends on the device: an iPad has "Linh"; a browser without a Vietnamese voice still speaks with `vi-VN` but less well, and a browser without the API shows the switch disabled with a reason.
- Cloud TTS can be added later behind the same `SpeechEngine` port if an owner asks for a nicer voice.
