// netlify/functions/exploreRoute.js
const TRV_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json";

export async function handler() {
  const apiKey = process.env.TRV_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "Ingen TRV_API_KEY i miljövariabler" };
  }

  const xml = `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryRoute" schemaversion="1.2">
      <FILTER>
        <EQ name="Name" value="Aspöleden" />
      </FILTER>
      <!-- Inga INCLUDE alls → vi får hela objektet -->
    </QUERY>
  </REQUEST>`.replace(/\n\s+/g, " ");

  try {
    const resp = await fetch(TRV_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
    });

    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: text, // skicka råsvar tillbaka
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
}
