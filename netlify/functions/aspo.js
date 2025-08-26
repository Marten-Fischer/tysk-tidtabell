// netlify/functions/aspo.js
const ALLOW_ORIGIN = "https://xn--asp-una.nu"; // byt vid behov till din faktiska domän

function buildQuery(dateStr, apiKey) {
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
    <QUERY objecttype="FerryAnnouncement" schemaversion="1.2">
      <FILTER>
        <AND>
          <GT name="EndTime" value="${dateStr}T00:00:00" />
          <LT name="StartTime" value="${dateStr}T23:59:59" />
          <LIKE name="RouteName" value="%Aspöleden%" />
        </AND>
      </FILTER>
      <INCLUDE>RouteName</INCLUDE>
      <INCLUDE>StartTime</INCLUDE>
      <INCLUDE>EndTime</INCLUDE>
      <INCLUDE>Message</INCLUDE>
      <INCLUDE>Priority</INCLUDE>
    </QUERY>
  </REQUEST>
  `.replace(/\n\s+/g, ' ');
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  let dateStr;
  try {
    const payload = JSON.parse(event.body || "{}");
    dateStr = payload.date || new Date().toISOString().slice(0,10);
  } catch {
    dateStr = new Date().toISOString().slice(0,10);
  }

  const apiKey = process.env.TRV_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Saknar TRV_API_KEY i miljövariabler" }) };
  }

  const xml = buildQuery(dateStr, apiKey);
  const resp = await fetch("https://api.trafikinfo.trafikverket.se/v2/data.json", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });

  const text = await resp.text(); // Trafikverket returnerar JSON som text
  return { statusCode: resp.status, headers: { ...headers, "Content-Type": "application/json" }, body: text };
}
