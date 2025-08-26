// netlify/functions/aspo.js
const ALLOW_ORIGIN = "*"; // Byt till "https://aspo-zeitplan.netlify.app" när allt funkar

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
  </REQUEST>
  `.replace(/\n\s+/g, ' ');
}

export async function handler(event) {
  console.log("Incoming event.body:", event.body);

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
    console.error("TRV_API_KEY saknas!");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Saknar TRV_API_KEY i miljövariabler" }) };
  }

  try {
    const xml = buildQuery(dateStr, apiKey);
    const resp = await fetch("https://api.trafikinfo.trafikverket.se/v2/data.json", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
    });

    const text = await resp.text();
    console.log("TRV response (first 300 chars):", text.slice(0,300));

    return {
      statusCode: resp.status,
      headers: { ...headers, "Content-Type": "application/json" },
      body: text
    };
  } catch (err) {
    console.error("Error calling Trafikverket API:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}
