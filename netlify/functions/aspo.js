// netlify/functions/aspo.js

// Släpp CORS fritt medan vi felsöker. När allt funkar: byt till din domän.
// ex: const ALLOW_ORIGIN = "https://aspo-zeitplan.netlify.app";
const ALLOW_ORIGIN = "*";

const TRV_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json";

/** Hjälpare: gör ett POST-anrop till Trafikverket med given XML och returnerar JSON-parsat svar */
async function trvPost(xml) {
  const resp = await fetch(TRV_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml.replace(/\n\s+/g, " "),
  });
  const text = await resp.text();

  // Trafikverket returnerar JSON (text). Försök parsa, annars kasta ett tydligt fel.
  try {
    const json = JSON.parse(text);
    if (!resp.ok) {
      // API svarade med felstatus men JSON – bubbla upp orsak i body
      throw new Error(`TRV error ${resp.status}: ${text}`);
    }
    return json;
  } catch (e) {
    // Om JSON.parse faller, logga första biten av text för diagnos
    console.error("Kunde inte parsa TRV-svar som JSON:", text.slice(0, 400));
    throw new Error(`Ogiltigt TRV-svar / status ${resp.status}`);
  }
}

/** Bygger XML för FerryRoute (dagens tidtabell för Aspöleden) */
function buildRouteXML(apiKey) {
  return `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryRoute" schemaversion="1.2">
      <FILTER>
        <EQ name="Name" value="Aspöleden" />
      </FILTER>
      <INCLUDE>Id</INCLUDE>
      <INCLUDE>Name</INCLUDE>
      <INCLUDE>FromHarbour</INCLUDE>
      <INCLUDE>ToHarbour</INCLUDE>
      <INCLUDE>TimeTable</INCLUDE>
    </QUERY>
  </REQUEST>`;
}

/** Bygger XML för FerryAnnouncement (meddelanden för Aspöleden samma dag) */
function buildAnnouncementXML(dateStr, apiKey) {
  // Vi börjar enkelt: bara route + message (utan tidfilter).
  // När detta fungerar kan vi lägga till datumfilter igen om du vill.
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

  // Datum från klienten (fallback till idag)
  let dateStr;
  try {
    const payload = JSON.parse(event.body || "{}");
    dateStr = payload.date || new Date().toISOString().slice(0, 10);
  } catch {
    dateStr = new Date().toISOString().slice(0, 10);
  }

  const apiKey = process.env.TRV_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Saknar TRV_API_KEY i miljövariabler" }),
    };
  }

  try {
    // 1) Hämta FerryRoute (tidtabell)
    const routeJson = await trvPost(buildRouteXML(apiKey));
    // 2) Hämta FerryAnnouncement (meddelanden) – enkel filter på RouteName
    const annJson = await trvPost(buildAnnouncementXML(dateStr, apiKey));

    // Din HTML förväntar sig formatet:
    // { "RESPONSE": { "RESULT": [ { "FerryRoute":[...] }, { "FerryAnnouncement":[...] } ] } }
    const ferryRoute = routeJson?.RESPONSE?.RESULT?.find(r => r.FerryRoute)?.FerryRoute || [];
    const ferryAnnouncement = annJson?.RESPONSE?.RESULT?.find(r => r.FerryAnnouncement)?.FerryAnnouncement || [];

    const combined = {
      RESPONSE: {
        RESULT: [
          { FerryRoute: ferryRoute },
          { FerryAnnouncement: ferryAnnouncement },
        ],
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(combined),
    };
  } catch (err) {
    console.error("Fel i aspo-funktion:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
}
