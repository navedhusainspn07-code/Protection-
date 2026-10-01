# Telegram Moderation Bot — Cloudflare Worker

A lightweight Telegram bot running entirely on Cloudflare Workers + KV.

## Commands

- `/media on|off`
- `/Setnight HH:MM HH:MM`
- `/Night on|off`
- `/Setjoin`
- `/Setjoin off`
- `@admin`
- `/Blocksticker`
- `/Unblocksticker`
- `/Blockpack`
- `/Unblockpack`
- `/Stickerlist`

All listed commands are available to users. The bot itself only processes updates from the chat IDs configured in `ALLOWED_CHAT_IDS`.

## Restrictions

- Exactly 2 groups + 1 channel can be allowed through `ALLOWED_CHAT_IDS`.
- Cloudflare KV stores per-chat settings.
- `/antispam` and `/leaderboard` are not included.
- Pyrogram-dependent `/clean` is not included in this Cloudflare-only version.

## Cloudflare setup

1. Create a Cloudflare Worker.
2. Create a KV namespace and bind it as `BOT_DATA`.
3. Set Worker secret `BOT_TOKEN`.
4. Set `ALLOWED_CHAT_IDS` to the two group IDs and one channel ID, comma-separated.
5. Optionally set `FORCE_JOIN_CHANNEL` if `/Setjoin` should enforce channel membership.
6. Deploy the Worker.
7. Set the Telegram webhook to the Worker URL:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev`

The Worker uses webhooks; it does not need polling, Node.js, Postgres, Render, or a continuously running server.
