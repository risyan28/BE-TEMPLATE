import { PrismaClient } from '@prisma/client'

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:4001/api'
const prisma = new PrismaClient()

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`,
    )
  }

  return body
}

async function login(username) {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  })
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function looksLikeUuid(value) {
  return /^[0-9a-fA-F-]{36}$/.test(value)
}

async function main() {
  await prisma.notificationLog.deleteMany()
  await prisma.quotation.deleteMany()

  const sari = await login('sari')
  const eka = await login('eka')
  const hikmah = await login('hikmah')

  const salesPics = await request('/users?role=SALES_PIC', {
    headers: authHeaders(sari.token),
  })
  const ekaUser = salesPics.find((user) => user.username === 'eka')

  if (!ekaUser) {
    throw new Error('Sales PIC eka tidak ditemukan di endpoint /users')
  }

  const before = await request('/quotations', {
    headers: authHeaders(sari.token),
  })

  const created = await request('/quotations', {
    method: 'POST',
    headers: authHeaders(sari.token),
    body: JSON.stringify({
      salesPicId: ekaUser.id,
      quotationNumber: 'QT-UUID-TRIAL-001',
      customerName: 'Workflow Trial Customer',
      quotationDate: '2026-03-28',
      priority: 'High',
      totalValue: 'Rp 11.500.000',
      notes: 'UUID workflow trial',
      attachments: [{ name: 'trial.pdf', size: '12 KB', type: 'PDF' }],
    }),
  })

  await new Promise((resolve) => setTimeout(resolve, 750))

  const ekaNotificationsAfterCreate = await request('/notifications', {
    headers: authHeaders(eka.token),
  })

  const submitted = await request(`/quotations/${created.id}/submit`, {
    method: 'PATCH',
    headers: authHeaders(eka.token),
  })

  await new Promise((resolve) => setTimeout(resolve, 750))

  const hikmahNotificationsAfterSubmit = await request('/notifications', {
    headers: authHeaders(hikmah.token),
  })
  const sariNotificationsAfterSubmit = await request('/notifications', {
    headers: authHeaders(sari.token),
  })

  const approved = await request(`/quotations/${created.id}/approve`, {
    method: 'PATCH',
    headers: authHeaders(hikmah.token),
  })

  await new Promise((resolve) => setTimeout(resolve, 750))

  const sariNotificationsAfterApprove = await request('/notifications', {
    headers: authHeaders(sari.token),
  })
  const ekaNotificationsAfterApprove = await request('/notifications', {
    headers: authHeaders(eka.token),
  })

  const finalQuotation = await request(`/quotations/${created.id}`, {
    headers: authHeaders(sari.token),
  })

  const result = {
    seededUserIds: {
      sari: sari.user.id,
      eka: eka.user.id,
      hikmah: hikmah.user.id,
    },
    quotationTableCountBeforeCreate: before.length,
    createdQuotation: {
      id: created.id,
      quotationNumber: created.quotationNumber,
      status: created.status,
      assistanceId: created.assistanceId,
      salesPicId: created.salesPicId,
      managerId: created.managerId,
    },
    submittedStatus: submitted.status,
    approvedStatus: approved.status,
    uuidShapeCheck: {
      userIdsLookLikeUuid:
        looksLikeUuid(sari.user.id) &&
        looksLikeUuid(eka.user.id) &&
        looksLikeUuid(hikmah.user.id),
      quotationIdLooksLikeUuid: looksLikeUuid(created.id),
    },
    notifications: {
      ekaAfterCreate: ekaNotificationsAfterCreate.notifications[0] ?? null,
      hikmahAfterSubmit:
        hikmahNotificationsAfterSubmit.notifications[0] ?? null,
      sariAfterSubmit: sariNotificationsAfterSubmit.notifications[0] ?? null,
      sariAfterApprove: sariNotificationsAfterApprove.notifications[0] ?? null,
      ekaAfterApprove: ekaNotificationsAfterApprove.notifications[0] ?? null,
    },
    finalQuotation: {
      id: finalQuotation.id,
      quotationNumber: finalQuotation.quotationNumber,
      status: finalQuotation.status,
      sentToCustomerAt: finalQuotation.sentToCustomerAt,
    },
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
