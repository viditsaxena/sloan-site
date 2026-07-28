const REQUIRED_FIELDS = ["name_company", "email", "lead_volume", "first_caller"];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  for (const field of REQUIRED_FIELDS) {
    if (!data[field] || typeof data[field] !== "string") {
      return Response.json({ ok: false, error: `missing_field:${field}` }, { status: 400 });
    }
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(data.email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  if (!env.RESEND_API_KEY || !env.TO_EMAIL) {
    return Response.json({ ok: false, error: "not_configured" }, { status: 500 });
  }

  const utmRows = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    .filter((k) => data[k])
    .map((k) => `<tr><td>${k}</td><td>${escapeHtml(data[k])}</td></tr>`)
    .join("");

  const html = `
    <h2>New Sloan application</h2>
    <table cellpadding="6" cellspacing="0">
      <tr><td><strong>Name and company</strong></td><td>${escapeHtml(data.name_company)}</td></tr>
      <tr><td><strong>Work email</strong></td><td>${escapeHtml(data.email)}</td></tr>
      <tr><td><strong>Monthly inbound seller leads</strong></td><td>${escapeHtml(data.lead_volume)}</td></tr>
      <tr><td><strong>Who makes the first calls</strong></td><td>${escapeHtml(data.first_caller)}</td></tr>
      <tr><td><strong>Monthly cost today</strong></td><td>${escapeHtml(data.monthly_cost || "")}</td></tr>
      ${utmRows}
      <tr><td><strong>Page URL</strong></td><td>${escapeHtml(data.page_url || "")}</td></tr>
    </table>
  `;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "Sloan <onboarding@resend.dev>",
      to: [env.TO_EMAIL],
      reply_to: data.email,
      subject: `New Sloan application: ${data.name_company}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    console.error("Resend send failed", resendRes.status, detail);
    return Response.json({ ok: false, error: "send_failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
