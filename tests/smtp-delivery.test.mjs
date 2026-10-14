import test from "node:test";
import assert from "node:assert/strict";
import { sendSmtpEmail } from "../src/lib/smtp-email.ts";
import { createFeedbackService } from "../src/lib/app-feedback.js";

const options = { host: "smtp.example.invalid", port: 465, user: "qa", password: "dummy", from: "qa@example.invalid", to: "suggestions@example.invalid", subject: "QA", text: "QA test", html: "<p>QA test</p>" };
function connector({ hangOpened = false, hangGreeting = false, hangQuit = false, rejectData = false } = {}) {
  let controller, closed = false, message = "";
  const encoder = new TextEncoder();
  const reply = text => controller.enqueue(encoder.encode(text + "\r\n"));
  const readable = new ReadableStream({ start(c) { controller = c; if (!hangGreeting) reply("220 ready"); } });
  const writable = new WritableStream({ write(bytes) {
    const command = new TextDecoder().decode(bytes);
    if (command.startsWith("EHLO")) reply("250 hello");
    else if (command.startsWith("AUTH LOGIN")) reply("334 user");
    else if (command.trim() === btoa("qa")) reply("334 password");
    else if (command.trim() === btoa("dummy")) reply("235 accepted");
    else if (command.startsWith("MAIL FROM") || command.startsWith("RCPT TO")) reply("250 accepted");
    else if (command.startsWith("DATA")) reply("354 continue");
    else if (command.startsWith("QUIT")) { if (!hangQuit) reply("221 bye"); }
    else { message = command; reply(rejectData ? "550 rejected" : "250 queued"); }
  } });
  const socket = { opened: hangOpened ? new Promise(() => {}) : Promise.resolve(), readable, writable, close: async () => { if (!closed) { closed = true; controller.close(); } }, startTls() { return this; } };
  return { connectSocket: () => socket, isClosed: () => closed, getMessage: () => message };
}

test("SMTP DATA preserves message and MIME-part header/body separators, including empty bodies", async () => {
  for (const content of [
    { text: "QA café\nSecond line", html: "<p>QA café</p>" },
    { text: "", html: "", replyTo: "reply@example.invalid" },
  ]) {
    const connection = connector();
    await sendSmtpEmail({ ...options, ...content }, { ...connection, timeoutMs: 100 });
    const message = connection.getMessage();
    const separator = message.indexOf("\r\n\r\n");
    assert.ok(separator > 0, "message headers must end with a blank line");
    const headers = message.slice(0, separator);
    const boundary = headers.match(/boundary="([^"]+)"/)?.[1];
    assert.ok(boundary);
    assert.match(headers, /MIME-Version: 1\.0/);
    if (content.replyTo) assert.match(headers, /Reply-To: reply@example\.invalid/);
    else assert.doesNotMatch(headers, /Reply-To:|null|undefined/);
    const parts = message.slice(separator + 4).split(`--${boundary}`).slice(1, -1);
    assert.equal(parts.length, 2);
    for (const [index, part] of parts.entries()) {
      const partSeparator = part.indexOf("\r\n\r\n");
      assert.ok(partSeparator > 0, "each MIME part must separate headers from its body");
      assert.match(part.slice(0, partSeparator), /Content-Transfer-Encoding: base64/);
      assert.equal(Buffer.from(part.slice(partSeparator + 4).trim(), "base64").toString("utf8"), index === 0 ? content.text : content.html);
    }
    assert.ok(message.endsWith(`--${boundary}--\r\n\r\n.\r\n`));
  }
});

test("SMTP open and greeting stalls time out and close the socket", async () => {
  for (const mode of [{ hangOpened: true }, { hangGreeting: true }]) {
    const connection = connector(mode);
    await assert.rejects(sendSmtpEmail(options, { ...connection, timeoutMs: 20 }), /timed out/);
    assert.equal(connection.isClosed(), true);
  }
});

test("acknowledged DATA remains successful when QUIT times out", async () => {
  const connection = connector({ hangQuit: true });
  await sendSmtpEmail(options, { ...connection, timeoutMs: 20 });
  assert.equal(connection.isClosed(), true);
});

test("rejected DATA fails delivery, while normal delivery closes cleanly", async () => {
  const rejected = connector({ rejectData: true });
  await assert.rejects(sendSmtpEmail(options, { ...rejected, timeoutMs: 100 }), /550/);
  assert.equal(rejected.isClosed(), true);
  const normal = connector();
  await sendSmtpEmail(options, { ...normal, timeoutMs: 100 });
  assert.equal(normal.isClosed(), true);
});

test("feedback finalizes acknowledged delivery despite QUIT failure and blocks a resend", async () => {
  let reserved = false, delivered = false, sendCount = 0;
  const service = createFeedbackService({
    reserve: async () => reserved ? { accepted: false, reason: "duplicate" } : (reserved = true, { accepted: true, reservationId: "qa" }),
    finalize: async (_, result) => { delivered = result; },
    deliver: async () => { sendCount += 1; await sendSmtpEmail(options, { ...connector({ hangQuit: true }), timeoutMs: 20 }); },
  });
  const input = { actorId: "designated-qa", input: { category: "bug", message: "Clearly marked synthetic SMTP QA verification." } };
  assert.equal((await service.submit(input)).status, 202);
  assert.equal(delivered, true);
  const duplicate = await service.submit(input);
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.error, /already being handled/);
  assert.equal(sendCount, 1);
});
