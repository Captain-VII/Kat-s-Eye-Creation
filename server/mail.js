// Envoi des e-mails (SMTP_URL, ex. smtps://utilisateur:motdepasse@smtp.exemple.fr:465).
import nodemailer from 'nodemailer';

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

export async function sendMail(msg) {
  if (!transport) return console.log(`[mail non envoyé : SMTP_URL absent] ${msg.to} — ${msg.subject}`);
  try { await transport.sendMail({ from: process.env.MAIL_FROM, ...msg }); }
  catch (e) { console.error(`Mail vers ${msg.to} non envoyé :`, e.message); }
}
