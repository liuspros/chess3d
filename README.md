# Chess 3D

A realistic 3D chess PWA: marble and walnut board on a table in a room, procedural pieces,
hands that pick up and move the pieces, online play with friends, Elo, puzzles and post-game review.
Textures, models and sounds are all generated in code, so there are almost no assets.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview
```

## Features

**Look and feel**
- Room scene (floor, rug, walls, window, bookshelf, pendant lamp), table, wooden capture trays
- Procedural marble + wood (grain, rings, pores, veins, bump maps) generated in a Web Worker
- Contact shadows under every piece, soft light/shadows, selection glow, pulsing legal-move rings
- Pieces are picked up and carried by a procedural hand; captured pieces are carried to the trays
- Subtle camera punch on check; checkmate cinematic (glide to the king, spotlight, confetti)
- Wooden UI: every button and panel uses the same wood generator as the board

**Play**
- vs Stockfish 19 (WASM, Web Worker, works offline): 5 levels
- Pass and play, clocks, undo, resign, move list
- Online vs friends: room code + share link (`?join=CODE`, WhatsApp share), live clocks,
  draw offers, resign, rematch, reconnect after refresh, "claim win" if the opponent leaves
- Quick match (rating-based pairing), Elo, leaderboard, profile and game history
- Puzzles (88 engine-verified: mate in 1/2/3 and tactics), daily puzzle, puzzle rating
- Post-game review: Stockfish analysis, eval graph, Best/Good/Inaccuracy/Mistake/Blunder, accuracy

**Performance**
- Graphics tiers Auto / High / Medium / Low / 2D. Auto steps down if the frame rate drops.
  Hands + room detail are switched off on Low.

## Firebase setup (one time)

Project: `mychess-3d` (config is in `src/firebase/config.js`).

1. Authentication > Sign-in method: enable **Google**, **Email/Password** and **Anonymous**.
2. Authentication > Settings > Authorized domains: add the domain you deploy to.
3. Firestore Database: create it (production mode), then publish `firestore.rules`
   (`firebase deploy --only firestore:rules`, or paste into the Rules tab).
4. No composite indexes are needed.

## Hands (procedural, no assets)
`src/three/hands/` builds the whole hand in code: anatomy (HandAnatomy) -> smooth signed-distance mesh with knuckles, tendons, thenar/hypothenar, webs and forearm (HandGeometry) -> skinned to a 3-segment-per-finger skeleton (HandSkeleton/HandRig/HandPoses) -> procedural skin shader with pores, creases, veins, palm lines, bump and a subsurface approximation (SkinShaders/HandMaterials) -> nails fitted onto the fingertip surface (Fingernails) -> cloth sleeve with folds (Sleeve). Move choreography (reach, grip, lift, move, release, return, with smooth recovery on cancel) is in HandAnimation + Hand.jsx. Mesh resolution and shader level follow the graphics tier. `lab/` is a dev-only hand viewer (`npm run dev`, open /lab/hand-lab.html); it is not part of the build.

## Phone landscape
In landscape on a phone the player bars and buttons move to the left and right edges so the board stays clear.

## Shop / Paystack / Vercel
See `api/` and `src/data/catalog.js`. Vercel env: `PAYSTACK_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`. Paystack webhook: `https://<your-domain>/api/webhook`. Prices are in USD and converted to the buyer's local currency at checkout. Publish `firestore.rules`.

## Chat, reactions, friends (free-plan friendly)
- In-game chat: players type or tap quick phrases; reactions float over the board; spectators can read. Players can switch chat off in Settings. Messages live in `games/{code}/chat` (last 40, 200 chars, 1 per 1.5 s) and are deleted when a player leaves the finished game. A small word filter masks insults.
- Friends: each player has a 6-letter friend code. Requests are single docs (`requests/{to}_{from}`); accepting creates both friend entries. Challenges are one doc per recipient (`challenges/{uid}`) with a room code; accepting joins the room. One listener per user, no presence polling.
- Publish the updated `firestore.rules` (chat, friends, requests, challenges).

## Push notifications (free)
Uses Firebase Cloud Messaging + `/api/notify` on Vercel. Setup: Firebase console > Project settings > Cloud Messaging > Web Push certificates > Generate key pair, put the public key in the Vercel env `VITE_VAPID_KEY`, redeploy. Players turn it on in Settings. Pushes: opponent played while you were away, challenge received, friend request. Each request is validated on the server and throttled. iPhone needs the app added to the Home Screen.

## Honest limits

There are no Cloud Functions, so the clients are trusted: move legality is checked by each client,
and clocks/Elo are computed client side. Fine for friends; a determined cheater could tamper with it.
Moving legality, clock and Elo checks to Cloud Functions is the next hardening step.
The hands are stylised procedural models (not photoreal); a rigged hand model would be needed for that.

## Where things live

| Path | What |
|---|---|
| `src/three/Scene.jsx` | Board, pieces, highlights, camera, lights, effects |
| `src/three/Hand.jsx` | Procedural hand + move choreography |
| `src/three/Room.jsx` | Room, table, capture trays |
| `src/three/texgen.js`, `texWorker.js` | Marble/wood generators (worker) |
| `src/three/materials.js` | Quality tiers and materials |
| `src/game/useChessGame.js` | Game state, move events, bot, clocks, review, puzzles support |
| `src/game/review.js` | Stockfish analysis, classification, accuracy |
| `src/firebase/api.js` | All Firebase access (lazy loaded) |
| `src/online/useAuth.js`, `useOnline.js` | Sign-in/profile, online game sync, matchmaking |
| `src/ui/*` | Home, sheets, HUD, review/puzzle panels, wood theme |
| `src/data/puzzles.json` | Puzzles generated with `scripts/gen-puzzles.mjs` |
| `test/fake/*` | Fake Firebase used for offline tests (`FAKE_FB=1 npm run build`) |
| `firestore.rules`, `firebase.json` | Security rules and hosting config |

## Import from Chess.com / Lichess

Home > Import.

- **Rating** (needs a signed-in account): pick the site and username, get a code like `MIGRATE-4821`, paste it into your Lichess bio or Chess.com location, press Verify. `api/import.js` reads the public profile with a `User-Agent` that includes `IMPORT_CONTACT_EMAIL` (Chess.com asks for this), checks the code, converts the rating (`src/lib/ratingConvert.js`: Lichess is shifted down ~300 for beginners/intermediates, tapering to 0 at 2600; few games pull it towards 1200) and stores it. Each external account can be linked to one player and a player can import once. The first 15 rated games use a higher K factor (`provisional`) and `rd` shrinks as games are played. Chess.com Tactics / Lichess puzzle rating seeds the puzzle level, and "Next puzzle" now picks the unsolved puzzle closest to that rating.
- **Games**: recent games from Lichess (one streamed export) or Chess.com (monthly archives, newest first, ~1 request/s, 429 answers waited out) are fetched from the browser and parsed with chess.js, or drop/choose a `.pgn` file. Stored on the device only (last 300), Review works on each one.
- Set `IMPORT_CONTACT_EMAIL` in Vercel. Tests: `node test/api.test.mjs`, `node test/import.test.mjs`.

"Continue with Lichess" (Import > Rating > Lichess) uses OAuth2 + PKCE: no registration or secret is needed on Lichess. `src/lib/lichessOAuth.js` redirects to lichess.org/oauth and returns to `/?code=&state=`; `api/import.js` (`lichess_oauth`) swaps the code, reads `/api/account` (no scope, username only), revokes the token and links the account like the code method.
