// netlify/functions/checkKey.js

export async function handler() {
  const apiKey = process.env.TRV_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Ingen TRV_API_KEY i miljövariabler" })
    };
  }

  // Minimal fråga till Trafikverket: hämta Aspöleden namn
  const xml = `
  <REQUEST>
    <LOGIN authenticationkey="${apiKey}" />
    <QUERY objecttype="FerryRoute" schemaversion="1.2">
      <FILTER>
        <EQ name="Name" value="Aspöleden" />
      </FILTER>
      <INCLUDE>Name</INCLUDE>
    </QUERY>
  </REQUEST>`.replace(/\n\s+/g, " ");

  try {
    const resp = await fetch("https://api.trafikinfo.trafikverket.se/v2/data.json", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
    });

    const text = await resp.text();

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: resp.ok,
        status: resp.status,
        response: text.slice(0, 200) // visa första 200 tecken
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
