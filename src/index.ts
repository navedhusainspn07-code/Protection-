export interface Env {
  BOT_TOKEN: string;
  BOT_DATA: KVNamespace;
  ALLOWED_CHAT_IDS: string;
  FORCE_JOIN_CHANNEL?: string;
}

type ChatType = "private" | "group" | "supergroup" | "channel";
interface Chat { id: number; type: ChatType; title?: string; username?: string }
interface User { id: number; is_bot?: boolean; first_name: string; username?: string }
interface Message {
  message_id: number;
  chat: Chat;
  from?: User;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  animation?: unknown;
  document?: unknown;
  sticker?: { file_unique_id: string; set_name?: string };
  voice?: unknown;
  video_note?: unknown;
  audio?: unknown;
  reply_to_message?: Message;
  forward_origin?: { type?: string; chat?: Chat; message_id?: number };
}
interface Update { update_id: number; message?: Message; channel_post?: Message }
interface Config {
  mediaOff: boolean;
  night: { enabled: boolean; start: string; end: string };
  joinEnabled: boolean;
  blockedPacks: string[];
  blockedStickers: string[];
}

const DEFAULT: Config = {
  mediaOff: false,
  night: { enabled: false, start: "23:00", end: "06:00" },
  joinEnabled: false,
  blockedPacks: [],
  blockedStickers: [],
};

function key(chatId: number) { return `chat:${chatId}`; }
function allowed(env: Env, chatId: number) {
  return new Set((env.ALLOWED_CHAT_IDS || "").split(",").map(x => x.trim()).filter(Boolean)).has(String(chatId));
}
async function getConfig(env: Env, chatId: number): Promise<Config> {
  const saved = await env.BOT_DATA.get<Config>(key(chatId), "json");
  return { ...DEFAULT, ...(saved || {}), night: { ...DEFAULT.night, ...(saved?.night || {}) },
    blockedPacks: saved?.blockedPacks || [], blockedStickers: saved?.blockedStickers || [] };
}
async function saveConfig(env: Env, chatId: number, cfg: Config) {
  await env.BOT_DATA.put(key(chatId), JSON.stringify(cfg));
}
async function tg(env: Env, method: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return r.json();
}
async function reply(env: Env, msg: Message, text: string) {
  return tg(env, "sendMessage", { chat_id: msg.chat.id, text, reply_parameters: { message_id: msg.message_id } });
}
async function del(env: Env, msg: Message) {
  return tg(env, "deleteMessage", { chat_id: msg.chat.id, message_id: msg.message_id });
}

function parseHHMM(s: string) {
  const m = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(s.trim());
  return Boolean(m);
}
function istMinutes() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(p.find(x => x.type === "hour")?.value || 0);
  const m = Number(p.find(x => x.type === "minute")?.value || 0);
  return h * 60 + m;
}
function inNight(cfg: Config) {
  if (!cfg.night.enabled) return false;
  const [sh, sm] = cfg.night.start.split(":").map(Number);
  const [eh, em] = cfg.night.end.split(":").map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em, n = istMinutes();
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}
function dateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function command(text?: string) {
  if (!text || !text.startsWith("/")) return null;
  const p = text.trim().split(/\s+/);
  return { name: p[0].split("@")[0].slice(1).toLowerCase(), args: p.slice(1) };
}


async function handleCommand(env: Env, msg: Message, cfg: Config, c: ReturnType<typeof command>) {
  if (!c) return false;
  switch (c.name) {
    case "media":
      if (!/^(on|off)$/.test(c.args[0] || "")) return reply(env,msg,"Usage: /media on|off").then(()=>true);
      cfg.mediaOff = c.args[0] === "off"; await saveConfig(env,msg.chat.id,cfg);
      await reply(env,msg,cfg.mediaOff ? "📵 Media mode OFF — non-text media will be deleted." : "📸 Media mode ON — media is allowed."); return true;
    case "setnight":
      if (!c.args[0] || !c.args[1] || !parseHHMM(c.args[0]) || !parseHHMM(c.args[1])) { await reply(env,msg,"Usage: /Setnight HH:MM HH:MM"); return true; }
      cfg.night.start=c.args[0]; cfg.night.end=c.args[1]; await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,`🌙 Night Mode time set: ${c.args[0]} → ${c.args[1]} IST.`); return true;
    case "night":
      if (!/^(on|off)$/.test(c.args[0] || "")) { await reply(env,msg,"Usage: /Night on|off"); return true; }
      cfg.night.enabled=c.args[0] === "on"; await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,cfg.night.enabled ? `🌙 Night Mode ON (${cfg.night.start}–${cfg.night.end} IST).` : "☀️ Night Mode OFF."); return true;
    case "setjoin":
      if (c.args[0]?.toLowerCase() === "off") { cfg.joinEnabled=false; await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,"✅ Force Join OFF."); return true; }
      cfg.joinEnabled=true; await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,"✅ Force Join ON. Set FORCE_JOIN_CHANNEL to the channel users must join."); return true;
    case "blocksticker": {
      const s=msg.reply_to_message?.sticker; if(!s) { await reply(env,msg,"Reply to a sticker with /Blocksticker."); return true; }
      if(!cfg.blockedStickers.includes(s.file_unique_id)) cfg.blockedStickers.push(s.file_unique_id); await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,"🚫 Sticker blocked."); return true;
    }
    case "unblocksticker": {
      const s=msg.reply_to_message?.sticker; if(!s) { await reply(env,msg,"Reply to a sticker with /Unblocksticker."); return true; }
      cfg.blockedStickers=cfg.blockedStickers.filter(x=>x!==s.file_unique_id); await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,"✅ Sticker unblocked."); return true;
    }
    case "blockpack": {
      const s=msg.reply_to_message?.sticker; if(!s?.set_name) { await reply(env,msg,"Reply to a sticker from the pack with /Blockpack."); return true; }
      if(!cfg.blockedPacks.includes(s.set_name)) cfg.blockedPacks.push(s.set_name); await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,`🚫 Sticker pack blocked: ${s.set_name}`); return true;
    }
    case "unblockpack": {
      const s=msg.reply_to_message?.sticker; if(!s?.set_name) { await reply(env,msg,"Reply to a sticker from the pack with /Unblockpack."); return true; }
      cfg.blockedPacks=cfg.blockedPacks.filter(x=>x!==s.set_name); await saveConfig(env,msg.chat.id,cfg); await reply(env,msg,"✅ Sticker pack unblocked."); return true;
    }
    case "stickerlist":
      await reply(env,msg,`🚫 Blocked packs: ${cfg.blockedPacks.length ? cfg.blockedPacks.join(", ") : "none"}\n🚫 Blocked stickers: ${cfg.blockedStickers.length}`); return true;
    default: return false;
  }
}

async function enforceJoin(env: Env, msg: Message, cfg: Config) {
  if (!cfg.joinEnabled || !msg.from || msg.chat.type === "channel") return;
  const channel = env.FORCE_JOIN_CHANNEL;
  if (!channel) return;
  try {
    const r = await tg(env,"getChatMember",{chat_id:channel,user_id:msg.from.id});
    const s=r?.result?.status;
    if (!["member","administrator","creator"].includes(s)) {
      await del(env,msg);
      await tg(env,"sendMessage",{chat_id:msg.chat.id,text:"🔒 Please join the required channel before sending messages."});
    }
  } catch {}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") return new Response("Bot is running.");
    if (request.method !== "POST") return new Response("Method Not Allowed",{status:405});
    let update: Update; try { update=await request.json(); } catch { return new Response("Bad Request",{status:400}); }
    const msg=update.message || update.channel_post;
    if (msg?.text && command(msg.text)?.name === "chatid") {
  await reply(env, msg, `Chat ID: ${msg.chat.id}`);
  return new Response("OK");
}
    if (msg?.chat.type === "private" && msg.text) {
      const pc = command(msg.text);
      if (pc && (pc.name === "start" || pc.name === "help")) {
        await reply(env, msg,
`🤖 Moderation Bot — Commands

📸 Media
/media off — delete photos, videos, stickers, voice, files
/media on — allow media again

🌙 Night mode (IST)
/Setnight HH:MM HH:MM — set start and end time
/Night on — turn on
/Night off — turn off

🔒 Force join
/Setjoin — turn on
/Setjoin off — turn off

🎭 Stickers (reply to a sticker)
/Blocksticker — block that sticker
/Unblocksticker — unblock it
/Blockpack — block the whole pack
/Unblockpack — unblock the pack
/Stickerlist — show blocked list

🚨 @admin — call the group admins

Add me to your group as admin (with delete permission) to use these.

👨‍💻 Developed by ~ @mrixdu`);
        return new Response("OK");
      }
    }
    
    if (!msg || !allowed(env,msg.chat.id)) return new Response("OK");

    const cfg=await getConfig(env,msg.chat.id);
    const c=command(msg.text);
    if (c) {
      if (c.name === "admin") return reply(env,msg,"@admin").then(()=>new Response("OK"));
      const chk: any = msg.from ? await tg(env,"getChatMember",{chat_id:msg.chat.id,user_id:msg.from.id}) : null;
      const isAdm = ["administrator","creator"].includes(chk?.result?.status)
        || msg.from?.username === "GroupAnonymousBot"
        || msg.chat.type === "channel";
      if (isAdm) {
        const handled=await handleCommand(env,msg,cfg,c); if(handled) return new Response("OK");
      }
    }

if (msg.chat.type !== "channel") {
      await enforceJoin(env,msg,cfg);
      if (inNight(cfg) && msg.from) { await del(env,msg); return new Response("OK"); }
      if (cfg.mediaOff && (msg.photo||msg.video||msg.animation||msg.document||msg.sticker||msg.voice||msg.video_note||msg.audio)) { await del(env,msg); return new Response("OK"); }
      if (msg.sticker && (msg.sticker.set_name && cfg.blockedPacks.includes(msg.sticker.set_name) || cfg.blockedStickers.includes(msg.sticker.file_unique_id))) { await del(env,msg); return new Response("OK"); }
      if ((msg.text||msg.caption||"").toLowerCase().includes("@admin")) {
        const esc = (s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const nm = (u:any)=>esc([u.first_name,u.last_name].filter(Boolean).join(" ") || "Admin");
        const r: any = await tg(env,"getChatAdministrators",{chat_id:msg.chat.id});
        const mentions = (r?.result||[])
          .filter((a:any)=>!a.user.is_bot)
          .map((a:any)=>`<a href="tg://user?id=${a.user.id}">${nm(a.user)}</a>`)
          .join(" ");
        const who = msg.from ? nm(msg.from) : "a member";
        await tg(env,"sendMessage",{
          chat_id:msg.chat.id,
          text:`🚨 Admin attention requested by <b>${who}</b>:\n${mentions}`,
          parse_mode:"HTML",
          reply_parameters:{message_id:msg.message_id}
        });
      }
    }
    return new Response("OK");
  }
};
    
