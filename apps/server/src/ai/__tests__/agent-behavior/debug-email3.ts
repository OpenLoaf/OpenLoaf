import prisma from '@openloaf/db'

async function main() {
  const mailboxes = await prisma.emailMailbox.findMany()
  for (const m of mailboxes) {
    console.log('mailbox:', m.id, m.name, 'wsId:', m.workspaceId)
  }
  const messages = await prisma.emailMessage.findMany()
  for (const m of messages) {
    console.log('message:', m.id, m.subject, 'mailboxId:', m.mailboxId)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })
