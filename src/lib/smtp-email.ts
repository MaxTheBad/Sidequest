function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string) {
  return base64Utf8(value).replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function parseMailbox(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

export async function sendSmtpEmail({
  host, port, user, password, from, to, subject, text, html, replyTo,
}: {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}) {
  const socketModule = "cloudflare:sockets";
  const { connect } = await import(/* webpackIgnore: true */ socketModule);
  const socket = connect(
    { hostname: host, port },
    { secureTransport: port === 465 ? "on" : "starttls" },
  );
  await socket.opened;

  let activeSocket = socket;
  let reader = activeSocket.readable.getReader();
  let writer = activeSocket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = "";

  async function readResponse() {
    const lines: string[] = [];
    while (true) {
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex + 1).replace(/\r?\n$/, "");
        buffered = buffered.slice(newlineIndex + 1);
        lines.push(line);
        if (/^\d{3} /.test(line)) {
          const code = Number(line.slice(0, 3));
          if (code >= 400) throw new Error(`SMTP error: ${lines.join(" | ")}`);
          return { code, message: lines.join("\n") };
        }
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP connection closed unexpectedly.");
      buffered += decoder.decode(value, { stream: true });
    }
  }

  async function command(value: string, expectedCode: number) {
    await writer.write(encoder.encode(`${value}\r\n`));
    const response = await readResponse();
    if (response.code !== expectedCode) throw new Error(`Unexpected SMTP response ${response.code}: ${response.message}`);
  }

  try {
    const greeting = await readResponse();
    if (greeting.code !== 220) throw new Error(`Unexpected SMTP greeting: ${greeting.message}`);
    await command("EHLO questhat.com", 250);
    if (port !== 465) {
      reader.releaseLock();
      writer.releaseLock();
      activeSocket = activeSocket.startTls();
      await activeSocket.opened;
      reader = activeSocket.readable.getReader();
      writer = activeSocket.writable.getWriter();
      buffered = "";
      await command("EHLO questhat.com", 250);
    }
    await command("AUTH LOGIN", 334);
    await command(btoa(user), 334);
    await command(btoa(password), 235);
    await command(`MAIL FROM:<${parseMailbox(from)}>`, 250);
    await command(`RCPT TO:<${to}>`, 250);
    await command("DATA", 354);

    const boundary = `questhat-${crypto.randomUUID()}`;
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
      "X-Mailer: QuestHat",
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(text),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(html),
      `--${boundary}--`,
      "",
    ].filter(Boolean).join("\r\n").replace(/^\./gm, "..");

    await writer.write(encoder.encode(`${message}\r\n.\r\n`));
    const accepted = await readResponse();
    if (accepted.code !== 250) throw new Error(`SMTP rejected the message: ${accepted.message}`);
    await command("QUIT", 221);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await activeSocket.close().catch(() => undefined);
  }
}
