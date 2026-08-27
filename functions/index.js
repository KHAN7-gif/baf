const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");

initializeApp();
const db = getFirestore();

setGlobalOptions({
  region: "asia-southeast1",
  maxInstances: 1
});

const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = defineSecret("VAPID_SUBJECT");

function isReal(id) {
  return !!id && id !== "TBD" && id !== "BYE";
}

function teamName(state, id) {
  const t = (state?.teams || []).find(x => x && x.id === id);
  return t?.name || t?.short || id || "Pasukan";
}

function koNo(m) {
  return m?.no || m?.matchNo || m?.id || "MATCH";
}

function koWinner(m) {
  const a = Number(m?.ts ?? 0);
  const b = Number(m?.bs ?? 0);
  if (a > b) return "top";
  if (b > a) return "bot";
  return null;
}

function danceProgress(s) {
  const teams = s?.teams || [];
  const perf = s?.perf || [];
  let liveId = null;
  let nextId = null;
  for (let i = 0; i < teams.length; i++) {
    if (!isReal(teams[i])) continue;
    if (perf[i] === "live") liveId = teams[i];
    if (!nextId && perf[i] !== "off" && perf[i] !== "live") nextId = teams[i];
  }
  return { liveId, nextId };
}

function changedEvents(before, after) {
  const events = [];

  for (const mode of ["danceS1", "danceS2"]) {
    const sk = mode === "danceS1" ? "s1" : "s2";
    const a = before?.[sk]?.perf || [];
    const b = after?.[sk]?.perf || [];
    const len = Math.max(a.length, b.length);
    const session = mode === "danceS1" ? "Sesi 1" : "Sesi 2";

    for (let i = 0; i < len; i++) {
      if (a[i] !== "live" && b[i] === "live" && isReal(after?.[sk]?.teams?.[i])) {
        const id = after[sk].teams[i];
        events.push({
          title: "💃 Tarian Kreatif Borneo",
          body: `${session} · ${teamName(after, id)} sedang membuat persembahan.`,
          type: "live",
          category: "dance",
          session,
          mode,
          teamId: id,
          index: i,
          tag: `baf-${mode}-live-${i}-${after.updated || Date.now()}`
        });
      }

      if (a[i] === "live" && b[i] === "off" && isReal(after?.[sk]?.teams?.[i])) {
        const id = after[sk].teams[i];
        events.push({
          title: "🏁 Tarian Kreatif Borneo",
          body: `${session} · ${teamName(after, id)} telah selesai membuat persembahan.`,
          type: "done",
          category: "dance",
          session,
          mode,
          teamId: id,
          index: i,
          tag: `baf-${mode}-done-${i}-${after.updated || Date.now()}`
        });

        const p = danceProgress(after[sk]);
        if (p.nextId) {
          const ni = (after[sk].teams || []).indexOf(p.nextId);
          events.push({
            title: "⏭️ Tarian Kreatif Borneo",
            body: `${session} · Persembahan seterusnya: ${teamName(after, p.nextId)}.`,
            type: "next",
            category: "dance",
            session,
            mode,
            teamId: p.nextId,
            index: ni,
            tag: `baf-${mode}-next-${ni}-${after.updated || Date.now()}`
          });
        }
      }
    }
  }

  const prev = new Map((before?.ko || []).map(m => [m.id, m]));
  for (const m of (after?.ko || [])) {
    const old = prev.get(m.id);
    if (!old || !isReal(m.top) || !isReal(m.bot)) continue;

    if (old.status !== "live" && m.status === "live") {
      events.push({
        title: "🔴 Tingkah Geruh Battle",
        body: `${koNo(m)} · ${teamName(after, m.top)} 🆚 ${teamName(after, m.bot)} · Perlawanan sedang berlangsung.`,
        type: "live",
        category: "battle",
        matchId: m.id,
        tag: `baf-battle-${m.id}-live-${after.updated || Date.now()}`
      });
    }

    if (old.status !== "ft" && m.status === "ft") {
      events.push({
        title: "🏁 Tingkah Geruh Battle",
        body: `${koNo(m)} · ${teamName(after, m.top)} 🆚 ${teamName(after, m.bot)} · Perlawanan telah berakhir.`,
        type: "done",
        category: "battle",
        matchId: m.id,
        tag: `baf-battle-${m.id}-done-${after.updated || Date.now()}`
      });

      const a = Number(m.ts ?? 0);
      const b = Number(m.bs ?? 0);
      const winner = koWinner(m);
      const winnerName = winner === "top" ? teamName(after, m.top)
        : winner === "bot" ? teamName(after, m.bot)
        : null;

      events.push({
        title: "🏆 Tingkah Geruh Battle",
        body: `${koNo(m)} · KEPUTUSAN · ${teamName(after, m.top)} ${a} — ${b} ${teamName(after, m.bot)}${winnerName ? ` · 🥇 ${winnerName}` : ""}`,
        type: "result",
        category: "battle",
        matchId: m.id,
        tag: `baf-battle-${m.id}-result-${after.updated || Date.now()}`
      });

      const upcoming = (after.ko || []).find(x => x.id !== m.id && x.status !== "ft" && isReal(x.top) && isReal(x.bot));
      if (upcoming) {
        events.push({
          title: "⏭️ Tingkah Geruh Battle",
          body: `${koNo(upcoming)} · ${teamName(after, upcoming.top)} 🆚 ${teamName(after, upcoming.bot)} · Perlawanan seterusnya.`,
          type: "next",
          category: "battle",
          matchId: upcoming.id,
          tag: `baf-battle-${upcoming.id}-next-${after.updated || Date.now()}`
        });
      }
    }
  }

  return events;
}

function prefAllowed(sub, event) {
  const p = sub?.prefs || {};
  if (p.enabled === false) return false;
  if (event.category === "dance") {
    if (event.mode === "danceS1" && p.danceS1 === false) return false;
    if (event.mode === "danceS2" && p.danceS2 === false) return false;
  }
  if (event.category === "battle" && p.battle === false) return false;
  if (event.type === "live" && p.live === false) return false;
  if (event.type === "done" && p.done === false) return false;
  if (event.type === "result" && p.result === false) return false;
  if (event.type === "next" && p.next === false) return false;
  if (event.type === "soon") {
    if (event.mode === "danceS1" && p.soonS1 === false) return false;
    if (event.mode === "danceS2" && p.soonS2 === false) return false;
    if (event.category === "battle" && p.soonBattle === false) return false;
  }
  return true;
}

async function sendToSubscribers(event, sourceDeviceId = "") {
  webpush.setVapidDetails(
    VAPID_SUBJECT.value(),
    VAPID_PUBLIC_KEY.value(),
    VAPID_PRIVATE_KEY.value()
  );

  const ref = db.doc("battlezapin/push");
  const snap = await ref.get();
  const subscriptions = Array.isArray(snap.data()?.subscriptions)
    ? snap.data().subscriptions
    : [];

  const stale = new Set();
  const payload = JSON.stringify({
    title: event.title,
    body: event.body,
    type: event.type,
    category: event.category || "",
    session: event.session || "",
    matchId: event.matchId || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: event.tag,
    url: event.url || "./"
  });

  let sent = 0;
  for (const sub of subscriptions) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    if (sourceDeviceId && sub.deviceId === sourceDeviceId) continue;
    if (!prefAllowed(sub, event)) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 300 }
      );
      sent++;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) stale.add(sub.endpoint);
      else console.error("Push send failed:", code, err?.message);
    }
  }

  if (stale.size) {
    const clean = subscriptions.filter(s => !stale.has(s?.endpoint));
    await ref.set({ subscriptions: clean, updated: Date.now() }, { merge: true });
  }

  return sent;
}

exports.bafRemotePush = onDocumentUpdated(
  {
    document: "battlezapin/main",
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT]
  },
  async (event) => {
    const beforeRaw = event.data?.before?.data()?.json;
    const afterRaw = event.data?.after?.data()?.json;
    if (!beforeRaw || !afterRaw || beforeRaw === afterRaw) return;

    let before, after;
    try {
      before = JSON.parse(beforeRaw);
      after = JSON.parse(afterRaw);
    } catch (_) {
      return;
    }

    const events = changedEvents(before, after);
    if (!events.length) return;

    for (const item of events) {
      await sendToSubscribers(item, after.__pushSourceDeviceId || "");
    }
  }
);

exports.bafRemotePushManual = onDocumentCreated(
  {
    document: "battlezapin/pushEvents/{eventId}",
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT]
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.title) return;
    await sendToSubscribers(data, data.sourceDeviceId || "");
  }
);
