import prisma from '@openloaf/db'

async function main() {
  const messages = await prisma.emailMessage.findMany()
  for (const m of messages) {
    console.log(JSON.stringify({ id: m.id, subject: m.subject, wsId: m.workspaceId, account: m.accountEmail, mailboxPath: m.mailboxPath }))
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })
