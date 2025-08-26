// netlify/functions/aspo.js

// Släpp CORS under felsökning. Byt till din domän när allt funkar:
// ex. const ALLOW_ORIGIN = "https://aspo-zeitplan.netlify.app";
const ALLOW_ORIGIN = "*";
const TRV_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json";

/** Försöker parsa JSON en eller två gånger (TRV kan ibland komma som "JSON i sträng"). */
function safeParse(text) {
  try {
    const once = JSON.parse(text);
    if (typeof once === "string") {
      try { return JSON.parse(once); } catch { return null; }
    }
    return once;
  } catch {
    return null;
  }
}

/** POST:ar XML till TRV, returnerar { ok, status, text, json } utan att kasta. */
async function trvPost(xml) {
  const resp = await fetch(TRV_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml.replace(/\n\s+/g, " "),
  });
  const text = await resp.text();
  const json = safeParse(text);
  return { ok: resp.ok, status: resp.status, text, json };
}

/** XML för FerryRoute (Aspöleden + tidtabell) */
function buildRouteXML(apiKey) {
  return `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryRoute" schemaversion="1.2">
      <FILTER>
        <EQ name="Name" value="Aspöleden" />
      </FILTER>
      <INCLUDE>Name</INCLUDE>
      <INCLUDE>TimeTable</INCLUDE>
    </QUERY>
  </REQUEST>`;
}

/** XML för FerryAnnouncement (börjar enkelt: bara RouteName + Message) */
function buildAnnouncementXML(apiKey) {
  return `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryAnnouncement" schemaversion="1.2">
      <FILTER>
        <LIKE name="RouteName" value="%Aspöleden%" />
      </FILTER>
      <INCLUDE>RouteName</INCLUDE>
      <INCLUDE>StartTime</INCLUDE>
      <INCLUDE>EndTime</INCLUDE>
      <INCLUDE>Message</INCLUDE>
      <INCLUDE>Priority</INCLUDE>
    </QUERY>
  </REQUEST>`;
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // (datumet används inte i den enkla Announcement-frågan ännu)
  try { JSON.parse(event.body || "{}"); } catch {}

  const apiKey = process.env.TRV_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Saknar TRV_API_KEY i miljövariabler" }) };
  }

  // 1) Hämta tidtabell (måste lyckas)
  const routeRes = await trvPost(buildRouteXML(apiKey));
  const ferryRoute = routeRes.json?.RESPONSE?.RESULT?.find(r => r.FerryRoute)?.FerryRoute || [];

  // Om tidtabellen inte kom tillbaka som JSON → skicka tydlig diagnos till klienten men 200-status,
  // så att sidan kan visa fel utan att krascha.
  if (!routeRes.ok || !ferryRoute) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        RESPONSE: { RESULT: [ { FerryRoute: [] }, { FerryAnnouncement: [] } ] },
        debug: {
          routeOk: routeRes.ok,
          routeStatus: routeRes.status,
          routeSnippet: routeRes.text?.slice(0, 300) || null
        }
      })
    };
  }

  // 2) Försök hämta meddelanden (om det misslyckas → tom lista, inget 500)
  const annRes = await trvPost(buildAnnouncementXML(apiKey));
  const ferryAnnouncement =
    annRes.ok
      ? (annRes.json?.RESPONSE?.RESULT?.find(r => r.FerryAnnouncement)?.FerryAnnouncement || [])
      : [];

  // 3) Returnera i formatet din HTML redan förväntar sig
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      RESPONSE: {
        RESULT: [
          { FerryRoute: ferryRoute },
          { FerryAnnouncement: ferryAnnouncement }
        ]
      },
      // liten felsökningsruta (ignoreras av din parser)
      debug: {
        routeOk: routeRes.ok, routeStatus: routeRes.status,
        annOk: annRes.ok, annStatus: annRes.status
      }
    })
  };
}
