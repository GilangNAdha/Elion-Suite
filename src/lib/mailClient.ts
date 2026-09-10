// Renderer menuju vault mail di main process — token tidak pernah ke sini,
// apalagi ke model. Tanpa bridge desktop (web build), semua operasi jujur
// melaporkan diri belum terkonfigurasi.

export interface MailMessage {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
  body?: string
}

export interface MailStatus {
  configured: boolean
  desktop: boolean
  account?: string | null
  hasClient?: boolean
  myEmail?: string | null
  reason?: string
}

interface MailBridge {
  status: () => Promise<{ configured: boolean; account?: string | null; hasClient?: boolean; myEmail?: string | null }>
  saveClient: (clientId: string, clientSecret: string) => Promise<true>
  saveMyEmail: (email: string) => Promise<true>
  connect: () => Promise<{ account: string | null }>
  disconnect: () => Promise<true>
  list: (query?: string, max?: number) => Promise<MailMessage[]>
  read: (id: string) => Promise<MailMessage>
  send: (to: string, subject: string, body: string) => Promise<{ id: string }>
}

const bridge = (): MailBridge | undefined =>
  (window as unknown as { elion?: { mail?: MailBridge } }).elion?.mail

export const isMailDesktop = () => bridge() !== undefined

export const MAIL_DESKTOP_ONLY =
  'Mail needs the desktop app: sign-in and the token vault live in the Electron main process.'

export async function mailStatus(): Promise<MailStatus> {
  const mail = bridge()
  if (!mail) return { configured: false, desktop: false, reason: MAIL_DESKTOP_ONLY }
  const s = await mail.status()
  return { ...s, desktop: true }
}

export async function saveMailClient(clientId: string, clientSecret: string): Promise<void> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  await mail.saveClient(clientId, clientSecret)
}

export async function saveMyEmail(email: string): Promise<void> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  await mail.saveMyEmail(email)
}

export async function connectMail(): Promise<string | null> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  return (await mail.connect()).account
}

export async function disconnectMail(): Promise<void> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  await mail.disconnect()
}

export async function mailList(query?: string, max?: number): Promise<MailMessage[]> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  return mail.list(query, max)
}

export async function mailRead(id: string): Promise<MailMessage> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  return mail.read(id)
}

export async function mailSend(to: string, subject: string, body: string): Promise<string> {
  const mail = bridge()
  if (!mail) throw new Error(MAIL_DESKTOP_ONLY)
  return (await mail.send(to, subject, body)).id
}
