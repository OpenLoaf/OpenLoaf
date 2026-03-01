import prisma from '@openloaf/db'

async function main() {
  const messages = await prisma.emailMessage.findMany({ include: { mailbox: true } })
  console.log('Messages:', JSON.stringify(messages.map(m => ({
    id: m.id,
    subject: m.subject,
    workspaceId: m.mailbox?.workspaceId ?? 'N/A',
    mailboxId: m.mailboxId,
    mailboxName: m.mailbox?.name ?? 'N/A',
  })), null, 2))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
