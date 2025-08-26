// netlify/functions/aspo.js
const TRV_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json";
const ALLOW_ORIGIN = "*";

function buildXML(apiKey) {
  return `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryRoute" schemaversion="1.2">
      <FILTER>
        <EQ name="Name" value="Aspöleden" />
      </FILTER>
      <INCLUDE>Name</INCLUDE>
      <INCLUDE>Harbor</INCLUDE>
      <INCLUDE>Timetable</INCLUDE>
    </QUERY>
    <QUERY objecttype="FerryAnnouncement" schemaversion="1.2">
      <FILTER>
        <LIKE name="RouteName" value="%Aspöleden%" />
      </FILTER>
      <INCLUDE>RouteName</INCLUDE>
      <INCLUDE>StartTime</INCLUDE>
      <INCLUDE>EndTime</INCLUDE>
      <INCLUDE>Message</INCLUDE>
    </QUERY>
  </REQUEST>`.replace(/\n\s+/g, " ");
}

async function trvPost(xml) {
  const resp = await fetch(TRV_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  const text = await resp.text();

  let parsed = JSON.parse(text);
  if (typeof parsed === "string") parsed = JSON.parse(parsed);

  return parsed;
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const apiKey = process.env.TRV_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing TRV_API_KEY" }),
    };
  }

  try {
    const xml = buildXML(apiKey);
    const json = await trvPost(xml);

    // Returnera hela svaret (för klienten att filtrera)
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(json),
    };
  } catch (err) {
    console.error("aspo.js error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}
