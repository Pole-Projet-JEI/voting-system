import nodemailer from "nodemailer";

// SMTP settings come from the environment so any provider works
// (JEI mail server, Gmail app password, Brevo/other SMTP relay).
//   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" for port 465),
//   SMTP_USER, SMTP_PASS, MAIL_FROM ("JEI Voting <no-reply@jeinsat.com>")
let transporter = null;

export const isMailerConfigured = () => Boolean(process.env.SMTP_HOST);

const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      // Pooled connections: ~600 codes go out in a few minutes at event start.
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 5),
      maxMessages: 200,
    });
  }
  return transporter;
};

export const buildLoginEmail = (code) => ({
  subject: `${code} is your voting code`,
  text: `Your voting code is ${code}\n\nEnter it on the voting page. It expires in 10 minutes.\nIf you did not ask for it, ignore this email.`,
  html: `<div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
  <p>Your voting code is:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
  <p>Enter it on the voting page. It expires in 10 minutes.</p>
  <p style="color:#666;font-size:13px">If you did not ask for it, ignore this email.</p>
</div>`,
});

// Returns { sent: true } or throws. Without SMTP outside production the code
// is printed to the server log so the flow can be tested locally.
export const sendLoginCode = async (email, code, { transport } = {}) => {
  const message = buildLoginEmail(code);

  if (!transport && !isMailerConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured");
    }
    console.info(JSON.stringify({ event: "dev_login_code", email, code }));
    return { sent: true, dev: true };
  }

  await (transport || getTransporter()).sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    ...message,
  });
  return { sent: true };
};
