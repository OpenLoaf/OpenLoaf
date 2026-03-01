import prisma from '@openloaf/db'

async function main() {
  const messages = await prisma.emailMessage.findMany()
  console.log('Messages:', JSON.stringify(messages.map(m => ({
    id: m.id,
    subject: m.subject,
    workspaceId: m.workspaceId,
    mailboxPath: m.mailboxPath,
  })), null, 2))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
