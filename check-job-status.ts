import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJobStatus() {
  try {
    const jobs = await prisma.processingJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (jobs.length === 0) {
      console.log(`[${new Date().toISOString()}] No jobs found in database`);
      process.exit(0);
    }

    const job = jobs[0];
    console.log(`[${new Date().toISOString()}] Job Status: { status: '${job.status}', processedPages: ${job.processedPages}, totalPages: ${job.totalPages} }`);
    process.exit(0);
  } catch (error) {
    console.error('Error checking job status:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkJobStatus();
