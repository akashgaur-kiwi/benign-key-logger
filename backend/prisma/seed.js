import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ensureSystemRoles } from '../src/services/access.js';

const p = new PrismaClient();
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dk = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const at = (h, m = 0, dd = 0) => new Date(today.getTime() + dd * 86400000 + (h * 60 + m) * 60000);
const pick = a => a[Math.floor(Math.random() * a.length)];

async function main() {
  await p.$transaction([
    p.clientActionPending.deleteMany(), p.interview.deleteMany(), p.pipelineEvent.deleteMany(),
    p.submission.deleteMany(), p.requirementAssignee.deleteMany(), p.requirement.deleteMany(),
    p.callLog.deleteMany(), p.emailLog.deleteMany(), p.attendance.deleteMany(),
    p.appLifecycleEvent.deleteMany(), p.appUsageSummary.deleteMany(), p.ceipalLog.deleteMany(),
    p.linkedInLog.deleteMany(), p.auditLog.deleteMany(), p.user.deleteMany()
  ]);

  const passwordHash = await bcrypt.hash('Password@123', 10);
  let n = 1;
  const mk = (fullName, role, extra = {}) => p.user.create({
    data: {
      fullName, role, passwordHash,
      email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@worknovas.com`,
      employeeCode: `WN${String(n++).padStart(3, '0')}`,
      isOnline: Math.random() > 0.15,
      productivityScore: 60 + Math.floor(Math.random() * 40),
      ...extra
    }
  });

  const admin = await mk('Chandan Kumar', 'OWNER_ADMIN', { department: 'Leadership', email: 'admin@worknovas.com', isOnline: true });
  await mk('Meera Iyer', 'HR_ADMIN', { department: 'HR', managerId: admin.id });
  const ams = {};
  for (const nm of ['Rohan Mehta', 'Priya Shah', 'Sarah Khan']) {
    ams[nm] = await mk(nm, 'ACCOUNT_MANAGER', { managerId: admin.id, teamTag: 'US IT' });
  }
  const recs = {};
  const recNames = ['Amit Sharma', 'Neha Verma', 'Rahul Singh', 'Karan Kapoor', 'Pooja Nair', 'Vikram Rao', 'Ananya Das', 'Sanjay Gupta'];
  for (const [i, nm] of recNames.entries()) {
    const am = Object.values(ams)[i % 3];
    recs[nm] = await mk(nm, 'RECRUITER', { managerId: am.id, teamTag: pick(['US IT', 'Engineering', 'Healthcare']) });
  }
  const recList = Object.values(recs);

  const reqDefs = [
    ['Senior Java Developer', 'Blackstone', 'Rohan Mehta', 'CRITICAL', 12],
    ['DevOps Engineer', 'Tenarai', 'Rohan Mehta', 'HOT', 6],
    ['Python Developer', 'Blackstone', 'Rohan Mehta', 'NORMAL', 2],
    ['Data Engineer', 'Apex', 'Priya Shah', 'CRITICAL', 9],
    ['Cloud Security Lead', 'Apex', 'Priya Shah', 'HOT', 4],
    ['QA Automation Lead', 'Nova Health', 'Priya Shah', 'NORMAL', 3],
    ['Salesforce Architect', 'GreyRock', 'Sarah Khan', 'CRITICAL', 15],
    ['React Developer', 'Metro', 'Sarah Khan', 'NORMAL', 0],
    ['Network Engineer', 'Tenarai', 'Rohan Mehta', 'NORMAL', 0]
  ];
  const reqs = {};
  for (const [jobTitle, clientName, am, priority, age] of reqDefs) {
    reqs[jobTitle] = await p.requirement.create({
      data: {
        jobTitle, clientName, priority, accountManagerId: ams[am].id,
        openPositions: 1 + Math.floor(Math.random() * 3),
        receivedAt: new Date(now.getTime() - age * 86400000),
        createdAt: new Date(now.getTime() - age * 86400000),
        ageInDays: age,
        assignees: { create: recList.slice(0, 3).map((_, k) => ({ recruiterId: recList[(age + k) % recList.length].id })) }
      }
    });
  }

  const named = [
    ['Nisha Patel', 'Senior Java Developer', 'INTERVIEW', 'Amit Sharma', 'Today 11:00', at(11)],
    ['Daniel Kim', 'Data Engineer', 'CLIENT_SUBMITTED', 'Neha Verma', 'Today 14:30', at(14, 30)],
    ['Marcus Lee', 'DevOps Engineer', 'INTERVIEW', 'Amit Sharma', 'Today 16:00', at(16)],
    ['Carlos Diaz', 'Cloud Security Lead', 'TIER1_SUBMITTED', 'Rahul Singh', 'Tomorrow', at(10, 0, 1)],
    ['Simran Kaur', 'QA Automation Lead', 'SCREENED', 'Karan Kapoor', 'Next week', at(10, 0, 7)]
  ];
  const subs = {};
  for (const [nm, job, stage, rec, nextAction, due] of named) {
    subs[nm] = await p.submission.create({
      data: {
        candidateName: nm, currentStage: stage, nextAction, actionDueDate: due,
        requirementId: reqs[job].id, recruiterId: recs[rec].id,
        candidateEmail: `${nm.toLowerCase().replace(' ', '.')}@mail.com`,
        events: { create: { stage } }
      }
    });
  }

  const first = ['Arjun', 'Maya', 'Leo', 'Zara', 'Ethan', 'Ira', 'Noah', 'Kavya', 'Liam', 'Tara', 'Omar', 'Riya'];
  const last = ['Shah', 'Brown', 'Reddy', 'Clark', 'Menon', 'Lopez', 'Bose', 'Hall'];
  const dist = [['SOURCED', 40], ['SCREENED', 25], ['TIER1_SUBMITTED', 14], ['CLIENT_SUBMITTED', 8], ['INTERVIEW', 3], ['OFFER', 2], ['START', 3], ['REJECTED', 6]];
  const reqArr = Object.values(reqs);
  const bulk = [];
  for (const [stage, cnt] of dist) {
    for (let i = 0; i < cnt; i++) {
      bulk.push({
        candidateName: `${pick(first)} ${pick(last)}`, currentStage: stage,
        requirementId: pick(reqArr).id, recruiterId: pick(recList).id,
        createdAt: new Date(now.getTime() - Math.random() * 10 * 86400000)
      });
    }
  }
  await p.submission.createMany({ data: bulk });

  const iv = [
    ['Nisha Patel', 'Tier-1 Interview', at(11), 'SCHEDULED'],
    ['Carlos Diaz', 'Client Interview', at(13), 'CONFIRMED'],
    ['Daniel Kim', 'Client Interview', at(14, 30), 'CONFIRMED'],
    ['Marcus Lee', 'Client Interview', at(16), 'AWAITING_CONFIRMATION'],
    ['Simran Kaur', 'Tier-1 Interview', at(11, 0, 1), 'SCHEDULED']
  ];
  for (const [nm, roundType, scheduledTime, status] of iv) {
    const s = subs[nm];
    const rq = reqArr.find(r => r.id === s.requirementId);
    await p.interview.create({
      data: {
        submissionId: s.id, requirementId: s.requirementId, recruiterId: s.recruiterId,
        candidateName: nm, jobTitle: rq.jobTitle, clientName: rq.clientName, roundType, scheduledTime, status
      }
    });
  }
  for (const nm of ['Nisha Patel', 'Daniel Kim', 'Marcus Lee']) {
    const s = subs[nm];
    const rq = reqArr.find(r => r.id === s.requirementId);
    await p.interview.create({
      data: {
        submissionId: s.id, requirementId: s.requirementId, recruiterId: s.recruiterId,
        candidateName: nm, jobTitle: rq.jobTitle, clientName: rq.clientName, roundType: 'Tier-1 Interview',
        scheduledTime: at(15, 0, -1), status: 'FEEDBACK_PENDING', feedbackDue: true
      }
    });
  }

  await p.clientActionPending.createMany({
    data: [
      { clientName: 'Blackstone', actionType: 'Interview feedback', candidateRef: 'Nisha Patel', dueInHours: 2 },
      { clientName: 'Apex', actionType: 'Profile review', candidateRef: '4 candidates', dueInHours: 6 },
      { clientName: 'Tenarai', actionType: 'Rate confirmation', candidateRef: 'DevOps Engineer', dueInHours: 24 },
      { clientName: 'Nova Health', actionType: 'Start-date approval', candidateRef: 'Daniel Kim', dueInHours: 24 }
    ]
  });

  const users = await p.user.findMany();
  const outcomes = ['CONNECTED', 'CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'FAILED'];
  const calls = [], mails = [], att = [];
  for (const u of users) {
    const late = Math.random() < 0.15;
    const absent = Math.random() < 0.08;
    if (!absent) att.push({ userId: u.id, date: dk, clockIn: at(late ? 10 : 9, Math.floor(Math.random() * 40)), status: late ? 'LATE' : 'PRESENT', isLate: late });
    if (u.role !== 'RECRUITER') continue;
    for (let i = 0; i < 10 + Math.floor(Math.random() * 30); i++) {
      const o = pick(outcomes);
      calls.push({ userId: u.id, targetNumber: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, outcome: o, durationSec: o === 'CONNECTED' ? 60 + Math.floor(Math.random() * 600) : 0, timestamp: at(9, Math.floor(Math.random() * 360)) });
    }
    for (let i = 0; i < 8 + Math.floor(Math.random() * 20); i++) {
      mails.push({ userId: u.id, messageId: `seed-${u.id}-${i}`, recipient: `c${i}@mail.com`, category: pick(['CANDIDATE', 'CANDIDATE', 'CLIENT', 'INTERNAL']), timestamp: at(9, Math.floor(Math.random() * 360)) });
    }
  }
  await p.attendance.createMany({ data: att });
  await p.callLog.createMany({ data: calls });
  await p.emailLog.createMany({ data: mails });
  await p.ceipalLog.create({ data: { userId: recList[0].id, ceipalCandId: 'C-1001', actionType: 'RESUME_UPLOAD', timestamp: new Date(now.getTime() - 4 * 60000) } });

  await ensureSystemRoles();
  console.log('Seeded. Login: admin@worknovas.com / Password@123');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
